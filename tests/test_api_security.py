"""Regression tests for the local HTTP server's request-security boundary."""
import http.client
import threading
import unittest
from unittest import mock

from handset import server


class QuietHandler(server.Handler):
    def log_message(self, format, *args):
        pass


class ApiSecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = server.SingleServer(("127.0.0.1", 0), QuietHandler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.httpd.server_port
        cls.token = cls.httpd.api_token

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=3)

    def request(self, method="GET", path="/api/unknown", headers=None, body=None, raw_headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
        conn.putrequest(method, path, skip_host=True)
        hdrs = {"Host": f"127.0.0.1:{self.port}"}
        hdrs.update(headers or {})
        for key, value in hdrs.items():
            conn.putheader(key, value)
        for key, value in raw_headers or []:
            conn.putheader(key, value)
        conn.endheaders(body)
        response = conn.getresponse()
        data = response.read()
        result = (response.status, response.getheaders(), data)
        conn.close()
        return result

    def auth(self, **extra):
        headers = {server.API_TOKEN_HEADER: self.token}
        headers.update(extra)
        return headers

    def test_api_requires_token_and_accepts_valid_token(self):
        self.assertEqual(self.request()[0], 401)
        self.assertEqual(self.request(headers={server.API_TOKEN_HEADER: "wrong"})[0], 401)
        status, _, _ = self.request(headers=self.auth())
        self.assertEqual(status, 404)
        self.assertEqual(self.request(path="/api/tray-state", headers=self.auth())[0], 200)

    def test_host_and_origin_guards(self):
        for host in (f"127.0.0.1:{self.port + 1}", f"evil.example:{self.port}"):
            with self.subTest(host=host):
                self.assertEqual(self.request(headers={"Host": host, server.API_TOKEN_HEADER: self.token})[0], 403)
        self.assertEqual(self.request(headers=self.auth(Origin="https://evil.example"))[0], 403)
        self.assertEqual(self.request(headers=self.auth(Origin=f"https://127.0.0.1:{self.port}"))[0], 403)
        self.assertEqual(self.request(headers=self.auth(**{"Sec-Fetch-Site": "cross-site"}))[0], 403)
        status, _, _ = self.request(headers=self.auth(Origin=f"http://127.0.0.1:{self.port}", **{"Sec-Fetch-Site": "same-origin"}))
        self.assertEqual(status, 404)

    def test_protected_namespaces_require_token(self):
        for path in ("/api", "/api/unknown", "/mirror", "/mirror/codec", "/debug-metrics"):
            with self.subTest(path=path):
                self.assertEqual(self.request(path=path)[0], 401)

    def test_html_bootstrap_includes_token_on_both_pages(self):
        for path in ("/", "/mirror.html"):
            with self.subTest(path=path):
                # Browser/iframe navigation cannot attach the custom API header.
                status, _, body = self.request(path=path)
                self.assertEqual(status, 200)
                self.assertIn(f'<meta name="pane-api-token" content="{self.token}">'.encode(), body)
                self.assertIn(b'<script src="/security.js"></script>', body)

    def test_loopback_only_pages_and_api(self):
        with mock.patch.object(QuietHandler, "_client_is_loopback", return_value=False):
            for path, headers in (("/", {}), ("/mirror.html", {}), ("/api/unknown", self.auth())):
                with self.subTest(path=path):
                    self.assertEqual(self.request(path=path, headers=headers)[0], 403)

    def test_content_length_and_transfer_encoding_guards(self):
        cases = [
            ([ ("Content-Length", "nope") ], 400),
            ([ ("Content-Length", "-1") ], 400),
            ([ ("Content-Length", "1"), ("Content-Length", "1") ], 400),
            ([ ("Content-Length", str(server.MAX_REQUEST_BODY_BYTES + 1)) ], 413),
            ([ ("Transfer-Encoding", "chunked") ], 400),
        ]
        for extra, expected in cases:
            with self.subTest(extra=extra):
                self.assertEqual(self.request(headers=self.auth(), raw_headers=extra)[0], expected)

    def test_get_body_is_rejected(self):
        status, _, _ = self.request(headers=self.auth(**{"Content-Length": "1"}), body=b"x")
        self.assertEqual(status, 400)

    def test_post_requires_json_content_type_and_accepts_capped_body(self):
        status, _, _ = self.request("POST", "/api/unknown", headers=self.auth(**{"Content-Type": "text/plain", "Content-Length": "1"}), body=b"x")
        self.assertEqual(status, 415)
        # Lower the configured cap temporarily and exercise an exactly-at-limit
        # body without allocating the production 32 MiB limit.
        with mock.patch.object(server, "MAX_REQUEST_BODY_BYTES", 4):
            status, _, _ = self.request("POST", "/api/unknown", headers=self.auth(**{"Content-Type": "application/json", "Content-Length": "4"}), body=b"{}  ")
        self.assertEqual(status, 404)


if __name__ == "__main__":
    unittest.main()
