import { useState, useEffect, useRef, useCallback } from "react";
import "./priya.css";
const lotusImg = import.meta.env.BASE_URL + "lotus-flower.png";
import priyaImg from "@assets/3AE65435-F171-41EB-9DD9-0EE7625AC3CF_1774744679511.jpeg";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

type AppState = "entrance" | "active";

interface Ritual {
  botanical: string;
  movement: string;
  mantra: string;
}

interface PassportEntry {
  signals: string[];
  emotionalLandscape: string;
  affirmation: string;
}

type ModalContent =
  | { kind: "ritual"; data: Ritual }
  | { kind: "passport"; data: PassportEntry }
  | null;

async function apiPost<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`/api/priya${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<T>;
}

async function apiStream(
  path: string,
  body: object,
  onDelta: (text: string) => void
): Promise<string> {
  const res = await fetch(`/api/priya${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error(`API error ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        const chunk = JSON.parse(raw) as { delta?: string };
        if (chunk.delta) {
          full += chunk.delta;
          onDelta(full);
        }
      } catch {}
    }
  }
  return full;
}


function createBars(container: HTMLDivElement) {
  container.innerHTML = "";
  const barCount = 60;
  const innerRadius = 110;
  for (let i = 0; i < barCount; i++) {
    const bar = document.createElement("div");
    bar.className = "orbit-bar";
    const angle = (i / barCount) * Math.PI * 2;
    const x = Math.cos(angle) * innerRadius;
    const y = Math.sin(angle) * innerRadius;
    bar.style.left = `calc(50% + ${x}px)`;
    bar.style.top = `calc(50% + ${y}px)`;
    bar.style.transformOrigin = "center left";
    bar.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
    bar.style.height = "8px";
    container.appendChild(bar);
  }
}

function animateBars(bars: NodeListOf<Element>, active: boolean) {
  bars.forEach((bar) => {
    const el = bar as HTMLElement;
    el.style.height = active
      ? `${8 + Math.random() * 30}px`
      : "8px";
  });
}

export default function App() {
  const [appState, setAppState] = useState<AppState>("entrance");
  const [status, setStatus] = useState("Attuning to presence");
  const [transcript, setTranscript] = useState("");
  const [transcriptOpacity, setTranscriptOpacity] = useState(0);
  const [transcriptSource, setTranscriptSource] = useState<"user" | "priya">("priya");
  const [isListening, setIsListening] = useState(false);
  const [isHandsFree, setIsHandsFree] = useState(true);
  const [voiceActive, setVoiceActive] = useState(false);
  const [modal, setModal] = useState<ModalContent>(null);
  const [showActions, setShowActions] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isProcessingRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const isListeningRef = useRef(false);
  const isHandsFreeRef = useRef(true);
  const sessionTranscriptRef = useRef<string[]>([]);
  const barsContainerRef = useRef<HTMLDivElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const historyRef = useRef<Array<{ role: string; parts: Array<{ text: string }> }>>([]);
  // Refs to allow mutual calls without circular deps
  const startListeningRef = useRef<() => void>(() => {});
  const handleVoiceEndRef = useRef<(text: string) => Promise<void>>(async () => {});

  isHandsFreeRef.current = isHandsFree;
  isListeningRef.current = isListening;

  const updateStatus = useCallback((text: string) => setStatus(text), []);

  const displaySpeech = useCallback((text: string, instant?: boolean) => {
    if (instant) {
      setTranscriptSource("priya");
      setTranscript(text);
      setTranscriptOpacity(1);
    } else {
      setTranscriptOpacity(0);
      setTimeout(() => {
        setTranscriptSource("priya");
        setTranscript(text);
        setTranscriptOpacity(1);
      }, 400);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
    isListeningRef.current = false;
    setIsListening(false);
  }, []);

  const audioCtxRef = useRef<AudioContext | null>(null);

  const unlockAudio = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
  }, []);

  const speakText = useCallback(async (text: string) => {
    stopListening();
    isSpeakingRef.current = true;
    setVoiceActive(true);
    try {
      const data = await apiPost<{ audio: string; format: string }>("/speak", { text });
      const binary = atob(data.audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") await ctx.resume();

      const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
      await new Promise<void>((resolve) => {
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.onended = () => resolve();
        source.start(0);
      });
    } catch (err) {
      console.error("speakText error:", err);
    }
    isSpeakingRef.current = false;
    setVoiceActive(false);
  }, [stopListening]);

  // startListening: creates a fresh recognition instance each time (continuous=false)
  // Chrome handles single-utterance sessions reliably; reuse causes rapid flicker
  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (!isHandsFreeRef.current || isSpeakingRef.current || isProcessingRef.current) return;
    if (isListeningRef.current) return;

    stopListening(); // abort any stale instance

    const rec = new SR();
    rec.continuous = false;   // single utterance — reliable in Chrome
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.maxAlternatives = 1;

    let capturedText = "";

    rec.onstart = () => {
      isListeningRef.current = true;
      setIsListening(true);
      updateStatus("Listening to your spirit");
    };

    rec.onresult = (event: SpeechRecognitionEvent) => {
      if (isSpeakingRef.current || isProcessingRef.current) return;
      let t = "";
      for (let i = 0; i < event.results.length; i++) {
        t += event.results[i][0].transcript;
      }
      capturedText = t;
      setTranscriptSource("user");
      setTranscript(t);
      setTranscriptOpacity(0.5);
    };

    rec.onend = () => {
      recognitionRef.current = null;
      isListeningRef.current = false;
      setIsListening(false);
      const text = capturedText.trim();
      if (text && !isSpeakingRef.current && !isProcessingRef.current) {
        handleVoiceEndRef.current(text);
      } else if (isHandsFreeRef.current && !isSpeakingRef.current && !isProcessingRef.current) {
        setTimeout(() => startListeningRef.current(), 400);
      }
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      recognitionRef.current = null;
      isListeningRef.current = false;
      setIsListening(false);
      const err = event.error;
      if ((err === "no-speech" || err === "audio-capture") &&
          isHandsFreeRef.current && !isSpeakingRef.current && !isProcessingRef.current) {
        setTimeout(() => startListeningRef.current(), 400);
      }
    };

    recognitionRef.current = rec;
    try { rec.start(); } catch {
      isListeningRef.current = false;
      setIsListening(false);
    }
  }, [stopListening, updateStatus]);

  // Keep refs current so callbacks always call the latest version
  startListeningRef.current = startListening;

  const handleVoiceEnd = useCallback(async (text: string) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    stopListening();
    sessionTranscriptRef.current.push(`User: ${text}`);
    historyRef.current.push({ role: "user", parts: [{ text }] });
    updateStatus("Reflecting...");
    try {
      let firstChunk = true;
      const fullText = await apiStream(
        "/chat/stream",
        { prompt: text, history: historyRef.current.slice(0, -1) },
        (accumulated) => {
          if (firstChunk) { firstChunk = false; updateStatus("Preparing voice..."); }
          setTranscriptSource("priya");
          setTranscript(accumulated);
          setTranscriptOpacity(1);
        }
      );
      if (fullText) {
        sessionTranscriptRef.current.push(`Priya: ${fullText}`);
        historyRef.current.push({ role: "model", parts: [{ text: fullText }] });
        updateStatus("Illuminating...");
        await speakText(fullText);
      }
    } catch {
      updateStatus("A ripple in the silence...");
    } finally {
      isProcessingRef.current = false;
      if (isHandsFreeRef.current) {
        updateStatus("I am listening");
        setTimeout(() => startListeningRef.current(), 300);
      } else {
        updateStatus("Ready");
      }
    }
  }, [stopListening, updateStatus, speakText]);

  // Keep ref current
  handleVoiceEndRef.current = handleVoiceEnd;

  const initRecognition = useCallback(() => {
    // No-op: recognition now starts fresh per utterance via startListening
  }, []);

  const startSession = useCallback(async () => {
    unlockAudio(); // must be synchronous in the click handler
    setAppState("active");
    setTimeout(() => {
      if (barsContainerRef.current) createBars(barsContainerRef.current);
    }, 50);
    const greeting =
      "I have been waiting for you. Before we talk about biology — how does your body feel today, and where does your spirit sit within it?";
    displaySpeech(greeting);
    historyRef.current.push({ role: "model", parts: [{ text: greeting }] });
    await speakText(greeting);
    if (isHandsFreeRef.current) startListening();
  }, [unlockAudio, displaySpeech, speakText, startListening]);

  const toggleHandsFree = useCallback(() => {
    const next = !isHandsFreeRef.current;
    isHandsFreeRef.current = next;
    setIsHandsFree(next);
    if (!next) { stopListening(); updateStatus("Presence paused"); }
    else { startListening(); }
  }, [stopListening, startListening, updateStatus]);

  const handleTextSubmit = useCallback(async () => {
    const text = textInput.trim();
    if (!text || isProcessingRef.current) return;
    unlockAudio(); // synchronous in click handler
    setTextInput("");
    setIsProcessing(true);
    setTranscriptSource("user");
    setTranscript(text);
    setTranscriptOpacity(1);
    await handleVoiceEnd(text);
    setIsProcessing(false);
  }, [textInput, unlockAudio, handleVoiceEnd]);

  const generateRitual = useCallback(async () => {
    updateStatus("Weaving your ritual...");
    try {
      const context = sessionTranscriptRef.current.join(" | ");
      const ritual = await apiPost<Ritual>("/ritual", { context });
      setModal({ kind: "ritual", data: ritual });
    } catch {
      updateStatus("The oracle is silent...");
    } finally {
      updateStatus(isHandsFreeRef.current ? "Listening" : "Ready");
    }
  }, [updateStatus]);

  const syncToPassport = useCallback(async () => {
    updateStatus("Scribing your journey...");
    try {
      const context = sessionTranscriptRef.current.join(" | ");
      const entry = await apiPost<PassportEntry>("/passport", { context });
      setModal({ kind: "passport", data: entry });
    } catch {
      updateStatus("The scroll is empty...");
    } finally {
      updateStatus(isHandsFreeRef.current ? "Listening" : "Ready");
    }
  }, [updateStatus]);

  useEffect(() => {
    if (appState !== "active") return;
    const active = isListening || voiceActive;
    const loop = () => {
      if (barsContainerRef.current) {
        const bars = barsContainerRef.current.querySelectorAll(".orbit-bar");
        animateBars(bars, active);
      }
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [appState, isListening, voiceActive]);

  return (
    <div className="priya-root">
      <div className="aura-animation" />

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="ritual-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setModal(null)}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="24" height="24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {modal.kind === "ritual" && (
              <div className="modal-content">
                <h3 className="modal-title gold">Ritual of Sovereignty</h3>
                <div className="modal-body">
                  <p><strong>🌿 Botanical:</strong> {modal.data.botanical}</p>
                  <p><strong>🌊 Movement:</strong> {modal.data.movement}</p>
                  <p><strong>✨ Mantra:</strong> <em>"{modal.data.mantra}"</em></p>
                </div>
              </div>
            )}

            {modal.kind === "passport" && (
              <div className="modal-content">
                <h3 className="modal-title purple">Passport Entry</h3>
                <div className="modal-body">
                  <p><strong>Signals Present:</strong></p>
                  <ul className="signals-list">
                    {modal.data.signals?.map((s, i) => <li key={i}>• {s}</li>)}
                  </ul>
                  <p><strong>Emotional Landscape:</strong></p>
                  <p className="landscape">{modal.data.emotionalLandscape}</p>
                  <p><strong>Affirmation:</strong></p>
                  <p className="affirmation"><em>"{modal.data.affirmation}"</em></p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="priya-app">
        <header className="priya-header">
          <h1 className="priya-name">Priya</h1>
          <p className="priya-subtitle">The Sovereign Circle</p>
        </header>

        <main className="priya-main">
          {appState === "entrance" && (
            <div className="entrance fade-up">
              <div className="portrait-area">
                <div className="lotus-bg entrance-lotus" style={{ backgroundImage: `url(${lotusImg})` }} />
                <div className="portrait-ring">
                  <div className="portrait-pulse" />
                  <div className="portrait-img entrance-portrait" style={{ backgroundImage: `url(${priyaImg})` }} />
                </div>
              </div>
              <button className="flourish-badge" onClick={startSession}>
                <span className="flourish-name">Enter Flourish</span>
                <span className="flourish-sub">a Glasshaus Pod</span>
              </button>

              <div className="entrance-passport-link" onClick={startSession}>
                <span className="passport-label">Digital Wellness Passport</span>
                <div className="passport-line" />
              </div>

              <div className="entrance-text">
                <h2 className="welcome-quote serif">"I have been waiting for you."</h2>
              </div>
            </div>
          )}

          {appState === "active" && (
            <div className="active-state">
              <div className={`voice-container${voiceActive || isListening ? " voice-active" : ""}`}>
                <div className="lotus-bg small-lotus" style={{ backgroundImage: `url(${lotusImg})` }} />
                <div className="visualizer-ring" />
                <div className="visualizer-ring ring-delay" />
                <div className="priya-portrait" style={{ backgroundImage: `url(${priyaImg})` }} />
                <div className="bars-orbit" ref={barsContainerRef} />
              </div>

              <div className="transcript-area">
                <p
                  className={`transcript-text serif${transcriptSource === "user" ? " transcript-user" : ""}`}
                  style={{ opacity: transcriptOpacity, transition: "opacity 0.7s ease" }}
                >
                  {transcriptSource === "user" ? `\u201c${transcript}\u201d` : transcript}
                </p>
              </div>

            </div>
          )}
        </main>

        {appState === "active" && (
          <footer className="priya-footer">
            <div className="text-input-row">
              <input
                className="text-input-field"
                type="text"
                placeholder="Type your message to Priya…"
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleTextSubmit()}
                disabled={isProcessing}
              />
              <button
                className="text-send-btn"
                onClick={handleTextSubmit}
                disabled={!textInput.trim() || isProcessing}
                aria-label="Send"
              >
                ↑
              </button>
            </div>
            <div className="glass-ui status-bar">
              {isListening && <div className="indicator-dot blink" />}
              <span className="status-text">{status}</span>
            </div>
            <button className="hands-free-btn" onClick={toggleHandsFree}>
              {isHandsFree ? "Pause Hands-Free Mode" : "Enable Hands-Free Mode"}
            </button>
          </footer>
        )}

      </div>
    </div>
  );
}
