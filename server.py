import http.server
import socketserver

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def send_response_only(self, code, message=None):
        super().send_response_only(code, message)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("ETag", "")
        super().end_headers()

    def do_GET(self):
        self.headers.__delitem__("If-Modified-Since")
        self.headers.__delitem__("If-None-Match")
        super().do_GET()

PORT = 5000
with socketserver.TCPServer(("", PORT), NoCacheHandler) as httpd:
    httpd.allow_reuse_address = True
    print(f"Serving on port {PORT}")
    httpd.serve_forever()
