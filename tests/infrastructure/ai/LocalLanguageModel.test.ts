import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalLanguageModel, cleanOutput, type ModelEngine } from "../../../src/infrastructure/ai/LocalLanguageModel";
import type { ChatbotAiConfig } from "../../../src/infrastructure/config/chatbot";

const CONTENT = "pretend model weights";
const SHA = createHash("sha256").update(CONTENT).digest("hex");
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function setup(overrides: Partial<ChatbotAiConfig> = {}, answer: (message: string) => Promise<string> = (message) => Promise.resolve(`You said ${message}`), memory: { limit: number; used: number } | null = null) {
  const dir = await mkdtemp(path.join(tmpdir(), "arrakis-ai-"));
  dirs.push(dir);
  const log = { info: vi.fn(), warn: vi.fn() };
  const dispose = vi.fn(() => Promise.resolve());
  const engine: ModelEngine = {
    download: vi.fn(async (_uri: string, target: string) => {
      const file = path.join(target, "model.gguf");
      await writeFile(file, CONTENT);
      return file;
    }),
    load: vi.fn(() => Promise.resolve({ generate: (request: { message: string }) => answer(request.message), dispose })),
  };
  const config: ChatbotAiConfig = { modelUri: "hf:a/b/model.gguf", sha256: SHA, modelDir: dir, threads: 4, contextSize: 2_048, maxTokens: 100, timeoutSeconds: 5, ...overrides };
  const model = new LocalLanguageModel(config, log, engine, () => Promise.resolve(memory));
  return { model, engine, log, dir, dispose };
}

async function settle(model: LocalLanguageModel): Promise<void> {
  await vi.waitFor(() => expect(["ready", "failed"]).toContain(model.status));
}

describe("LocalLanguageModel", () => {
  it("downloads, verifies and loads the model once, then answers", async () => {
    const { model, engine, dir, dispose } = await setup();
    expect(await model.generate({ system: "s", history: [], message: "hi" })).toBeNull();
    model.warmUp();
    model.warmUp();
    await settle(model);
    expect(model.status).toBe("ready");
    expect(engine.download).toHaveBeenCalledTimes(1);
    expect(await readFile(path.join(dir, "model.gguf.sha256"), "utf8")).toBe(`${SHA}\n`);
    expect(await model.generate({ system: "s", history: [], message: "hi" })).toBe("You said hi");
    await model.stop();
    expect(dispose).toHaveBeenCalled();
    expect(await model.generate({ system: "s", history: [], message: "hi" })).toBeNull();
  });

  it("deletes a download with the wrong checksum and stays on the rules", async () => {
    const { model, dir, log } = await setup({ sha256: "0".repeat(64) });
    model.warmUp();
    await settle(model);
    expect(model.status).toBe("failed");
    await expect(stat(path.join(dir, "model.gguf"))).rejects.toThrow();
    expect(log.warn.mock.calls[0]![0]).toMatch(/checksum/);
  });

  it("refuses to load a model the container doesn't have the memory for", async () => {
    const { model, engine, log } = await setup({}, undefined, { limit: 4_000_000_000, used: 3_500_000_000 });
    model.warmUp();
    await settle(model);
    expect(model.status).toBe("failed");
    expect(engine.load).not.toHaveBeenCalled();
    expect(log.warn.mock.calls[0]![0]).toMatch(/only 0\.5 GB of the server's 4\.0 GB is free/);
  });

  it("answers one question at a time and gives up on slow or failed answers", async () => {
    let release: () => void = () => undefined;
    const order: string[] = [];
    const { model } = await setup({}, (message) => {
      order.push(message);
      if (message === "slow") return new Promise((resolve) => { release = () => resolve("done"); });
      if (message === "broken") return Promise.reject(new Error("boom"));
      return Promise.resolve(`ok ${message}`);
    });
    model.warmUp();
    await settle(model);
    const slow = model.generate({ system: "s", history: [], message: "slow" });
    const next = model.generate({ system: "s", history: [], message: "next" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(order).toEqual(["slow"]);
    release();
    expect(await slow).toBe("done");
    expect(await next).toBe("ok next");
    expect(await model.generate({ system: "s", history: [], message: "broken" })).toBeNull();
  });

  it("cleans the model's text for Discord", () => {
    expect(cleanOutput("Assistant: Hello @everyone <@123456789012345678>!")).toBe("Hello @​everyone !");
    expect(cleanOutput("   ")).toBeNull();
    expect(cleanOutput("word ".repeat(400))!.length).toBeLessThanOrEqual(1_500);
  });

  it("lets a message wait for a load in progress, up to a limit", async () => {
    let finishLoad: () => void = () => undefined;
    const { model, engine } = await setup();
    const realLoad = engine.load;
    engine.load = vi.fn((file: string, options: { threads: number; contextSize: number }) => new Promise((resolve) => { finishLoad = () => resolve(realLoad(file, options)); })) as ModelEngine["load"];
    expect(await model.whenReady(10)).toBe(false);
    await vi.waitFor(() => expect(model.status).toBe("loading"));
    const waiting = model.whenReady(5_000);
    finishLoad();
    expect(await waiting).toBe(true);
    expect(await model.whenReady(10)).toBe(true);
  });
});
