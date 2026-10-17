import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL('../local-dev.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm', target: 'es2022' });
const { localDevRoots, findLocalGodotProject, discoverLocalGodotProjects, localDevLaunch } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);

function workspace(t) {
  const home = realpathSync(mkdtempSync(path.join(tmpdir(), 'inaayah-local-dev-')));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const roots = localDevRoots(home, path.join(home, 'launcher/app'), path.join(home, 'launcher'));
  return { home, roots };
}
function project(repo) {
  mkdirSync(path.join(repo, 'godot'), { recursive: true });
  writeFileSync(path.join(repo, 'godot/project.godot'), 'config_version=5');
  return realpathSync(path.join(repo, 'godot'));
}

test('discovers new game IDs in ordinary and linked workspaces without a fixed game list', async t => {
  const { home, roots } = workspace(t);
  const external = path.join(home, 'external/vigilante-red-city');
  const expected = project(external);
  const repos = path.join(home, 'Repositories');
  mkdirSync(repos);
  symlinkSync(external, path.join(repos, 'vigilante-red-city'), 'junction');
  project(path.join(home, 'Projects/new-game'));
  symlinkSync(path.join(home, 'missing'), path.join(repos, 'broken-game'), 'junction');
  mkdirSync(path.join(repos, 'not-a-game'));
  const found = await discoverLocalGodotProjects(roots);
  assert.equal(found.get('vigilante-red-city'), expected);
  assert.ok(found.has('new-game'));
  assert.equal(found.has('broken-game'), false);
  assert.equal(found.has('not-a-game'), false);
});

test('finds scratch projects and sees projects added or removed after an earlier scan', async t => {
  const { home, roots } = workspace(t);
  const repo = path.join(home, '.gemini/antigravity-ide/scratch/vigilante-red-city');
  assert.equal(findLocalGodotProject('vigilante-red-city', roots), null);
  const expected = project(repo);
  assert.equal(findLocalGodotProject('vigilante-red-city', roots), expected);
  assert.equal((await discoverLocalGodotProjects(roots)).get('vigilante-red-city'), expected);
  rmSync(repo, { recursive: true });
  assert.equal(findLocalGodotProject('vigilante-red-city', roots), null);
  assert.equal(findLocalGodotProject('../external', roots), null);
});

test('launches from the project directory and uses its pinned-engine runner when available', t => {
  const { home } = workspace(t);
  const repo = path.join(home, 'a game');
  const dir = project(repo);
  const fallback = path.join(home, 'engine');
  assert.equal(localDevLaunch(dir, fallback, [], 'linux').executable, fallback);
  const runner = path.join(repo, 'scripts/godot.sh');
  mkdirSync(path.dirname(runner));
  writeFileSync(runner, '#!/bin/sh\n', { mode: 0o755 });
  const command = localDevLaunch(dir, fallback, ['--headless'], 'linux');
  assert.equal(command.executable, runner);
  assert.equal(command.cwd, dir);
  assert.deepEqual(command.args, ['--path', dir, '--headless']);
  assert.equal(localDevLaunch(dir, fallback, [], 'win32').executable, fallback);
});
