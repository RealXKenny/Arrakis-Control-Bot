import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('versioned image release', () => {
  it('publishes only after a new version passes CI', () => {
    const ci = readFileSync(resolve('.github/workflows/ci.yml'), 'utf8');
    const release = readFileSync(resolve('.github/workflows/release.yml'), 'utf8');

    expect(ci).not.toContain('docker push');
    expect(ci).toContain('merge_group:');
    expect(ci).toContain('branches: [main, v2, \'release/*\']');
    expect(ci).toContain('persist-credentials: false');
    expect(ci).toContain('needs: [checks, workflow-validation]');
    expect(ci).toContain('sha256sum --check');
    for (const workflow of [ci, release]) {
      for (const line of workflow.split(/\r?\n/).filter((value) => /\buses: /.test(value))) {
        expect(line).toMatch(/uses: [^@]+@[a-f0-9]{40}/);
      }
    }
    expect(release).toMatch(/workflow_run:[\s\S]*?branches: \[main\]/);
    expect(release).toContain('if git rev-parse --verify --quiet "refs/tags/$tag"');
    expect(release).toMatch(/- name: Build versioned image\r?\n\s+if: steps\.release\.outputs\.create == 'true'/);
    const validate = release.slice(release.indexOf('  validate:'), release.indexOf('  publish:'));
    const publish = release.slice(release.indexOf('  publish:'));
    expect(validate).not.toContain('contents: write');
    expect(validate).not.toContain('packages: write');
    expect(validate).toContain('persist-credentials: false');
    expect(validate).toContain('sha256sum --check image.tar.sha256');
    expect(publish).toContain('needs: validate');
    expect(publish).toContain("if: needs.validate.outputs.create == 'true'");
    expect(publish).toContain('contents: write');
    expect(publish).toContain('packages: write');
    expect(publish).toContain('sha256sum --check image.tar.sha256');
    expect(release).toContain('${{ steps.image.outputs.name }}:${{ steps.release.outputs.tag }}');
    expect(release).toContain('git merge-base --is-ancestor "$HEAD_SHA" refs/remotes/origin/main');
    expect(release).toContain('require(\'./package-lock.json\').packages[\'\'].version');
    expect(release).toMatch(/- name: Build checksummed source archive\r?\n\s+if: steps\.release\.outputs\.create == 'true'/);
    expect(release).toContain('git archive --format=tar.gz');
    expect(release).toContain('sha256sum "$archive"');
    expect(release).toContain('"$RUNNER_TEMP/release-assets/arrakis-control-bot-v${RELEASE_VERSION}.tar.gz.sha256"');
    expect(release.indexOf('- name: Publish versioned image')).toBeLessThan(
      release.indexOf('- name: Create GitHub release'),
    );
  });
});
