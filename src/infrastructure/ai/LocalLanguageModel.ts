import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ChatbotAiConfig } from "../config/chatbot";

/**
 * The chatbot's own language model, run inside the bot process with llama.cpp on the CPU.
 * Nothing is sent to an outside AI service: the model file is downloaded once from Hugging Face,
 * checked against its SHA-256, and then answers locally. Anything that goes wrong (not enough
 * memory, a bad download, a slow answer) leaves the chatbot on its rule-based answers.
 */

interface ChatTurn {
  user: string;
  bot: string;
}

interface ModelRequest {
  system: string;
  history: readonly ChatTurn[];
  message: string;
}

type ModelState = "idle" | "downloading" | "loading" | "ready" | "failed";

interface ModelLog {
  info(message: string): void;
  warn(message: string): void;
}

/** What the model needs from node-llama-cpp, so tests can swap in a fake engine. */
interface ModelEngine {
  /** Downloads the model file into `dir` (or finds it there) and returns its path. */
  download(uri: string, dir: string): Promise<string>;
  load(file: string, options: { threads: number; contextSize: number }): Promise<LoadedModel>;
}

interface LoadedModel {
  generate(request: ModelRequest, options: { maxTokens: number; signal: AbortSignal }): Promise<string>;
  dispose(): Promise<void>;
}

/** Most questions waiting for the model; past this, members get the rule-based answer at once. */
const MAX_QUEUE = 4;
/** Memory llama.cpp needs beyond the model file (context, buffers), plus room for the bot itself. */
const MEMORY_HEADROOM_BYTES = 1_200_000_000;

class LocalLanguageModel {
  private state: ModelState = "idle";
  private model?: LoadedModel;
  private queue: Promise<unknown> = Promise.resolve();
  private waiting = 0;
  private stopped = false;

  public constructor(
    private readonly config: ChatbotAiConfig,
    private readonly log: ModelLog,
    private readonly engine: ModelEngine = llamaCppEngine(),
    private readonly memoryLimit: () => Promise<number | null> = containerMemoryLimit,
  ) {}

  public get status(): ModelState {
    return this.state;
  }

  public get ready(): boolean {
    return this.state === "ready";
  }

