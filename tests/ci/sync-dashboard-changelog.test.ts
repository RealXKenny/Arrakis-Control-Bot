import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function dashboard(): { root: string; target: string } {
  const root = mkdtempSync(path.join(tmpdir(), "arrakis-changelog-"));
  directories.push(root);
  mkdirSync(path.join(root, "docs", "changelog"), { recursive: true });
  return { root, target: path.join(root, "docs", "changelog", "bot.md") };
}

function sync(root: string): void {
  execFileSync(process.execPath, [path.resolve("scripts/sync-dashboard-changelog.mjs"), root], { stdio: "pipe" });
}

describe("dashboard changelog synchronization", () => {
  it("copies released bot history deterministically without unreleased notes", () => {
    const { root, target } = dashboard();
    sync(root);
    const first = readFileSync(target, "utf8");
    expect(first).toContain("## [1.11.7]");
    expect(first).not.toContain("## [Unreleased]");
    sync(root);
    expect(readFileSync(target, "utf8")).toBe(first);
  });

  it("does not overwrite an unrelated file", () => {
    const { root, target } = dashboard();
    writeFileSync(target, "Other developer's notes\n");
    expect(() => sync(root)).toThrow();
    expect(readFileSync(target, "utf8")).toBe("Other developer's notes\n");
  });
});
