import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('versioned image release', () => {
  it('publishes only after a new version passes CI', () => {
    const ci = readFileSync(resolve('.github/workflows/ci.yml'), 'utf8');
    const release = readFileSync(resolve('.github/workflows/release.yml'), 'utf8');

    expect(ci).not.toContain('docker push');
    expect(release).toMatch(/workflow_run:[\s\S]*?branches: \[main\]/);
    expect(release).toContain('if git rev-parse --verify --quiet "refs/tags/$tag"');
    expect(release).toMatch(/- name: Build versioned image\r?\n\s+if: steps\.release\.outputs\.create == 'true'/);
    expect(release).toMatch(/- name: Publish versioned image\r?\n\s+if: steps\.release\.outputs\.create == 'true'/);
    expect(release).toContain('${{ steps.image.outputs.name }}:${{ steps.release.outputs.tag }}');
    expect(release).toContain('git merge-base --is-ancestor "$HEAD_SHA" refs/remotes/origin/main');
    expect(release).toContain('require(\'./package-lock.json\').packages[\'\'].version');
    expect(release).toMatch(/- name: Build checksummed source archive\r?\n\s+if: steps\.release\.outputs\.create == 'true'/);
    expect(release).toContain('git archive --format=tar.gz');
    expect(release).toContain('sha256sum "$archive"');
    expect(release).toContain('"$RUNNER_TEMP/arrakis-control-bot-v${RELEASE_VERSION}.tar.gz.sha256"');
    expect(release.indexOf('- name: Publish versioned image')).toBeLessThan(
      release.indexOf('- name: Create GitHub release'),
    );
  });
});
