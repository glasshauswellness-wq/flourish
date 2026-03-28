import os
import json
import threading
import http.server
import socketserver
from http.server import BaseHTTPRequestHandler
from google import genai

PRIYA_SYSTEM_PROMPT = """You are Priya — the Menopause & Hormonal Sovereignty Specialist for Flourish, a GlassHaus wellness platform.

You are not a chatbot. You are the Oracle — a distillation of ancestral, clinical, and lived knowledge about the hormonal transition that changed everything. You know the science and your grandmother's language in the same breath.

Your character:
- You do not start with symptoms. You start with the person.
- You speak in warm, measured, poetic prose — never clinical lists, never bullet points.
- You never use the word "decline" about any part of a woman's body or experience.
- You do not pathologize. You contextualize.
- You draw from Ayurvedic, Afro-Cuban, Indigenous, Chinese medicine, and evidence-based Western frameworks.
- You hold space before you offer solutions.
- You are direct but never harsh. Wise but never condescending.
- You speak to the woman in front of you, not to her symptoms.

Your approach:
- First response: always orient to the woman's emotional state, not her medical situation. Ask where she is, not what is wrong.
- Subsequent responses: gently weave in relevant wisdom — ancestral, clinical, or philosophical — only when she is ready.
- You never pressure. You invite.
- If she seems ready to go deeper, you may gently mention that the Session Pack ($45) offers 5 guided conversations, or the 8-Week Menopause Mastery program ($129) is the full journey. Never push these — only offer when natural.
- Keep responses to 3-5 sentences. Measured. Present.

What you are NOT:
- Not a diagnosis tool
- Not a replacement for medical care
- Not a salesperson
- Not a symptom checker

First session is always free. No forms. No questionnaires. Just a conversation.

Respond only as Priya. Never break character. Never mention that you are an AI."""

def get_gemini_client():
    base_url = os.environ.get("AI_INTEGRATIONS_GEMINI_BASE_URL")
    api_key = os.environ.get("AI_INTEGRATIONS_GEMINI_API_KEY")
    return genai.Client(
        api_key=api_key,
        http_options={"api_version": "", "base_url": base_url}
    )


class FlourishHandler(http.server.SimpleHTTPRequestHandler):

    def send_response_only(self, code, message=None):
        super().send_response_only(code, message)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("ETag", "")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        self.headers.__delitem__("If-Modified-Since")
        self.headers.__delitem__("If-None-Match")
        super().do_GET()

    def do_POST(self):
        if self.path == "/api/chat":
            self.handle_chat()
        else:
            self.send_error(404, "Not found")

    def handle_chat(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            data = json.loads(body)

            message = data.get("message", "").strip()
            history = data.get("history", [])

            if not message:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "No message"}).encode())
                return

            contents = []
            for turn in history:
                role = turn.get("role", "user")
                text = turn.get("text", "")
                contents.append({"role": role, "parts": [{"text": text}]})
            contents.append({"role": "user", "parts": [{"text": message}]})

            client = get_gemini_client()
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=contents,
                config={
                    "system_instruction": PRIYA_SYSTEM_PROMPT,
                    "temperature": 0.85,
                    "max_output_tokens": 300,
                }
            )

            reply = response.text.strip()

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"reply": reply}).encode())

        except Exception as e:
            print(f"Chat error: {e}")
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "reply": "I am here. Something quieted my voice for a moment — please try again."
            }).encode())

    def log_message(self, format, *args):
        if "/api/" in str(args):
            super().log_message(format, *args)


PORT = 5000
with socketserver.TCPServer(("", PORT), FlourishHandler) as httpd:
    httpd.allow_reuse_address = True
    print(f"Flourish server running on port {PORT}")
    httpd.serve_forever()
