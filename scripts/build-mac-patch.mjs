#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(rootDir, 'release');

function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readPlistKey(plistPath, key) {
  return execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plistPath], {
    encoding: 'utf-8'
  }).trim();
}

function findBuiltMacAppBundles(baseDir) {
  if (!fs.existsSync(baseDir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith('mac')) {
      const candidate = path.join(baseDir, entry.name, 'Inaayah Launcher.app');
      if (fs.existsSync(candidate)) {
        const arch = entry.name.includes('arm64')
          ? 'arm64'
          : entry.name.includes('x64')
          ? 'x64'
          : process.arch;
        results.push({ appPath: candidate, arch });
      }
    }
  }
  return results;
}

const bundles = findBuiltMacAppBundles(releaseDir);
if (bundles.length === 0) {
  console.error('No built macOS Inaayah Launcher.app found in release/.');
  process.exit(1);
}

for (const { appPath, arch } of bundles) {
  const infoPlistPath = path.join(appPath, 'Contents', 'Info.plist');
  const appAsarPath = path.join(appPath, 'Contents', 'Resources', 'app.asar');
  const electronPlistPath = path.join(
    appPath,
    'Contents',
    'Frameworks',
    'Electron Framework.framework',
    'Resources',
    'Info.plist'
  );

  if (!fs.existsSync(infoPlistPath) || !fs.existsSync(appAsarPath) || !fs.existsSync(electronPlistPath)) {
    throw new Error(`Missing required bundle files inside ${appPath}`);
  }

  const version = readPlistKey(infoPlistPath, 'CFBundleShortVersionString');
  const electronVersion = readPlistKey(electronPlistPath, 'CFBundleShortVersionString');

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), `inaayah-mac-patch-${version}-${arch}-`));
  try {
    const destResources = path.join(stagingDir, 'Contents', 'Resources');
    fs.mkdirSync(destResources, { recursive: true });
    fs.copyFileSync(appAsarPath, path.join(destResources, 'app.asar'));
    fs.copyFileSync(infoPlistPath, path.join(stagingDir, 'Contents', 'Info.plist'));

    const meta = {
      version,
      electronVersion,
      arch,
      appAsarSha256: sha256File(appAsarPath),
      infoPlistSha256: sha256File(infoPlistPath)
    };
    fs.writeFileSync(path.join(stagingDir, 'patch-meta.json'), JSON.stringify(meta, null, 2));

    const outZip = path.join(releaseDir, `Inaayah-Launcher-${version}-${arch}-mac-patch.zip`);
    if (fs.existsSync(outZip)) {
      fs.unlinkSync(outZip);
    }
    execFileSync('/usr/bin/ditto', ['-c', '-k', '--norsrc', stagingDir, outZip]);
    const sizeKb = Math.round(fs.statSync(outZip).size / 1024);
    console.log(`Built macOS fast patch archive: ${path.basename(outZip)} (${sizeKb} KB, Electron ${electronVersion})`);
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}
