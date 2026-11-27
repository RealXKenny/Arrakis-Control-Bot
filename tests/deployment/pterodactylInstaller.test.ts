import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

const tools = ["bash", "jq", "tar", "sha256sum", "find", "readlink", "awk"];
const available = process.platform !== "win32" && tools.every((tool) => spawnSync("bash", ["-c", `command -v ${tool}`]).status === 0);
const suite = available ? describe : describe.skip;
const api = "https://api.github.com/repos/RealXKenny/Arrakis-Control-Bot/releases/latest";
const asset = "https://github.com/RealXKenny/Arrakis-Control-Bot/releases/download/v2.0.0/arrakis-control-bot-2.0.0.tar.gz";
const fixtureName = (url: string) => url.replace(/[^A-Za-z0-9._-]/g, "_");
const roots: string[] = [];

function archive(name = "arrakis-control-bot/package.json", link = false, body = "{}"): Buffer {
  return gzipSync(tarEntry(name, link, body));
}

function releaseArchive(files: Record<string, string>): Buffer {
  return gzipSync(Buffer.concat([...Object.entries(files).map(([name, body]) => tarEntry(`arrakis-control-bot/${name}`, false, body).subarray(0, -1024)), Buffer.alloc(1024)]));
}

function tarEntry(name: string, link: boolean, body: string): Buffer {
  const content = Buffer.from(body);
  const header = Buffer.alloc(512);
  header.write(name, 0, 100);
  header.write("0000644\0", 100);
  header.write("0000000\0", 108);
  header.write("0000000\0", 116);
  header.write(`${(link ? 0 : content.length).toString(8).padStart(11, "0")}\0`, 124);
  header.write("00000000000\0", 136);
  header.write("        ", 148);
  header.write(link ? "2" : "0", 156);
  if (link) header.write("../../outside", 157);
  header.write("ustar\0", 257);
  header.write("00", 263);
  header.write(`${[...header].reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, "0")}\0 `, 148);
  const padding = Buffer.alloc((512 - (content.length % 512)) % 512);
  return Buffer.concat([header, ...(link ? [] : [content, padding]), Buffer.alloc(1024)]);
}

function install(options: { payload?: Buffer; checksum?: string; metadata?: unknown; releaseTag?: string; existing?: Record<string, string> } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "arrakis-egg-test-"));
  roots.push(root);
  const bin = path.join(root, "bin");
  const fixtures = path.join(root, "fixtures");
  const server = path.join(root, "server");
  for (const directory of [bin, fixtures, server]) mkdirSync(directory);
  for (const [name, content] of Object.entries(options.existing ?? {})) {
    mkdirSync(path.dirname(path.join(server, name)), { recursive: true });
    writeFileSync(path.join(server, name), content);
  }
  const shim = (name: string, code: string) => {
    const file = path.join(bin, name);
    writeFileSync(file, `#!/bin/bash\n${code}\n`);
    chmodSync(file, 0o755);
  };
  const realRm = spawnSync("bash", ["-c", "command -v rm"], { encoding: "utf8" }).stdout.trim();
  shim("apt-get", "exit 0");
  shim("chown", "exit 0");
  shim("su", 'echo "$*" >> "$SANDBOX/su.log"');
  shim("rm", 'for arg in "$@"; do case "$arg" in /var/lib/*) exit 0;; esac; done\nexec "$REAL_RM" "$@"');
  shim("curl", [
    'url=""; out=""',
    'while [ $# -gt 0 ]; do case "$1" in --output) out="$2"; shift 2;; --header|--retry) shift 2;; --*) shift;; *) url="$1"; shift;; esac; done',
    'name=$(printf "%s" "$url" | sed "s#[^A-Za-z0-9._-]#_#g")',
    '[ -f "$SANDBOX/fixtures/$name" ] || exit 22',
    'cp "$SANDBOX/fixtures/$name" "$out"',
  ].join("\n"));
  const payload = options.payload ?? archive();
  const checksum = options.checksum ?? createHash("sha256").update(payload).digest("hex");
  const metadata = options.metadata ?? { tag_name: "v2.0.0", draft: false, prerelease: false, assets: [
    { name: "arrakis-control-bot-2.0.0.tar.gz", browser_download_url: asset },
    { name: "arrakis-control-bot-2.0.0.tar.gz.sha256", browser_download_url: `${asset}.sha256` },
  ] };
  writeFileSync(path.join(fixtures, fixtureName(api)), JSON.stringify(metadata));
  writeFileSync(path.join(fixtures, fixtureName(asset)), payload);
  writeFileSync(path.join(fixtures, fixtureName(`${asset}.sha256`)), checksum);
  const egg = JSON.parse(readFileSync(path.resolve("pterodactyl/egg-arrakis-control-bot.json"), "utf8")) as { scripts: { installation: { script: string } } };
  const script = path.join(root, "install.sh");
  writeFileSync(script, egg.scripts.installation.script.replaceAll("/mnt/server", server));
  const run = spawnSync("bash", [script], { encoding: "utf8", timeout: 30_000,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: root, SANDBOX: root, REAL_RM: realRm, RELEASE_TAG: options.releaseTag ?? "latest" } });
  return { run, server, commands: existsSync(path.join(root, "su.log")) ? readFileSync(path.join(root, "su.log"), "utf8") : "" };
}

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

