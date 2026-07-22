#!/usr/bin/env python3
"""
PrintDash Portal — Unified entry point for PrintDash (dashboard) + Bambuddy (printer control)
Serves portal at /, proxies /dashboard/ to printdash:4322, /printers/ to bambuddy:8000
"""
import http.server
import http.client
import urllib.parse
import os
import re

PORT = 4321
PRINTDASH_HOST = ('127.0.0.1', 4322)
BAMBUDDY_HOST = ('127.0.0.1', 8000)

class PortalHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path

        # Google Shopping feed
        if path == '/google-shopping-feed.xml' or path == '/feed.xml':
            self.serve_file(os.path.expanduser('~/fofus/ops/marketing/google-shopping-feed.xml'))
            return

        # Root → serve portal page
        if path == '/' or path == '/index.html':
            self.serve_file(os.path.expanduser('~/dash/frontend/dist/printdash-portal.html'))
            return

        # Static assets for portal
        if path.startswith('/printdash-logo.svg') or path.startswith('/favicon.svg') or path.startswith('/icon-'):
            self.serve_file(os.path.expanduser(f'~/dash/frontend/dist{path}'))
            return

        # robots.txt + sitemap.xml for SEO
        if path == '/robots.txt':
            self.serve_file(os.path.expanduser('~/dash/frontend/dist/robots.txt'))
            return
        if path == '/sitemap.xml':
            self.serve_file(os.path.expanduser('~/dash/frontend/dist/sitemap.xml'))
            return
        if re.fullmatch(r'/[a-f0-9]{32}\.txt', path):
            self.serve_file(os.path.expanduser(f'~/dash/frontend/dist{path}'))
            return

        # /dashboard/ → proxy to printdash:4322
        if path.startswith('/dashboard/'):
            sub = path[len('/dashboard/'):]
            self.proxy('/' + sub if sub else '/', PRINTDASH_HOST)
            return

        # /printers/ → proxy to bambuddy:8000
        if path.startswith('/printers/'):
            sub = path[len('/printers/'):]
            self.proxy('/' + sub if sub else '/', BAMBUDDY_HOST)
            return

        # Default: proxy to printdash (API calls, etc.)
        self.proxy(path, PRINTDASH_HOST)

    def serve_file(self, filepath):
        try:
            with open(filepath, 'rb') as f:
                content = f.read()
            self.send_response(200)
            if filepath.endswith('.svg'):
                self.send_header('Content-Type', 'image/svg+xml')
            elif filepath.endswith('.png'):
                self.send_header('Content-Type', 'image/png')
            elif filepath.endswith('.html'):
                self.send_header('Content-Type', 'text/html')
            elif filepath.endswith('.xml'):
                self.send_header('Content-Type', 'application/xml; charset=utf-8')
            self.end_headers()
            self.wfile.write(content)
        except FileNotFoundError:
            self.send_error(404)

    def proxy(self, path, target):
        try:
            conn = http.client.HTTPConnection(target[0], target[1], timeout=30)
            conn.request('GET', path, headers={'Host': f'{target[0]}:{target[1]}'})
            resp = conn.getresponse()
            data = resp.read()
            self.send_response(resp.status)
            for h, v in resp.getheaders():
                if h.lower() not in ('transfer-encoding', 'connection'):
                    self.send_header(h, v)
            self.end_headers()
            self.wfile.write(data)
            conn.close()
        except Exception as e:
            self.send_error(502, f'Proxy error: {e}')

    def log_message(self, format, *args):
        pass  # Quiet

if __name__ == '__main__':
    server = http.server.HTTPServer(('0.0.0.0', PORT), PortalHandler)
    print(f'PrintDash Portal running on :{PORT}')
    server.serve_forever()
