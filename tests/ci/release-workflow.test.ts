import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("source archive release", () => {
  it("validates main CI and checksummed assets before granting release write permissions", () => {
    const ci = readFileSync(resolve(".github/workflows/ci.yml"), "utf8");
    const release = readFileSync(resolve(".github/workflows/release.yml"), "utf8");
    expect(ci).toContain("merge_group:");
    expect(ci).toContain("branches: [main, v2, 'release/*']");
    expect(ci).toContain("needs: [checks, workflow-validation]");
    expect(ci).toContain("persist-credentials: false");
    for (const workflow of [ci, release]) {
      for (const line of workflow.split(/\r?\n/).filter((value) => /\buses: /.test(value))) {
        expect(line).toMatch(/uses: [^@]+@[a-f0-9]{40}/);
      }
    }
    const validate = release.slice(release.indexOf("  validate:"), release.indexOf("  publish:"));
    const publish = release.slice(release.indexOf("  publish:"));
    expect(validate).not.toContain("contents: write");
    expect(validate).toContain("persist-credentials: false");
    expect(validate).toContain("git merge-base --is-ancestor");
    expect(validate).toContain("require('./package-lock.json').packages[''].version");
    expect(validate).toContain("if git rev-parse --verify --quiet");
    expect(validate).toContain("node scripts/generate-pterodactyl-egg.mjs");
    expect(validate).toContain("sha256sum --check");
    expect(publish).toContain("needs: validate");
    expect(publish).toContain("contents: write");
    expect(publish).toContain("sha256sum --check");
    expect(publish).toContain('gh release create "$RELEASE_TAG" "$EGG_FILE" "$ARCHIVE_FILE" "$ARCHIVE_FILE.sha256" "$MANIFEST_FILE"');
    expect(validate).toContain("node scripts/build-release-manifest.mjs");
    expect(publish).toContain(".archive.sha256 == $sum");
    // The publish job has no checkout, so gh must be told which repository to release.
    expect(publish).toContain('--repo "$GITHUB_REPOSITORY"');
    expect(release).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(release).toContain("github.event.workflow_run.event == 'push'");
    expect(release).not.toMatch(/docker|packages: write|ghcr\.io/i);
  });
});
