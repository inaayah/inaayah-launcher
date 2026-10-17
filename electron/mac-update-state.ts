import path from 'node:path';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";

export function macUpdatePaths(updateDir: string, version: string) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid launcher update version');
  const versionDir = path.join(updateDir, version);
  const extractedDir = path.join(versionDir, 'extracted');
  return { zipPath: path.join(versionDir, 'launcher.zip'), extractedDir, extractedAppPath: path.join(extractedDir, 'Inaayah Launcher.app') };
}

export async function stagedAppMatchesVersion(bundle: string, version: string): Promise<boolean> {
  try {
    const plist = path.join(bundle, 'Contents', 'Info.plist');
    const read = async (key: string) => (await execFileAsync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist])).stdout.trim();
    const [actual, executable, identifier] = await Promise.all([read('CFBundleShortVersionString'), read('CFBundleExecutable'), read('CFBundleIdentifier')]);
    return actual === version && identifier === 'com.inaayah.launcher' &&
      path.basename(executable) === executable && fs.existsSync(path.join(bundle, 'Contents', 'MacOS', executable));
  } catch {
    return false;
  }
}

export function macInstallScript(options: {
  pid: number; source: string; target: string; version: string; logPath: string; launch?: boolean;
}): string {
  if (!Number.isSafeInteger(options.pid) || options.pid < 1) throw new Error('Invalid launcher PID');
  if (!/^\d+\.\d+\.\d+$/.test(options.version)) throw new Error('Invalid launcher update version');
  for (const bundle of [options.source, options.target]) {
    if (!path.isAbsolute(bundle) || !bundle.endsWith('.app')) throw new Error('Expected an absolute app bundle path');
  }
  if (options.source === options.target) throw new Error('Update source and destination must differ');
  return `#!/bin/bash
set -eu
OLD_PID=${options.pid}
NEW_APP=${quote(options.source)}
TARGET_APP=${quote(options.target)}
EXPECTED_VERSION=${quote(options.version)}
exec >>${quote(options.logPath)} 2>&1
while kill -0 "$OLD_PID" 2>/dev/null; do sleep 0.1; done
ACTUAL=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$NEW_APP/Contents/Info.plist")
[ "$ACTUAL" = "$EXPECTED_VERSION" ] || { echo 'Update version mismatch'; exit 1; }
PARENT=$(/usr/bin/dirname "$TARGET_APP")
REPLACEMENT="$PARENT/.inaayah-update-$$.app"
BACKUP="$PARENT/.inaayah-backup-$$.app"
/usr/bin/ditto "$NEW_APP" "$REPLACEMENT"
ACTUAL=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$REPLACEMENT/Contents/Info.plist")
[ "$ACTUAL" = "$EXPECTED_VERSION" ] || { echo 'Copied app version mismatch'; exit 1; }
HAD_BACKUP=0
INSTALLED=0
rollback() {
  if [ "$INSTALLED" = 0 ] && [ "$HAD_BACKUP" = 1 ]; then
    if [ -e "$TARGET_APP" ]; then /bin/mv "$TARGET_APP" "$REPLACEMENT.failed"; fi
    /bin/mv "$BACKUP" "$TARGET_APP"
  fi
}
trap rollback EXIT
if [ -e "$TARGET_APP" ]; then /bin/mv "$TARGET_APP" "$BACKUP"; HAD_BACKUP=1; fi
/bin/mv "$REPLACEMENT" "$TARGET_APP"
${options.launch === false ? '' : '/usr/bin/open "$TARGET_APP"'}
INSTALLED=1
if [ "$HAD_BACKUP" = 1 ]; then /bin/rm -rf "$BACKUP"; fi
/bin/rm -f "$0"
`;
}