  /** Download and load the model in the background. Safe to call often; only the first call starts it. */
  public warmUp(): void {
    if (this.state !== "idle" || this.stopped) return;
    this.state = "downloading";
    void this.start().catch((error: unknown) => {
      this.state = "failed";
      this.log.warn(`The chatbot's AI model is off; it keeps answering with its own rules. ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  /** The model's answer, or null when it isn't ready, is busy, or took too long. */
  public async generate(request: ModelRequest): Promise<string | null> {
    if (!this.ready || this.waiting >= MAX_QUEUE) return null;
    this.waiting += 1;
    const run = this.queue.then(async () => {
      const model = this.model;
      if (!model || this.stopped) return null;
      const signal = AbortSignal.timeout(this.config.timeoutSeconds * 1_000);
      return await model.generate(request, { maxTokens: this.config.maxTokens, signal });
    });
    this.queue = run.catch(() => undefined);
    try {
      return cleanOutput(await run);
    } catch (error: unknown) {
      if (!(error instanceof Error && /abort|timeout/i.test(`${error.name} ${error.message}`))) this.log.warn(`The AI model failed to answer: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    } finally {
      this.waiting -= 1;
    }
  }

  public async stop(): Promise<void> {
    this.stopped = true;
    const model = this.model;
    this.model = undefined;
    if (this.state === "ready") this.state = "idle";
    await model?.dispose().catch(() => undefined);
  }

  private async start(): Promise<void> {
    const dir = path.resolve(this.config.modelDir);
    await mkdir(dir, { recursive: true });
    this.log.info(`Preparing the chatbot's AI model (${this.config.modelUri}). The first download can take a few minutes.`);
    const file = await this.engine.download(this.config.modelUri, dir);
    if (this.config.sha256) await verifyChecksum(file, this.config.sha256);

    const size = (await stat(file)).size;
    const limit = await this.memoryLimit();
    if (limit !== null && size + MEMORY_HEADROOM_BYTES > limit) {
      throw new Error(`The model needs about ${gigabytes(size + MEMORY_HEADROOM_BYTES)} of memory, but the bot only has ${gigabytes(limit)}. Give the server more memory or use CHATBOT_AI_MODEL=small.`);
    }
    if (this.stopped) return;
    this.state = "loading";
    const model = await this.engine.load(file, { threads: this.config.threads, contextSize: this.config.contextSize });
    if (this.stopped) {
      await model.dispose();
      return;
    }
    this.model = model;
    this.state = "ready";
    this.log.info(`The chatbot's AI model is ready (${gigabytes(size)}, ${this.config.threads} CPU threads).`);
  }
}

/** Reads the whole file once; a mismatch deletes it so the next start downloads it again. */
async function verifyChecksum(file: string, expected: string): Promise<void> {
  const marker = `${file}.sha256`;
  const known = await readFile(marker, "utf8").catch(() => "");
  if (known.trim() === expected) return;
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  const actual = hash.digest("hex");
  if (actual !== expected) {
    await rm(file, { force: true });
    throw new Error(`The downloaded model failed its checksum (got ${actual.slice(0, 12)}…), so it was deleted.`);
  }
  const temp = `${marker}.tmp`;
  await writeFile(temp, `${expected}\n`);
  await rename(temp, marker);
}

/** The container's memory limit (cgroup v2, then v1), or null when there is none to read. */
async function containerMemoryLimit(): Promise<number | null> {
  for (const file of ["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]) {
    const value = (await readFile(file, "utf8").catch(() => "")).trim();
    const bytes = Number(value);
    if (value && value !== "max" && Number.isFinite(bytes) && bytes > 0 && bytes < 2 ** 50) return bytes;
  }
  return null;
}

/** Plain, short Discord text: no pings, no runaway length, no echoed role labels. */
function cleanOutput(value: string | null): string | null {
  if (!value) return null;
  const text = value
    .replace(/^\s*(?:assistant|arrakis control|bot)\s*:\s*/i, "")
    .replace(/@(everyone|here)/gi, "@​$1")
    .replace(/<@[!&]?\d+>/g, "")
    .trim();
  if (!text) return null;
  return text.length > 1_500 ? `${text.slice(0, 1_497).replace(/\s+\S*$/, "")}…` : text;
}

function gigabytes(bytes: number): string {
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}

/** node-llama-cpp on the CPU, loaded only when the AI is turned on. */
function llamaCppEngine(): ModelEngine {
  const library = () => import("node-llama-cpp");
  return {
    async download(uri, dir) {
      const { createModelDownloader } = await library();
      const downloader = await createModelDownloader({ modelUri: uri, dirPath: dir, skipExisting: true, showCliProgress: false, deleteTempFileOnCancel: true });
      return await downloader.download();
    },
    async load(file, options) {
      const { getLlama, LlamaChatSession, LlamaLogLevel } = await library();
      const llama = await getLlama({ gpu: false, build: "never", logLevel: LlamaLogLevel.error });
      const model = await llama.loadModel({ modelPath: file, gpuLayers: 0 });
      const context = await model.createContext({ contextSize: options.contextSize, threads: options.threads, sequences: 1 });
      const sequence = context.getSequence();
      return {
        async generate(request, generation) {
          await sequence.clearHistory();
          const session = new LlamaChatSession({ contextSequence: sequence, systemPrompt: request.system, autoDisposeSequence: false });
          try {
            session.setChatHistory([
              { type: "system", text: request.system },
              ...request.history.flatMap((turn) => [{ type: "user" as const, text: turn.user }, { type: "model" as const, response: [turn.bot] }]),
            ]);
            return await session.prompt(request.message, { maxTokens: generation.maxTokens, temperature: 0.7, topP: 0.9, signal: generation.signal, stopOnAbortSignal: false });
          } finally {
            session.dispose({ disposeSequence: false });
          }
        },
        async dispose() {
          await context.dispose();
          await model.dispose();
          await llama.dispose();
        },
      };
    },
  };
}

export { LocalLanguageModel, cleanOutput, containerMemoryLimit };
export type { ChatTurn, LoadedModel, ModelEngine, ModelRequest, ModelState };
