"""Small, dependency-free post-publication action. Requires permissions: id-token: write."""
import argparse
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

USER_AGENT = 'InaayahLauncher/ReleaseVerifier'


def request(url, *, data=None, token=None, redirect=True, headers=None):
    req_headers = {'User-Agent': USER_AGENT, 'Cache-Control': 'no-cache', **(headers or {})}
    if token:
        req_headers['Authorization'] = f'Bearer {token}'
    if data is not None:
        req_headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else None, headers=req_headers)
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args):
            return None
    opener = urllib.request.build_opener() if redirect else urllib.request.build_opener(NoRedirect)
    try:
        return opener.open(req, timeout=30)
    except urllib.error.HTTPError as error:
        if not redirect and error.code == 302:
            return error
        # Do not include signed URLs or bearer tokens in logs.
        raise RuntimeError(f'Release endpoint returned HTTP {error.code}: {urllib.parse.urlparse(url).path}') from None


def read_json(url, **kwargs):
    with request(url, **kwargs) as response:
        return json.load(response)


def verify(gateway, game_id, version, identity=None):
    tag = f'v{version}'
    package_auth = {'token': identity, 'headers': {'X-Inaayah-Release-Version': version}} if identity and game_id != 'launcher' else {}
    prefix = '/api/launcher' if game_id == 'launcher' else f'/api/games/{game_id}'
    latest = read_json(f'{gateway}{prefix}/releases/latest')
    if latest.get('version') != tag:
        raise RuntimeError('Latest-release endpoint has not switched to the published version')
    manifest = None
    if game_id != 'launcher':
        manifest = read_json(f'{gateway}{prefix}/manifest')
        catalog = read_json(f'{gateway}/api/games')
        item = next((item for item in catalog if item.get('id') == game_id), {})
        if manifest.get('version') != version or item.get('version') != version:
            raise RuntimeError('Catalog and manifest do not match the published release')
        if item.get('downloads') != manifest.get('downloads'):
            raise RuntimeError('Catalog and manifest package metadata disagree')
    for platform in ['darwin', 'win32', 'linux']:
        with request(f'{gateway}{prefix}/download/{platform}', redirect=False, **package_auth) as response:
            if response.code != 302 or response.headers.get('X-Release-Version') != tag:
                raise RuntimeError(f'{platform} download is not serving {tag}')
            location = response.headers.get('Location', '')
        if not location.startswith('https://'):
            raise RuntimeError(f'{platform} download redirect is not HTTPS')
        # One byte confirms the signed URL is usable without downloading the game.
        with request(location, headers={'Range': 'bytes=0-0'}) as asset:
            if asset.status != 206:
                raise RuntimeError(f'{platform} download does not support byte ranges')
            content_range = asset.headers.get('Content-Range', '')
            if not re.match(r'^bytes 0-0/\d+$', content_range) or len(asset.read(1)) != 1:
                raise RuntimeError(f'{platform} archive is unavailable')
            if manifest and int(content_range.split('/')[-1]) != manifest['downloads'][platform]['sizeBytes']:
                raise RuntimeError(f'{platform} download size disagrees with manifest')
        if manifest:
            for kind in ['manifest', 'data']:
                name = manifest.get('incremental', {}).get(platform, {}).get(kind)
                if name:
                    with request(f'{gateway}{prefix}/assets/{version}/{name}', redirect=False, **package_auth) as response:
                        if response.code != 302 or not response.headers.get('Location', '').startswith('https://'):
                            raise RuntimeError(f'{platform} incremental {kind} is unavailable')
    return f'{game_id} {tag}: latest, catalog/manifest and all desktop download channels verified'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    game_id = os.environ['INAAYAH_RELEASE_ID']
    version = os.environ['INAAYAH_RELEASE_VERSION'].removeprefix('v')
    gateway = os.environ.get('INAAYAH_RELEASE_GATEWAY', 'https://releases.inaayah.dev').rstrip('/')
    if not re.fullmatch(r'[a-z0-9-]+', game_id) or not re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', version):
        raise RuntimeError('Invalid release ID or stable version')
    identity = None
    if not args.verify_only or os.environ.get('ACTIONS_ID_TOKEN_REQUEST_URL'):
        audience = urllib.parse.urlencode({'audience': 'https://releases.inaayah.dev'})
        identity_url = os.environ['ACTIONS_ID_TOKEN_REQUEST_URL']
        identity_url += ('&' if '?' in identity_url else '?') + audience
        identity = read_json(identity_url, token=os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN'])['value']
    if not args.verify_only:
        for attempt in range(4):
            try:
                result = read_json(f'{gateway}/api/releases/sync', data={'gameId': game_id, 'version': version}, token=identity)
                if result.get('synchronized') is not True:
                    raise RuntimeError('Gateway did not confirm synchronization')
                break
            except RuntimeError:
                if attempt == 3:
                    raise
                time.sleep(10)
    for attempt in range(4):
        try:
            message = verify(gateway, game_id, version, identity)
            print(message)
            if os.environ.get('GITHUB_STEP_SUMMARY'):
                with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as summary:
                    summary.write(f'\n{message}\n')
            return
        except (RuntimeError, urllib.error.URLError):
            if attempt == 3:
                raise
            time.sleep(10)


if __name__ == '__main__':
    main()