suite("Pterodactyl release installer", () => {
  it("verifies and extracts the release before running the build as an unprivileged user", () => {
    const { run, server, commands } = install();
    expect(run.status, run.stderr).toBe(0);
    expect(readFileSync(path.join(server, "package.json"), "utf8")).toBe("{}");
    expect(commands).toContain("node -c");
    expect(commands).toContain("npm ci");
  });

  it("leaves an updater-managed installation and its custom files untouched on reinstall", () => {
    const existing = {
      "package.json": "{\"version\":\"2.0.0\"}",
      ".env": "TOKEN=synthetic\n",
      "certs/rabbit mq/ca.pem": "synthetic certificate\n",
      "custom dir/nested/notes.txt": "keep\n",
      "scripts/updater/supervisor.mjs": "// installed updater\n",
    };
    const { run, server, commands } = install({ existing });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain("Nothing was changed");
    for (const [name, content] of Object.entries(existing)) expect(readFileSync(path.join(server, name), "utf8")).toBe(content);
    expect(commands).toBe("");
  });

  it("adds only the updater to an install from before automatic updates, once", () => {
    const existing = {
      "package.json": "{\"version\":\"2.0.0\"}",
      ".env": "TOKEN=synthetic\n",
      "certificates/rabbitmq-server.pem": "synthetic certificate\n",
    };
    const release = {
      "package.json": JSON.stringify({ version: "2.0.2", arrakisRelease: { repository: "RealXKenny/Arrakis-Control-Bot", assetPrefix: "arrakis-control-bot", start: ["node", "dist/src/index.js"] } }),
      "scripts/updater/supervisor.mjs": "// supervisor\n",
      "scripts/updater/updater.mjs": "// updater\n",
      "src/index.ts": "// application\n",
    };
    const { run, server, commands } = install({ existing, payload: releaseArchive(release) });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain("Automatic updater added");
    for (const [name, content] of Object.entries(existing)) expect(readFileSync(path.join(server, name), "utf8")).toBe(content);
    expect(readFileSync(path.join(server, "scripts/updater/supervisor.mjs"), "utf8")).toBe("// supervisor\n");
    expect(existsSync(path.join(server, "src/index.ts"))).toBe(false);
    const bootstrap = JSON.parse(readFileSync(path.join(server, ".arrakis/bootstrap.json"), "utf8")) as { release: { repository: string }; files: Record<string, string> };
    expect(bootstrap.release.repository).toBe("RealXKenny/Arrakis-Control-Bot");
    expect(bootstrap.files).toEqual({
      "scripts/updater/supervisor.mjs": createHash("sha256").update("// supervisor\n").digest("hex"),
      "scripts/updater/updater.mjs": createHash("sha256").update("// updater\n").digest("hex"),
    });
    expect(commands).toBe("");

    const again = install({ existing: { ...existing, "scripts/updater/supervisor.mjs": "// supervisor\n" }, payload: releaseArchive(release) });
    expect(again.run.stdout).toContain("Nothing was changed");
  });

  it("changes nothing when the release has no updater to add", () => {
    const existing = { "package.json": "{\"version\":\"2.0.0\"}" };
    const { run, server } = install({ existing, payload: releaseArchive({ "package.json": "{\"version\":\"2.0.0\"}" }) });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("does not include the automatic updater");
    expect(existsSync(path.join(server, "scripts"))).toBe(false);
    expect(existsSync(path.join(server, ".arrakis"))).toBe(false);
  });

  it("refuses a bad checksum before extraction", () => {
    const { run, server, commands } = install({ checksum: "0".repeat(64) });
    expect(run.status).not.toBe(0);
    expect(existsSync(path.join(server, "package.json"))).toBe(false);
    expect(commands).toBe("");
  });

  it.each([archive("../outside"), archive("arrakis-control-bot/link", true)])("rejects unsafe archive entries", (payload) => {
    const { run, commands } = install({ payload });
    expect(run.status).not.toBe(0);
    expect(commands).toBe("");
  });

  it("rejects untrusted asset URLs and invalid release tags", () => {
    const metadata = { tag_name: "v2.0.0", draft: false, prerelease: false, assets: [
      { name: "arrakis-control-bot-2.0.0.tar.gz", browser_download_url: "https://evil.example/archive" },
      { name: "arrakis-control-bot-2.0.0.tar.gz.sha256", browser_download_url: "https://evil.example/archive.sha256" },
    ] };
    expect(install({ metadata }).run.status).not.toBe(0);
    expect(install({ releaseTag: "v2.0.0/../../x" }).run.status).not.toBe(0);
  });
});
