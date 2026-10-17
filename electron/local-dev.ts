import fs from 'node:fs';
import path from 'node:path';

export function localDevRoots(home: string, appPath: string, cwd: string): string[] {
  return [...new Set([
    path.resolve(appPath, '..'), path.resolve(cwd, '..'),
    ...['Repositories', 'Projects', 'Development', '.gemini/antigravity-ide/scratch'].map(dir => path.join(home, dir))
  ])];
}

export function findLocalGodotProject(gameId: string, roots: string[]): string | null {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(gameId)) return null;
  for (const root of roots) {
    const project = path.join(root, gameId, 'godot', 'project.godot');
    try {
      if (fs.statSync(project).isFile()) return fs.realpathSync(path.dirname(project));
    } catch { /* Missing, inaccessible or broken links are not development projects. */ }
  }
  return null;
}

export async function discoverLocalGodotProjects(roots: string[]): Promise<Map<string, string>> {
  const projects = new Map<string, string>();
  for (const root of roots) {
    try {
      const entries = await fs.promises.readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
        if (projects.has(entry.name)) continue;
        const project = findLocalGodotProject(entry.name, [root]);
        if (project) projects.set(entry.name, project);
      }
    } catch { /* Optional workspace roots may not exist on this machine. */ }
  }
  return projects;
}

export function localDevLaunch(project: string, godot: string, args: string[] = [], platform: NodeJS.Platform = process.platform) {
  // Project runners enforce .godot-version rather than silently using a different engine.
  const runner = path.resolve(project, '../scripts/godot.sh');
  let executable = godot;
  if (platform !== 'win32') {
    try {
      fs.accessSync(runner, fs.constants.X_OK);
      if (fs.statSync(runner).isFile()) executable = runner;
    } catch {}
  }
  return { executable, args: ['--path', project, ...args], cwd: project };
}
