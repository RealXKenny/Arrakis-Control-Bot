import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('versioned image release', () => {
  it('publishes only after a new version passes CI', () => {
    const ci = readFileSync(resolve('.github/workflows/ci.yml'), 'utf8');
    const release = readFileSync(resolve('.github/workflows/release.yml'), 'utf8');

    expect(ci).not.toContain('docker push');
    expect(release).toContain('if git rev-parse --verify --quiet "refs/tags/$tag"');
    expect(release).toMatch(/- name: Build versioned image\r?\n\s+if: steps\.release\.outputs\.create == 'true'/);
    expect(release).toMatch(/- name: Publish versioned image\r?\n\s+if: steps\.release\.outputs\.create == 'true'/);
    expect(release).toContain('--tag "$IMAGE:$RELEASE_TAG"');
    expect(release.indexOf('- name: Publish versioned image')).toBeLessThan(
      release.indexOf('- name: Create GitHub release'),
    );
  });
});
