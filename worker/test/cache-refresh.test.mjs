import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('manual refresh prepares a new revision and rejects unsafe or reused revision names', t => {
  const root = mkdtempSync(join(tmpdir(), 'inaayah-cache-refresh-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'worker'));
  const script = join(root, 'scripts/refresh_release_cache.py');
  copyFileSync(new URL('../../scripts/refresh_release_cache.py', import.meta.url), script);
  const config = join(root, 'worker/wrangler.toml');
  writeFileSync(config, '[vars]\nCACHE_REVISION = "previous"\nCACHE_TTL_SECONDS = 604800\n');
  assert.equal(spawnSync('python3', [script, 'v1.0.1', '--prepare-only']).status, 0);
  const updated = readFileSync(config, 'utf8');
  assert.match(updated, /CACHE_REVISION = "v1.0.1"/);
  assert.match(updated, /CACHE_TTL_SECONDS = 604800/);
  assert.notEqual(spawnSync('python3', [script, 'v1.0.1', '--prepare-only']).status, 0);
  assert.notEqual(spawnSync('python3', [script, 'invalid revision!', '--prepare-only']).status, 0);
  assert.equal(readFileSync(config, 'utf8'), updated);
});
