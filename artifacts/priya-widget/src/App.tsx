import { useState, useEffect, useRef, useCallback } from "react";
import "./priya.css";
const lotusImg = import.meta.env.BASE_URL + "lotus-transparent.png";
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
  const res = await fetch(`${BASE_URL}/api/priya${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<T>;
}

function pcmToWav(base64Pcm: string, sampleRate: number): Blob {
  const pcmBuffer = Uint8Array.from(atob(base64Pcm), (c) =>
    c.charCodeAt(0)
  ).buffer;
  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);
  view.setUint32(0, 0x52494646, false);
  view.setUint32(4, 36 + pcmBuffer.byteLength, true);
  view.setUint32(8, 0x57415645, false);
  view.setUint32(12, 0x666d7420, false);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461, false);
  view.setUint32(40, pcmBuffer.byteLength, true);
  return new Blob([wavHeader, pcmBuffer], { type: "audio/wav" });
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
  const [isListening, setIsListening] = useState(false);
  const [isHandsFree, setIsHandsFree] = useState(true);
  const [voiceActive, setVoiceActive] = useState(false);
  const [modal, setModal] = useState<ModalContent>(null);
  const [showActions, setShowActions] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProcessingRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const isStartingRef = useRef(false);
  const isListeningRef = useRef(false);
  const isHandsFreeRef = useRef(true);
  const sessionTranscriptRef = useRef<string[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const barsContainerRef = useRef<HTMLDivElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const historyRef = useRef<Array<{ role: string; parts: Array<{ text: string }> }>>([]);

  isHandsFreeRef.current = isHandsFree;
  isListeningRef.current = isListening;

  const updateStatus = useCallback((text: string) => setStatus(text), []);

  const displaySpeech = useCallback((text: string) => {
    setTranscriptOpacity(0);
    setTimeout(() => {
      setTranscript(text);
      setTranscriptOpacity(1);
    }, 400);
  }, []);

  const safeStop = useCallback(() => {
    if (recognitionRef.current && (isListeningRef.current || isStartingRef.current)) {
      try { recognitionRef.current.stop(); } catch {}
    }
  }, []);

  const safeStart = useCallback(() => {
    if (
      !recognitionRef.current ||
      isListeningRef.current ||
      isStartingRef.current ||
      !isHandsFreeRef.current ||
      isSpeakingRef.current ||
      isProcessingRef.current
    ) return;
    try {
      isStartingRef.current = true;
      recognitionRef.current.start();
    } catch {
      isStartingRef.current = false;
    }
  }, []);

  const speakText = useCallback(async (text: string) => {
    isSpeakingRef.current = true;
    setVoiceActive(true);
    updateStatus("Illuminating...");
    safeStop();
    try {
      const data = await apiPost<{ pcmData: string }>("/speak", { text });
      const blob = pcmToWav(data.pcmData, 24000);
      const url = URL.createObjectURL(blob);
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = url;
      await new Promise<void>((resolve) => {
        if (!audioRef.current) { resolve(); return; }
        audioRef.current.onended = () => resolve();
        audioRef.current.onerror = () => resolve();
        audioRef.current.play().catch(() => resolve());
      });
    } catch {
    }
    isSpeakingRef.current = false;
    setVoiceActive(false);
    if (isHandsFreeRef.current) {
      updateStatus("I am listening");
      safeStart();
    }
  }, [updateStatus, safeStop, safeStart]);

  const handleVoiceEnd = useCallback(async (text: string) => {
    isProcessingRef.current = true;
    safeStop();
    sessionTranscriptRef.current.push(`User: ${text}`);
    const userTurn = { role: "user", parts: [{ text }] };
    historyRef.current.push(userTurn);
    updateStatus("Reflecting...");
    try {
      const data = await apiPost<{ text: string }>("/chat", {
        prompt: text,
        history: historyRef.current.slice(0, -1),
      });
      if (data.text) {
        sessionTranscriptRef.current.push(`Priya: ${data.text}`);
        historyRef.current.push({ role: "model", parts: [{ text: data.text }] });
        setShowActions(true);
        displaySpeech(data.text);
        await speakText(data.text);
      }
    } catch {
      updateStatus("A ripple in the silence...");
    } finally {
      isProcessingRef.current = false;
      if (isHandsFreeRef.current) safeStart();
    }
  }, [safeStop, safeStart, updateStatus, displaySpeech, speakText]);

  const initRecognition = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onstart = () => {
      isListeningRef.current = true;
      isStartingRef.current = false;
      setIsListening(true);
      if (!isSpeakingRef.current) updateStatus("Listening to your spirit");
    };

    rec.onresult = (event: SpeechRecognitionEvent) => {
      if (isSpeakingRef.current || isProcessingRef.current) return;
      let t = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        t += event.results[i][0].transcript;
      }
      setTranscript(t);
      setTranscriptOpacity(0.5);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (t.trim().length > 0) {
        silenceTimerRef.current = setTimeout(() => handleVoiceEnd(t), 1800);
      }
    };

    rec.onend = () => {
      isListeningRef.current = false;
      isStartingRef.current = false;
      setIsListening(false);
      setTimeout(() => {
        if (isHandsFreeRef.current && !isSpeakingRef.current && !isProcessingRef.current) {
          safeStart();
        }
      }, 200);
    };

    recognitionRef.current = rec;
  }, [updateStatus, handleVoiceEnd, safeStart]);

  const startSession = useCallback(async () => {
    setAppState("active");
    setTimeout(() => {
      if (barsContainerRef.current) createBars(barsContainerRef.current);
    }, 50);
    initRecognition();
    const greeting =
      "I have been waiting for you. Before we talk about biology — how does your body feel today, and where does your spirit sit within it?";
    displaySpeech(greeting);
    historyRef.current.push({ role: "model", parts: [{ text: greeting }] });
    await speakText(greeting);
    if (isHandsFreeRef.current) safeStart();
  }, [initRecognition, displaySpeech, speakText, safeStart]);

  const toggleHandsFree = useCallback(() => {
    const next = !isHandsFreeRef.current;
    isHandsFreeRef.current = next;
    setIsHandsFree(next);
    if (!next) { safeStop(); updateStatus("Presence paused"); }
    else { safeStart(); }
  }, [safeStop, safeStart, updateStatus]);

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
              <div className="entrance-text">
                <h2 className="welcome-quote serif">"I have been waiting for you."</h2>
                <button className="enter-btn" onClick={startSession}>
                  Enter the Sanctuary
                </button>
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
                  className="transcript-text serif"
                  style={{ opacity: transcriptOpacity, transition: "opacity 0.7s ease" }}
                >
                  {transcript}
                </p>
              </div>

              {showActions && (
                <div className="action-bar fade-up">
                  <button className="btn-sparkle" onClick={generateRitual}>
                    ✨ Illuminate Ritual
                  </button>
                  <button className="btn-sparkle" onClick={syncToPassport}>
                    ✨ Sync to Passport
                  </button>
                </div>
              )}
            </div>
          )}
        </main>

        {appState === "active" && (
          <footer className="priya-footer">
            <div className="glass-ui status-bar">
              {isListening && <div className="indicator-dot blink" />}
              <span className="status-text">{status}</span>
            </div>
            <button className="hands-free-btn" onClick={toggleHandsFree}>
              {isHandsFree ? "Pause Hands-Free Mode" : "Enable Hands-Free Mode"}
            </button>
          </footer>
        )}

        <div className="passport-footer">
          <span className="passport-label">Digital Wellness Passport</span>
          <div className="passport-line" />
        </div>

        <audio ref={audioRef} style={{ display: "none" }} />
      </div>
    </div>
  );
}
