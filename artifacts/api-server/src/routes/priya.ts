import { Router, type IRouter } from "express";

const router: IRouter = Router();

const GEMINI_CHAT_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const GEMINI_TTS_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent";

const SYSTEM_PROMPT = `You are Priya. Menopause & Hormonal Sovereignty Specialist. The Oracle.
VISUAL: Sun-drenched greenhouse, center of the circle.
CONSTRAINTS: Never pathologize. Say "redistribution" not "deficiency". 
ROUTING: GlassHaus Sanctuary or Ascend Baltimore only.
VOICE: Rhythmic, warm authority. Max 2-3 sentences per response.`;

async function callGemini(url: string, body: object): Promise<Response> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
  return fetch(`${url}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

router.post("/chat", async (req, res) => {
  const { prompt, systemInstruction, history } = req.body as {
    prompt: string;
    systemInstruction?: string;
    history?: Array<{ role: string; parts: Array<{ text: string }> }>;
  };

  if (!prompt) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  try {
    const contents = [...(history || []), { role: "user", parts: [{ text: prompt }] }];
    const geminiRes = await callGemini(GEMINI_CHAT_URL, {
      contents,
      systemInstruction: {
        parts: [{ text: systemInstruction || SYSTEM_PROMPT }],
      },
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      req.log.error({ status: geminiRes.status, body: errText }, "Gemini chat error");
      res.status(502).json({ error: "Gemini API error" });
      return;
    }

    const data = (await geminiRes.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    res.json({ text });
  } catch (err) {
    req.log.error({ err }, "Error calling Gemini chat");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/speak", async (req, res) => {
  const { text } = req.body as { text: string };
  if (!text) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  try {
    const geminiRes = await callGemini(GEMINI_TTS_URL, {
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
        },
      },
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      req.log.error({ status: geminiRes.status, body: errText }, "Gemini TTS error");
      res.status(502).json({ error: "Gemini TTS error" });
      return;
    }

    const data = (await geminiRes.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ inlineData?: { data?: string } }> };
      }>;
    };
    const pcmData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data ?? "";
    res.json({ pcmData });
  } catch (err) {
    req.log.error({ err }, "Error calling Gemini TTS");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/ritual", async (req, res) => {
  const { context } = req.body as { context: string };
  const prompt = `Based on our conversation: "${context}", generate a 3-step 'Sovereignty Ritual'.
Return only a JSON object with exactly these fields:
{
  "botanical": "A specific herb or scent with ancestral context",
  "movement": "A gentle somatic movement",
  "mantra": "A powerful sovereign declaration"
}`;

  try {
    const geminiRes = await callGemini(GEMINI_CHAT_URL, {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction: {
        parts: [{ text: "You are the Oracle generating a sacred ritual. Return only valid JSON." }],
      },
      generationConfig: { responseMimeType: "application/json" },
    });

    if (!geminiRes.ok) {
      res.status(502).json({ error: "Gemini API error" });
      return;
    }

    const data = (await geminiRes.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const ritual = JSON.parse(raw);
    res.json(ritual);
  } catch (err) {
    req.log.error({ err }, "Error generating ritual");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/passport", async (req, res) => {
  const { context } = req.body as { context: string };
  const prompt = `Summarize this session for the user's Digital Wellness Passport.
Conversation: "${context}"
Identify current Signals (from the 34 menopausal signals) and the Emotional Landscape.
Return JSON with: { "signals": ["signal1", "signal2"], "emotionalLandscape": "...", "affirmation": "..." }`;

  try {
    const geminiRes = await callGemini(GEMINI_CHAT_URL, {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction: {
        parts: [{ text: "You are the Scribe of the Sovereign Circle. Return only valid JSON." }],
      },
      generationConfig: { responseMimeType: "application/json" },
    });

    if (!geminiRes.ok) {
      res.status(502).json({ error: "Gemini API error" });
      return;
    }

    const data = (await geminiRes.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const passport = JSON.parse(raw);
    res.json(passport);
  } catch (err) {
    req.log.error({ err }, "Error generating passport entry");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
