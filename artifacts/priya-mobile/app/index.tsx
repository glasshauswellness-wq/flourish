import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Animated,
  Platform,
  Modal,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";

const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN;
const API_BASE = DOMAIN ? `https://${DOMAIN}` : "";

const PRIYA_PORTRAIT = require("../assets/images/priya-portrait.jpg");
const LOTUS_IMG = require("../assets/images/lotus-flower.png");

type Message = { id: string; role: "user" | "priya"; text: string };
type ModalKind = "ritual" | "passport" | "menu" | null;

interface RitualData {
  botanical: string;
  movement: string;
  mantra: string;
}
interface PassportData {
  signals: string[];
  emotionalLandscape: string;
  affirmation: string;
}

async function apiPost<T>(path: string, body: object): Promise<T> {
  const res = await expoFetch(`${API_BASE}/api/priya${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<T>;
}

async function* streamChat(
  path: string,
  body: object
): AsyncGenerator<string> {
  const res = await expoFetch(`${API_BASE}/api/priya${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error(`API error ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value as Uint8Array, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        const chunk = JSON.parse(raw) as { delta?: string; error?: string };
        if (chunk.error) throw new Error(chunk.error);
        if (chunk.delta) yield chunk.delta;
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
}

function PulseRing({
  active,
  size,
  color,
  delay = 0,
}: {
  active: boolean;
  size: number;
  color: string;
  delay?: number;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (active) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      anim.setValue(0);
    }
  }, [active, delay]);

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] });
  const opacity = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.7, 0.3, 0] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1,
        borderColor: color,
        transform: [{ scale }],
        opacity,
      }}
    />
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowPriya]}>
      <View style={styles.msgLabelRow}>
        <Text style={[styles.msgLabel, isUser ? styles.msgLabelUser : styles.msgLabelPriya]}>
          {isUser ? "YOU" : "PRIYA"}
        </Text>
      </View>
      <Text style={[styles.msgText, isUser ? styles.msgTextUser : styles.msgTextPriya]}>
        {msg.text}
      </Text>
    </View>
  );
}

export default function PriyaScreen() {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<"entrance" | "active">("entrance");
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [statusText, setStatusText] = useState("Attuning to presence");
  const [inputText, setInputText] = useState("");
  const [modalKind, setModalKind] = useState<ModalKind>(null);
  const [ritualData, setRitualData] = useState<RitualData | null>(null);
  const [passportData, setPassportData] = useState<PassportData | null>(null);
  const [hasSession, setHasSession] = useState(false);

  const soundRef = useRef<Audio.Sound | null>(null);
  const historyRef = useRef<Array<{ role: string; parts: Array<{ text: string }> }>>([]);
  const sessionRef = useRef<string[]>([]);
  const isProcessingRef = useRef(false);

  const breatheAnim = useRef(new Animated.Value(0)).current;
  const entranceFadeAnim = useRef(new Animated.Value(0)).current;
  const activeFadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breatheAnim, {
          toValue: 1,
          duration: 6000,
          useNativeDriver: true,
        }),
        Animated.timing(breatheAnim, {
          toValue: 0,
          duration: 6000,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  useEffect(() => {
    Animated.timing(entranceFadeAnim, {
      toValue: 1,
      duration: 1200,
      useNativeDriver: true,
    }).start();
  }, []);

  const stopAudio = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch {}
      soundRef.current = null;
    }
  }, []);

  const playAudioBase64 = useCallback(
    async (base64: string): Promise<void> => {
      await stopAudio();
      const uri = `${FileSystem.cacheDirectory}priya_${Date.now()}.mp3`;
      try {
        await FileSystem.writeAsStringAsync(uri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true }
        );
        soundRef.current = sound;
        await new Promise<void>((resolve) => {
          sound.setOnPlaybackStatusUpdate((status) => {
            if (!status.isLoaded) return;
            if (status.didJustFinish || !status.isPlaying) {
              sound.unloadAsync().catch(() => {});
              soundRef.current = null;
              resolve();
            }
          });
        });
      } catch {
        // TTS failed silently — text is still shown
      } finally {
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      }
    },
    [stopAudio]
  );

  const speakText = useCallback(
    async (text: string) => {
      setIsSpeaking(true);
      try {
        const data = await apiPost<{ audio: string; format: string }>("/speak", { text });
        await playAudioBase64(data.audio);
      } catch {
        setStatusText("Voice resting — continue below");
      } finally {
        setIsSpeaking(false);
      }
    },
    [playAudioBase64]
  );

  const processMessage = useCallback(
    async (userText: string) => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;
      setIsProcessing(true);

      const userId = Date.now().toString() + Math.random().toString(36).slice(2, 7);
      setMessages((prev) => [...prev, { id: userId, role: "user", text: userText }]);
      sessionRef.current.push(`You: ${userText}`);
      historyRef.current.push({ role: "user", parts: [{ text: userText }] });
      setStatusText("Reflecting…");

      try {
        let accumulated = "";
        const gen = streamChat("/chat/stream", {
          prompt: userText,
          history: historyRef.current.slice(0, -1),
        });

        for await (const delta of gen) {
          accumulated += delta;
          setStreamingText(accumulated);
          setStatusText("Illuminating…");
        }

        if (accumulated) {
          const priyaId = Date.now().toString() + Math.random().toString(36).slice(2, 7);
          setMessages((prev) => [
            ...prev,
            { id: priyaId, role: "priya", text: accumulated },
          ]);
          sessionRef.current.push(`Priya: ${accumulated}`);
          historyRef.current.push({ role: "model", parts: [{ text: accumulated }] });
          setStreamingText("");
          setHasSession(true);
          setStatusText("Preparing voice…");
          await speakText(accumulated);
        }

        setStatusText("I am listening");
      } catch {
        setStatusText("A ripple in the silence…");
        setStreamingText("");
      } finally {
        isProcessingRef.current = false;
        setIsProcessing(false);
      }
    },
    [speakText]
  );

  const startSession = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPhase("active");
    Animated.timing(activeFadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    const greeting =
      "I have been waiting for you. How does your body feel today, and where does your spirit sit within it?";

    const priyaId = Date.now().toString() + "g";
    setMessages([{ id: priyaId, role: "priya", text: greeting }]);
    sessionRef.current = [`Priya: ${greeting}`];
    historyRef.current = [{ role: "model", parts: [{ text: greeting }] }];
    setStatusText("Preparing voice…");
    await speakText(greeting);
    setStatusText("I am listening");
  }, [speakText, activeFadeAnim]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isProcessingRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInputText("");
    await processMessage(text);
  }, [inputText, processMessage]);

  const handleRitual = useCallback(async () => {
    setModalKind(null);
    if (sessionRef.current.length === 0) return;
    setStatusText("Summoning your ritual…");
    try {
      const data = await apiPost<RitualData>("/ritual", {
        context: sessionRef.current.join(" | "),
      });
      setRitualData(data);
      setModalKind("ritual");
    } catch {
      setStatusText("The ritual is resting…");
    } finally {
      setStatusText("I am listening");
    }
  }, []);

  const handlePassport = useCallback(async () => {
    setModalKind(null);
    if (sessionRef.current.length === 0) return;
    setStatusText("Scribing your journey…");
    try {
      const data = await apiPost<PassportData>("/passport", {
        context: sessionRef.current.join(" | "),
      });
      setPassportData(data);
      setModalKind("passport");
    } catch {
      setStatusText("The scroll is empty…");
    } finally {
      setStatusText("I am listening");
    }
  }, []);

  const handleEndSession = useCallback(async () => {
    setModalKind(null);
    await stopAudio();
    setPhase("entrance");
    setMessages([]);
    setStreamingText("");
    setStatusText("Attuning to presence");
    historyRef.current = [];
    sessionRef.current = [];
    setHasSession(false);
    setRitualData(null);
    setPassportData(null);
    isProcessingRef.current = false;
    setIsProcessing(false);
    setIsSpeaking(false);
    Animated.timing(entranceFadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [stopAudio, entranceFadeAnim]);

  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, [stopAudio]);

  const displayMessages = useMemo(() => [...messages].reverse(), [messages]);

  const auraScale = breatheAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.15],
  });
  const auraOpacity = breatheAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.25, 0.5],
  });

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPad = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#3d2b5d", "#1a0f2e", "#110a1f"]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View
        pointerEvents="none"
        style={[
          styles.aura,
          { transform: [{ scale: auraScale }], opacity: auraOpacity },
        ]}
      />

      {phase === "entrance" && (
        <Animated.View
          style={[styles.entranceContainer, { opacity: entranceFadeAnim, paddingTop: topPad, paddingBottom: botPad + 24 }]}
        >
          <View style={styles.entranceHeader}>
            <Text style={styles.priyaTitle}>PRIYA</Text>
            <Text style={styles.priyaSubtitle}>THE SOVEREIGN CIRCLE</Text>
          </View>

          <View style={styles.portraitArea}>
            <Image source={LOTUS_IMG} style={styles.lotusEntranceImg} resizeMode="contain" />
            <View style={styles.portraitRing}>
              <PulseRing active size={220} color="rgba(177, 156, 217, 0.4)" />
              <PulseRing active size={220} color="rgba(177, 156, 217, 0.3)" delay={800} />
              <Image source={PRIYA_PORTRAIT} style={styles.portraitImg} />
            </View>
          </View>

          <Text style={styles.welcomeQuote}>
            {"\u201cI have been waiting for you.\u201d"}
          </Text>

          <TouchableOpacity
            style={styles.enterBtn}
            onPress={startSession}
            activeOpacity={0.8}
          >
            <View style={styles.enterBtnInner}>
              <Text style={styles.enterBtnName}>Enter Flourish</Text>
              <Text style={styles.enterBtnSub}>a Glasshaus Pod</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.passportFooter}>
            <View style={styles.passportLine} />
            <Text style={styles.passportLabel}>Digital Wellness Passport</Text>
            <View style={styles.passportLine} />
          </View>
        </Animated.View>
      )}

      {phase === "active" && (
        <KeyboardAvoidingView
          style={styles.activeContainer}
          behavior="padding"
          keyboardVerticalOffset={0}
        >
          <View style={[styles.activeHeader, { paddingTop: topPad + 12 }]}>
            <View style={styles.headerPortraitWrap}>
              <PulseRing active={isSpeaking} size={52} color="rgba(212, 175, 55, 0.5)" />
              <Image source={PRIYA_PORTRAIT} style={styles.headerPortrait} />
              {(isProcessing || isSpeaking) && (
                <View style={styles.headerDot}>
                  <ActivityIndicator size="small" color="#d4af37" />
                </View>
              )}
            </View>
            <View style={styles.headerTextGroup}>
              <Text style={styles.headerName}>PRIYA</Text>
              <Text style={styles.headerStatus} numberOfLines={1}>
                {statusText}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.menuBtn}
              onPress={() => setModalKind("menu")}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Feather name="more-horizontal" size={22} color="rgba(177, 156, 217, 0.7)" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={displayMessages}
            keyExtractor={(item) => item.id}
            inverted
            contentContainerStyle={[styles.messageList, { paddingBottom: 16 }]}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              streamingText ? (
                <View style={[styles.msgRow, styles.msgRowPriya, { marginBottom: 8 }]}>
                  <View style={styles.msgLabelRow}>
                    <Text style={[styles.msgLabel, styles.msgLabelPriya]}>PRIYA</Text>
                  </View>
                  <Text style={[styles.msgText, styles.msgTextPriya, { opacity: 0.75 }]}>
                    {streamingText}
                  </Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => <MessageBubble msg={item} />}
          />

          <View style={[styles.inputBar, { paddingBottom: botPad + 8 }]}>
            <TextInput
              style={styles.textInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Speak your truth…"
              placeholderTextColor="rgba(177, 156, 217, 0.4)"
              multiline
              maxLength={500}
              editable={!isProcessing}
              returnKeyType="send"
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!inputText.trim() || isProcessing) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!inputText.trim() || isProcessing}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-up" size={20} color="#1a0f2e" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      <Modal
        visible={modalKind === "menu"}
        transparent
        animationType="slide"
        onRequestClose={() => setModalKind(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setModalKind(null)}>
          <Pressable style={styles.menuSheet} onPress={() => {}}>
            <View style={styles.menuHandle} />
            <Text style={styles.menuTitle}>Session</Text>

            <TouchableOpacity
              style={[styles.menuItem, !hasSession && styles.menuItemDisabled]}
              onPress={hasSession ? handleRitual : undefined}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name="flower-outline"
                size={20}
                color={hasSession ? "#d4af37" : "rgba(212, 175, 55, 0.35)"}
              />
              <Text style={[styles.menuItemText, !hasSession && styles.menuItemTextDisabled]}>
                Sovereignty Ritual
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, !hasSession && styles.menuItemDisabled]}
              onPress={hasSession ? handlePassport : undefined}
              activeOpacity={0.7}
            >
              <Ionicons
                name="book-outline"
                size={20}
                color={hasSession ? "#b19cd9" : "rgba(177, 156, 217, 0.35)"}
              />
              <Text style={[styles.menuItemText, !hasSession && styles.menuItemTextDisabled]}>
                Wellness Passport
              </Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleEndSession}
              activeOpacity={0.7}
            >
              <Feather name="x-circle" size={20} color="rgba(239, 68, 68, 0.7)" />
              <Text style={[styles.menuItemText, { color: "rgba(239, 68, 68, 0.8)" }]}>
                End Session
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={modalKind === "ritual" && ritualData !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setModalKind(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setModalKind(null)}>
          <Pressable style={styles.ritualCard} onPress={() => {}}>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setModalKind(null)}
            >
              <Feather name="x" size={20} color="rgba(177, 156, 217, 0.6)" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Sovereignty Ritual</Text>
            {ritualData && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <RitualSection icon="🌿" label="Botanical" text={ritualData.botanical} />
                <RitualSection icon="✦" label="Movement" text={ritualData.movement} />
                <RitualSection icon="◈" label="Mantra" text={`"${ritualData.mantra}"`} />
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={modalKind === "passport" && passportData !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setModalKind(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setModalKind(null)}>
          <Pressable style={styles.ritualCard} onPress={() => {}}>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setModalKind(null)}
            >
              <Feather name="x" size={20} color="rgba(177, 156, 217, 0.6)" />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: "#b19cd9" }]}>
              Passport Entry
            </Text>
            {passportData && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.passportSection}>
                  <Text style={styles.passportSectionLabel}>SIGNALS PRESENT</Text>
                  {passportData.signals?.map((s, i) => (
                    <Text key={i} style={styles.passportSignal}>
                      • {s}
                    </Text>
                  ))}
                </View>
                <View style={styles.passportSection}>
                  <Text style={styles.passportSectionLabel}>EMOTIONAL LANDSCAPE</Text>
                  <Text style={styles.passportBody}>{passportData.emotionalLandscape}</Text>
                </View>
                <View style={styles.passportSection}>
                  <Text style={styles.passportSectionLabel}>AFFIRMATION</Text>
                  <Text style={[styles.passportBody, { color: "#d4af37", fontStyle: "italic" }]}>
                    {`"${passportData.affirmation}"`}
                  </Text>
                </View>
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function RitualSection({
  icon,
  label,
  text,
}: {
  icon: string;
  label: string;
  text: string;
}) {
  return (
    <View style={styles.ritualSection}>
      <Text style={styles.ritualLabel}>
        {icon} {label}
      </Text>
      <Text style={styles.ritualBody}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#1a0f2e",
  },
  aura: {
    position: "absolute",
    top: "20%",
    left: "10%",
    right: "10%",
    bottom: "20%",
    borderRadius: 9999,
    backgroundColor: "rgba(177, 156, 217, 0.18)",
  },

  // ─── Entrance ───
  entranceContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 32,
  },
  entranceHeader: {
    alignItems: "center",
    paddingTop: 8,
  },
  priyaTitle: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 44,
    fontWeight: "400",
    letterSpacing: 12,
    color: "#f1f5f9",
  },
  priyaSubtitle: {
    fontSize: 9,
    letterSpacing: 8,
    color: "#c4b5fd",
    marginTop: 4,
    fontWeight: "500",
  },
  portraitArea: {
    width: 260,
    height: 260,
    alignItems: "center",
    justifyContent: "center",
  },
  lotusEntranceImg: {
    position: "absolute",
    width: 320,
    height: 320,
    opacity: 0.85,
  },
  portraitRing: {
    width: 176,
    height: 176,
    alignItems: "center",
    justifyContent: "center",
  },
  portraitImg: {
    width: 152,
    height: 152,
    borderRadius: 76,
    borderWidth: 2,
    borderColor: "rgba(212, 175, 55, 0.5)",
  },
  welcomeQuote: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 20,
    fontStyle: "italic",
    color: "#e2e8f0",
    textAlign: "center",
    lineHeight: 30,
    paddingHorizontal: 8,
  },
  enterBtn: {
    backgroundColor: "#b19cd9",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 48,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  enterBtnInner: {
    alignItems: "center",
    gap: 2,
  },
  enterBtnName: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 3,
    color: "#1a0f2e",
  },
  enterBtnSub: {
    fontSize: 10,
    color: "rgba(26, 15, 46, 0.65)",
    letterSpacing: 1,
    fontStyle: "italic",
  },
  passportFooter: {
    alignItems: "center",
    gap: 6,
    opacity: 0.45,
  },
  passportLine: {
    width: 80,
    height: 1,
    backgroundColor: "rgba(212, 175, 55, 0.35)",
  },
  passportLabel: {
    fontSize: 8,
    letterSpacing: 5,
    color: "#6b7280",
    textTransform: "uppercase",
  },

  // ─── Active ───
  activeContainer: {
    flex: 1,
  },
  activeHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(177, 156, 217, 0.1)",
  },
  headerPortraitWrap: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  headerPortrait: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: "rgba(212, 175, 55, 0.4)",
  },
  headerDot: {
    position: "absolute",
    bottom: -2,
    right: -2,
  },
  headerTextGroup: {
    flex: 1,
  },
  headerName: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 16,
    letterSpacing: 5,
    color: "#f1f5f9",
    fontWeight: "400",
  },
  headerStatus: {
    fontSize: 10,
    letterSpacing: 2,
    color: "#c4b5fd",
    marginTop: 2,
  },
  menuBtn: {
    padding: 8,
  },
  messageList: {
    paddingHorizontal: 20,
    paddingTop: 16,
    flexGrow: 1,
    justifyContent: "flex-end",
  },
  msgRow: {
    marginBottom: 20,
    maxWidth: "85%",
  },
  msgRowPriya: {
    alignSelf: "flex-start",
    alignItems: "flex-start",
  },
  msgRowUser: {
    alignSelf: "flex-end",
    alignItems: "flex-end",
  },
  msgLabelRow: {
    marginBottom: 4,
  },
  msgLabel: {
    fontSize: 8,
    letterSpacing: 3,
    fontWeight: "600",
    opacity: 0.6,
  },
  msgLabelPriya: {
    color: "#d4af37",
  },
  msgLabelUser: {
    color: "#b19cd9",
  },
  msgText: {
    fontSize: 16,
    lineHeight: 26,
  },
  msgTextPriya: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontStyle: "italic",
    color: "#f1f5f9",
  },
  msgTextUser: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    color: "#c4b5fd",
    textAlign: "right",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(177, 156, 217, 0.12)",
    gap: 10,
    backgroundColor: "rgba(26, 15, 46, 0.9)",
  },
  textInput: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    borderWidth: 1,
    borderColor: "rgba(177, 156, 217, 0.25)",
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 11,
    color: "#e2e8f0",
    fontSize: 15,
    maxHeight: 120,
    lineHeight: 22,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#d4af37",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  sendBtnDisabled: {
    backgroundColor: "rgba(212, 175, 55, 0.35)",
  },

  // ─── Menu Sheet ───
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  menuSheet: {
    backgroundColor: "#1e1035",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "rgba(177, 156, 217, 0.2)",
  },
  menuHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(177, 156, 217, 0.35)",
    alignSelf: "center",
    marginBottom: 20,
  },
  menuTitle: {
    fontSize: 9,
    letterSpacing: 5,
    color: "rgba(177, 156, 217, 0.5)",
    textTransform: "uppercase",
    paddingHorizontal: 24,
    marginBottom: 8,
    fontWeight: "600",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  menuItemDisabled: {
    opacity: 0.4,
  },
  menuItemText: {
    fontSize: 15,
    letterSpacing: 1,
    color: "#d4af37",
    fontWeight: "500",
  },
  menuItemTextDisabled: {
    color: "rgba(212, 175, 55, 0.5)",
  },
  menuDivider: {
    height: 1,
    backgroundColor: "rgba(177, 156, 217, 0.12)",
    marginHorizontal: 24,
    marginVertical: 8,
  },

  // ─── Ritual / Passport Modal ───
  ritualCard: {
    backgroundColor: "rgba(26, 15, 46, 0.97)",
    borderRadius: 28,
    marginHorizontal: 20,
    marginBottom: 40,
    padding: 28,
    maxHeight: "75%",
    borderWidth: 1,
    borderColor: "rgba(212, 175, 55, 0.2)",
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 12 },
  },
  modalClose: {
    position: "absolute",
    top: 20,
    right: 20,
    zIndex: 1,
    padding: 6,
  },
  modalTitle: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 18,
    fontWeight: "400",
    letterSpacing: 3,
    color: "#d4af37",
    textTransform: "uppercase",
    marginBottom: 20,
  },
  ritualSection: {
    marginBottom: 20,
  },
  ritualLabel: {
    fontSize: 9,
    letterSpacing: 4,
    color: "rgba(177, 156, 217, 0.7)",
    textTransform: "uppercase",
    marginBottom: 8,
    fontWeight: "600",
  },
  ritualBody: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 15,
    color: "#e2e8f0",
    lineHeight: 24,
    fontStyle: "italic",
  },
  passportSection: {
    marginBottom: 20,
  },
  passportSectionLabel: {
    fontSize: 9,
    letterSpacing: 4,
    color: "rgba(177, 156, 217, 0.7)",
    textTransform: "uppercase",
    marginBottom: 8,
    fontWeight: "600",
  },
  passportSignal: {
    fontSize: 14,
    color: "#c4b5fd",
    lineHeight: 22,
    marginBottom: 2,
  },
  passportBody: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 15,
    color: "#e2e8f0",
    lineHeight: 24,
  },
});
