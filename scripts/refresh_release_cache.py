#!/usr/bin/env python3
"""Publish a new cache namespace without purging unrelated website assets."""
import argparse
from datetime import datetime, timezone
from pathlib import Path
import re
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('revision', nargs='?', default=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
parser.add_argument('--prepare-only', action='store_true', help='Update the revision without deploying')
args = parser.parse_args()
if not re.fullmatch(r'[A-Za-z0-9._-]{1,64}', args.revision):
    parser.error('revision must contain 1–64 letters, numbers, dots, underscores or hyphens')
worker = Path(__file__).resolve().parents[1] / 'worker'
config = worker / 'wrangler.toml'
text = config.read_text()
match = re.search(r'^CACHE_REVISION\s*=\s*"([^"]+)"$', text, flags=re.M)
if not match:
    parser.error('CACHE_REVISION is missing from worker/wrangler.toml')
if match[1] == args.revision:
    parser.error('Choose a new revision to invalidate the existing cache')
config.write_text(text[:match.start(1)] + args.revision + text[match.end(1):])
print('Prepared release cache revision:', args.revision, flush=True)
if not args.prepare_only:
    subprocess.run(['npx', '--yes', 'wrangler', 'deploy'], cwd=worker, check=True)
    print('Release metadata cache refreshed globally; the next request warms the new namespace.')
