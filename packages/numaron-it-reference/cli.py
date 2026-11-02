"""Offline entry points: loopback HTTP server, stdio API and batch evaluation."""
import argparse
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from app import DocumentApp
from ui import HTML


def serve(database, token, port):
    app = DocumentApp(database, token)

    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(2)

        def log_message(self, *args):
            pass  # Do not log tokens, submitted documents or HTTP request lines.

        def handle_api(self):
            status, result = 400, {'error': 'invalid JSON request'}
            try:
                # The loopback service never serves remote hosts or accepts a
                # cross-origin browser write. Authorization is still required.
                if self.headers.get('Host') not in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'):
                    status, result = 403, {'error': 'local host required'}
                elif self.headers.get('Origin') not in (None, f'http://127.0.0.1:{self.server.server_port}', f'http://localhost:{self.server.server_port}'):
                    status, result = 403, {'error': 'same origin required'}
                elif self.command == 'GET' and self.path == '/':
                    return self.respond(200, HTML.encode(), 'text/html; charset=utf-8')
                else:
                    length = int(self.headers.get('Content-Length', '0'))
                    if length < 0 or length > 1600500 or self.headers.get('Transfer-Encoding'):
                        raise ValueError('bounded request required')
                    body = json.loads(self.rfile.read(length).decode()) if length else {}
                    auth = self.headers.get('Authorization', '')
                    status, result = app.request(self.command, self.path, body, auth[7:] if auth.startswith('Bearer ') else '')
            except (ValueError, UnicodeError, OSError):
                pass
            try:
                self.respond(status, json.dumps(result).encode(), 'application/json')
            except OSError:
                self.close_connection = True

        def respond(self, status, payload, content_type):
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(payload)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(payload)

        do_GET = handle_api
        do_POST = handle_api

    server = HTTPServer(('127.0.0.1', port), Handler)
    server.timeout = 5
    print(json.dumps({'port': server.server_port, 'host': '127.0.0.1'}), flush=True)
    try:
        server.serve_forever()
    finally:
        app.close()
        server.server_close()


def main():
    parser = argparse.ArgumentParser(description='Local synthetic document operations; no external services')
    parser.add_argument('command', choices=['serve', 'request'])
    parser.add_argument('--state', required=True, type=Path)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--token-env', default='DESK_TOKEN')
    args = parser.parse_args()
    token = os.environ.get(args.token_env, '')
    if len(token) < 16:
        parser.error('set the explicit local token environment variable (16+ characters)')
    if args.state.exists() and (args.state.is_symlink() or not args.state.is_file()):
        parser.error('regular isolated state database required')
    if not args.state.parent.is_dir():
        parser.error('state parent directory must exist')
    if args.command == 'serve':
        serve(args.state, token, args.port)
    else:
        data = json.load(sys.stdin)
        app = DocumentApp(args.state, token)
        try:
            status, result = app.request(data['method'], data['path'], data.get('body', {}), data.get('token', ''))
            print(json.dumps({'status': status, 'body': result}))
        finally:
            app.close()


if __name__ == '__main__':
    main()
