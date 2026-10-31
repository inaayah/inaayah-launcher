"""Credential routing regression for the shared release publisher."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('publisher', Path(__file__).with_name('publish.py'))
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)

class Reply:
    def __init__(self, status=302, **headers):
        self.status = self.code = status
        self.headers = headers
    def __enter__(self): return self
    def __exit__(self, *_): pass
    def read(self, *_): return b'x'

class CredentialRouting(unittest.TestCase):
    def test_ci_identity_stays_at_gateway(self):
        calls = []
        manifest = {'version': '1.2.0', 'downloads': {p: {'sizeBytes': 42} for p in ['darwin', 'win32', 'linux']}, 'incremental': {p: {'manifest': 'patch.json', 'data': 'patch.bin'} for p in ['darwin', 'win32', 'linux']}}
        def read_json(url):
            if url.endswith('/releases/latest'): return {'version': 'v1.2.0'}
            if url.endswith('/manifest'): return manifest
            return [dict(manifest, id='vigilante-red-city')]
        def request(url, **kwargs):
            calls.append((url, kwargs))
            if url.startswith('https://cdn.test/'):
                self.assertIsNone(kwargs.get('token'))
                self.assertNotIn('X-Inaayah-Release-Version', kwargs.get('headers', {}))
                return Reply(206, **{'Content-Range': 'bytes 0-0/42'})
            self.assertEqual(kwargs['token'], 'oidc-fixture')
            self.assertEqual(kwargs['headers']['X-Inaayah-Release-Version'], '1.2.0')
            self.assertFalse(kwargs['redirect'])
            return Reply(Location='https://cdn.test/private', **{'X-Release-Version': 'v1.2.0'})
        with patch.object(publisher, 'read_json', read_json), patch.object(publisher, 'request', request):
            publisher.verify('https://releases.inaayah.dev', 'vigilante-red-city', '1.2.0', 'oidc-fixture')
        self.assertEqual(len(calls), 12)

if __name__ == '__main__': unittest.main()
