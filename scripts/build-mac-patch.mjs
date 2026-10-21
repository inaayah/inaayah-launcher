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

function getElectronVersion() {
  try {
    const electronPkg = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'node_modules', 'electron', 'package.json'), 'utf-8')
    );
    if (electronPkg.version) return electronPkg.version;
  } catch {}
  const rootPkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
  return (rootPkg.devDependencies?.electron || '34.2.0').replace(/^[^0-9]*/, '');
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

async function uploadPatchAssetToGithub(filePath, tag) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GH_REPO || 'inaayah/inaayah-launcher';
  if (!token) {
    console.log('No GITHUB_TOKEN set; skipping GitHub Release upload.');
    return;
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Inaayah-Release-Builder'
  };

  const cleanVer = tag.replace(/^v/, '');
  const listRes = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=20`, { headers });
  if (!listRes.ok) {
    throw new Error(`Failed to list GitHub releases: HTTP ${listRes.status}`);
  }
  const releases = await listRes.json();
  const targetRelease = releases.find(
    (r) =>
      r.tag_name === `v${cleanVer}` ||
      r.tag_name === cleanVer ||
      (r.draft && (String(r.name).includes(cleanVer) || String(r.tag_name).includes(cleanVer)))
  );

  if (!targetRelease) {
    throw new Error(`Could not find GitHub release for ${tag}`);
  }

  const fileName = path.basename(filePath);
  const existingAsset = (targetRelease.assets || []).find((a) => a.name === fileName);
  if (existingAsset) {
    await fetch(`https://api.github.com/repos/${repo}/releases/assets/${existingAsset.id}`, {
      method: 'DELETE',
      headers
    });
  }

  const uploadUrl = targetRelease.upload_url.replace(/\{\?name,label\}$/, `?name=${encodeURIComponent(fileName)}`);
  const fileBytes = fs.readFileSync(filePath);
  const upRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/zip',
      'Content-Length': String(fileBytes.length)
    },
    body: fileBytes
  });
  if (!upRes.ok) {
    const errText = await upRes.text().catch(() => '');
    throw new Error(`Failed to upload ${fileName}: HTTP ${upRes.status} ${errText}`);
  }
  console.log(`Uploaded ${fileName} to GitHub Release ${targetRelease.name || targetRelease.tag_name}`);
}

const bundles = findBuiltMacAppBundles(releaseDir);
if (bundles.length === 0) {
  console.error('No built macOS Inaayah Launcher.app found in release/.');
  process.exit(1);
}

const electronVersion = getElectronVersion();

for (const { appPath, arch } of bundles) {
  const infoPlistPath = path.join(appPath, 'Contents', 'Info.plist');
  const appAsarPath = path.join(appPath, 'Contents', 'Resources', 'app.asar');

  if (!fs.existsSync(infoPlistPath) || !fs.existsSync(appAsarPath)) {
    throw new Error(`Missing required bundle files inside ${appPath}`);
  }

  const version = readPlistKey(infoPlistPath, 'CFBundleShortVersionString');
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

    if (process.env.GITHUB_TOKEN) {
      await uploadPatchAssetToGithub(outZip, process.env.TARGET_TAG || `v${version}`);
    }
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}
