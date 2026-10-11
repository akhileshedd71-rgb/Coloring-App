import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Droplets,
  Eraser,
  Heart,
  Image,
  LockKeyhole,
  Menu,
  Paintbrush,
  Palette,
  Pencil,
  Plus,
  Redo2,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Sticker as StickerIcon,
  Sun,
  Trash2,
  Undo2,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
} from "lucide-react";
import type { Artwork, Drawing, Mode, Profile, Settings, Tool } from "./types";
import { PALETTE } from "./types";
import { categories, drawings, getDrawing, loadDrawing } from "./data/drawings";
import { DrawingPreview } from "./components/DrawingPreview";
import { DrawingLibrary } from "./components/DrawingLibrary";
import { StudioViewport } from "./components/StudioViewport";
import { PaintCanvas } from "./components/PaintCanvas";
import type { PaintCanvasHandle } from "./components/PaintCanvas";
import {
  deleteArtwork,
  getArtworks,
  loadPreferences,
  saveArtwork,
  savePreferences,
} from "./lib/storage";
import { exportPicture } from "./lib/export";

const modes: {
  id: Mode;
  name: string;
  subtitle: string;
  icon: typeof Paintbrush;
  color: string;
  background: string;
}[] = [
  {
    id: "fill",
    name: "Tap & color",
    subtitle: "A little tap, a lot of joy",
    icon: Droplets,
    color: "#DE7967",
    background: "#FFF0E8",
  },
  {
    id: "paint",
    name: "Magic paint",
    subtitle: "Brushes, sparkles & more",
    icon: Paintbrush,
    color: "#77A888",
    background: "#EDF5E9",
  },
  {
    id: "draw",
    name: "Free draw",
    subtitle: "Let your ideas wander",
    icon: Pencil,
    color: "#C19C48",
    background: "#FFF6D8",
  },
  {
    id: "glow",
    name: "Glow party",
    subtitle: "Make the night sparkle",
    icon: WandSparkles,
    color: "#9D87CC",
    background: "#F1EBFA",
  },
  {
    id: "number",
    name: "Color by number",
    subtitle: "Match, tap, ta-da!",
    icon: "1" as unknown as typeof Paintbrush,
    color: "#6E9FBD",
    background: "#EAF3FA",
  },
];
const avatars = ["🐰", "🐻", "🐱", "🦊", "🐸", "🦄"];
const stickerChoices = [
  "⭐",
  "🌈",
  "🌸",
  "💖",
  "🦋",
  "🌻",
  "✨",
  "🍓",
  "☀️",
  "🐝",
  "🎈",
  "🍀",
];
const colorNames = [
  "Pink",
  "Orange",
  "Yellow",
  "Green",
  "Turquoise",
  "Blue",
  "Purple",
  "Lilac",
  "Brown",
  "Dark blue",
  "White",
];
type ModalName =
  | "gate"
  | "parents"
  | "profiles"
  | "about"
  | "clear"
  | "delete"
  | "finished"
  | null;
const initial = loadPreferences();
let audioContext: AudioContext | undefined;
function playNote() {
  try {
    audioContext ||= new AudioContext();
    void audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.type = "sine";
    oscillator.frequency.value = 520 + Math.random() * 160;
    gain.gain.setValueAtTime(0.025, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      audioContext.currentTime + 0.14,
    );
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.15);
  } catch {
    /* Sound is optional on devices without Web Audio. */
  }
}
function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "compact" : ""}`}>
      <div className="brand-mark">
        <span />
        <span />
        <span />
        <i />
      </div>
      <div>
        little color
        <span>
          club<span className="brand-dot">✦</span>
        </span>
      </div>
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const el = ref.current;
    const focusable = () =>
      [
        ...(el?.querySelectorAll<HTMLElement>(
          'button, input, select, [tabindex="0"]',
        ) || []),
      ].filter((node) => !node.hasAttribute("disabled"));
    focusable()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const els = focusable();
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${wide ? "wide" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="icon-button modal-close"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={22} />
        </button>
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState<"home" | "gallery" | "studio">("home");
  const [profiles, setProfiles] = useState<Profile[]>(initial.profiles);
  const [profileId, setProfileId] = useState(initial.activeProfile);
  const [settings, setSettings] = useState<Settings>(initial.settings);
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [mode, setMode] = useState<Mode>("fill");
  const [tool, setTool] = useState<Tool>("fill");
  const [color, setColor] = useState(PALETTE[0]);
  const [size, setSize] = useState(22);
  const [sticker, setSticker] = useState("⭐");
  const [history, setHistory] = useState<Artwork[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [drawing, setDrawing] = useState<Drawing>();
  const [modal, setModal] = useState<ModalName>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [celebrate, setCelebrate] = useState(false);
  const [finishedPreview, setFinishedPreview] = useState("");
  const [loadingPicture, setLoadingPicture] = useState("");
  const pictureRequest = useRef(0);
  const libraryScroll = useRef(0);
  const [gateAnswer, setGateAnswer] = useState("");
  const [gateAction, setGateAction] = useState<"parents" | "share">("parents");
  const [gateError, setGateError] = useState(false);
  const [gate, setGate] = useState([7, 6]);
  const [newName, setNewName] = useState("");
  const [newAvatar, setNewAvatar] = useState("🐻");
  const [deleteId, setDeleteId] = useState("");
  const canvasRef = useRef<PaintCanvasHandle>(null);
  const libraryRef = useRef<HTMLElement>(null);
  const art = history[historyIndex];
  const latestArtRef = useRef<Artwork | undefined>(art);
  latestArtRef.current = art;
  const profile = profiles.find((p) => p.id === profileId) || profiles[0];
  const myArt = artworks.filter((a) => a.profileId === profile.id);
  const closeModal = useCallback(() => setModal(null), []);
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    getArtworks()
      .then(setArtworks)
      .catch(() =>
        notify(
          "Your device could not open the art box. Check available storage.",
        ),
      );
  }, [notify]);
  useEffect(() => {
    try {
      savePreferences(profiles, profileId, settings);
    } catch {
      notify("Settings could not be saved. Your device storage may be full.");
    }
  }, [profiles, profileId, settings, notify]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const persist = useCallback(async (current: Artwork, thumbnail?: string) => {
    const saved = { ...current, thumbnail: thumbnail || current.thumbnail };
    await saveArtwork(saved);
    setArtworks((prev) => [saved, ...prev.filter((a) => a.id !== saved.id)]);
  }, []);
  useEffect(() => {
    if (page !== "studio" || !art) return;
    void persist(art, canvasRef.current?.exportThumbnail()).catch(() =>
      notify(
        "We could not save this picture. Your device storage may be full.",
      ),
    );
  }, [art, page, persist, notify]);
  useEffect(() => {
    const flush = () => {
      const current = latestArtRef.current;
      if (page === "studio" && current)
        void persist(current, canvasRef.current?.exportThumbnail()).catch(() =>
          notify(
            "Your latest picture could not be saved. Please check device storage.",
          ),
        );
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [page, persist, notify]);
  const leaveStudio = useCallback(
    async (target: "home" | "gallery" = "home") => {
      if (art && page === "studio") {
        try {
          await persist(art, canvasRef.current?.exportThumbnail());
        } catch {
          notify(
            "Your picture could not be saved. Please free some device storage and try again.",
          );
          return;
        }
      }
      setPage(target);
      setMenuOpen(false);
    },
    [art, page, persist, notify],
  );
  useEffect(() => {
    const back = (event: Event) => {
      if (loadingPicture) {
        event.preventDefault();
        pictureRequest.current++;
        setLoadingPicture("");
      } else if (modal) {
        event.preventDefault();
        setModal(null);
      } else if (page !== "home") {
        event.preventDefault();
        void leaveStudio();
      } else if (menuOpen) {
        event.preventDefault();
        setMenuOpen(false);
      }
    };
    window.addEventListener("android-back", back);
    return () => window.removeEventListener("android-back", back);
  }, [page, modal, menuOpen, loadingPicture, leaveStudio]);
  function changeArt(next: Artwork) {
    const updated = { ...next, updatedAt: Date.now() };
    latestArtRef.current = updated;
    void saveArtwork(updated).catch(() =>
      notify(
        "Your latest change could not be saved. Please check device storage.",
      ),
    );
    setHistory((prev) =>
      [...prev.slice(0, historyIndex + 1), updated].slice(-60),
    );
    setHistoryIndex(Math.min(historyIndex + 1, 59));
  }
  async function openArt(next: Artwork) {
    const request = ++pictureRequest.current;
    if (page === "home") libraryScroll.current = window.scrollY;
    setLoadingPicture(next.title);
    try {
      const pageDrawing = next.drawingId
        ? await loadDrawing(next.drawingId)
        : undefined;
      if (request !== pictureRequest.current) return;
      // Keep the open page alive independently of the browsing cache. A late,
      // cancelled request may rotate that cache while this child is coloring.
      setDrawing(pageDrawing);
      setHistory([next]);
      setHistoryIndex(0);
      setMode(next.mode);
      setTool(
        next.mode === "fill" || next.mode === "number" ? "fill" : "brush",
      );
      if (next.mode === "number" && pageDrawing)
        setColor(PALETTE[(pageDrawing.regions[0]?.number || 1) - 1]);
      setPage("studio");
      setMenuOpen(false);
      window.scrollTo(0, 0);
    } catch {
      if (request === pictureRequest.current)
        notify("This picture could not be opened. Please try another one.");
    } finally {
      if (request === pictureRequest.current) setLoadingPicture("");
    }
  }
  function startDrawing(item?: Drawing, selectedMode = mode) {
    openArt({
      id: crypto.randomUUID(),
      profileId: profile.id,
      drawingId: item?.id || "",
      title:
        selectedMode === "glow"
          ? "My glow party"
          : selectedMode === "draw"
            ? "My big idea"
            : item?.title || "My big idea",
      mode: selectedMode,
      fills: {},
      strokes: [],
      stickers: [],
      updatedAt: Date.now(),
    });
  }
  function chooseMode(next: Mode) {
    setMode(next);
    if (next === "draw" || next === "glow") startDrawing(undefined, next);
    else {
      setPage("home");
      window.setTimeout(
        () =>
          libraryRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        20,
      );
    }
  }
  function openGate(action: "parents" | "share") {
    setGateAction(action);
    setGate([
      Math.floor(Math.random() * 5) + 5,
      Math.floor(Math.random() * 5) + 4,
    ]);
    setGateAnswer("");
    setGateError(false);
    setModal("gate");
  }
  function openParents() {
    openGate("parents");
  }
  async function done() {
    if (!art) return;
    try {
      await persist(art, canvasRef.current?.exportThumbnail());
      setFinishedPreview(canvasRef.current?.exportThumbnail() || "");
      setModal("finished");
      setCelebrate(true);
      window.setTimeout(() => setCelebrate(false), 1800);
    } catch {
      notify(
        "We could not save this picture. Please check your device storage.",
      );
    }
  }
  async function download() {
    if (!canvasRef.current) return;
    try {
      await exportPicture(canvasRef.current.exportImage(), art.title);
      notify("Your masterpiece is ready to share!");
    } catch {
      notify(
        "Sharing was closed or is unavailable. Your picture is still in My art.",
      );
    }
  }
  useEffect(() => {
    if (page === "home" && libraryScroll.current > 0) {
      const frame = requestAnimationFrame(() =>
        window.scrollTo(0, libraryScroll.current),
      );
      return () => cancelAnimationFrame(frame);
    }
  }, [page]);
  const modeInfo = modes.find((m) => m.id === mode)!;
  const featured =
    settings.difficulty === "all"
      ? drawings[0]
      : drawings.find((item) => item.difficulty === settings.difficulty) ||
        drawings[0];

  return (
    <div className={`app ${page === "studio" ? "is-studio" : ""}`}>
      {page !== "studio" && (
        <>
          {menuOpen && (
            <div className="sidebar-shade" onClick={() => setMenuOpen(false)} />
          )}
          <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
            <Logo />
            <div className="sidebar-caption">YOUR HAPPY LITTLE SPACE</div>
            <nav aria-label="Main navigation">
              <button
                className={page === "home" ? "active" : ""}
                onClick={() => {
                  setPage("home");
                  setMenuOpen(false);
                }}
              >
                <BookOpen size={22} /> Let's color{" "}
                <span className="nav-flower">✿</span>
              </button>
              <button
                className={page === "gallery" ? "active" : ""}
                onClick={() => {
                  setPage("gallery");
                  setMenuOpen(false);
                }}
              >
                <Image size={22} /> My art{" "}
                <span className="nav-count">{myArt.length}</span>
              </button>
            </nav>
            <div className="sidebar-note">
              <div className="note-rainbow">🌈</div>
              <strong>
                Every color is
                <br />a good idea.
              </strong>
              <span>There’s no wrong way to create!</span>
              <i>✦</i>
            </div>
            <div className="sidebar-bottom">
              <button onClick={openParents}>
                <ShieldCheck size={20} /> Grown-up corner{" "}
                <LockKeyhole size={14} />
              </button>
              <button onClick={() => setModal("about")} className="made-with">
                <Heart size={13} /> Made for little imaginations
              </button>
              <span className="version">A little messy. A lot of magic.</span>
            </div>
          </aside>
          <main className="main">
            <header className="topbar">
              <div className="mobile-brand">
                <button
                  className="icon-button"
                  onClick={() => setMenuOpen(true)}
                  aria-label="Open menu"
                >
                  <Menu />
                </button>
                <Logo compact />
              </div>
              <div className="hello">
                <Sun size={20} /> A lovely day to create
              </div>
              <div className="top-actions">
                <button
                  className="icon-button sound-toggle"
                  aria-label={
                    settings.sound ? "Turn sound off" : "Turn sound on"
                  }
                  onClick={() =>
                    setSettings((s) => ({ ...s, sound: !s.sound }))
                  }
                >
                  {settings.sound ? (
                    <Volume2 size={20} />
                  ) : (
                    <VolumeX size={20} />
                  )}
                </button>
                <button
                  className="profile-button"
                  onClick={() => setModal("profiles")}
                >
                  <span className="avatar">{profile.avatar}</span>
                  <span>{profile.name}</span>
                  <ChevronDown size={16} />
                </button>
              </div>
            </header>
            {page === "home" ? (
              <div className="home-content">
                <div className="page-heading">
                  <div>
                    <h1>
                      Hi,{" "}
                      {profile.name === "Little artist"
                        ? "little artist"
                        : profile.name}
                      ! <span className="wave">✦</span>
                    </h1>
                    <p>What will your imagination make today?</p>
                  </div>
                  <span className="offline-badge">
                    <span /> All the fun. Always offline.
                  </span>
                </div>
                <section
                  className="hero"
                  aria-label="Welcome to Little Color Club"
                >
                  <div className="hero-copy">
                    <span className="eyebrow">
                      <span>✦</span> A LITTLE COLOR. A LOT OF HAPPY.
                    </span>
                    <h2>
                      Big ideas.
                      <br />
                      Little artists<span className="coral-period">.</span>
                    </h2>
                    <p>
                      {drawings.length} little adventures, a rainbow of colors,
                      <br className="desktop-break" /> and a little magic from
                      you.
                    </p>
                    <button
                      className="primary-button"
                      onClick={() => startDrawing(featured, "fill")}
                    >
                      Let's make some magic <ArrowRight size={20} />
                    </button>
                    <div className="hero-caption">
                      <Heart size={14} fill="currentColor" /> No ads. Just
                      imagination.
                    </div>
                  </div>
                  <div className="hero-art">
                    <div className="sun-doodle">
                      <i />
                      <span>✦</span>
                    </div>
                    <span className="art-sparkle one">✧</span>
                    <span className="art-sparkle two">✦</span>
                    <div className="drawing-paper">
                      <span className="paper-tape" />
                      <DrawingPreview drawing={featured} colored />
                      <span className="paper-caption">
                        made with a little love ♡
                      </span>
                    </div>
                    <div className="happy-sticker">
                      100%
                      <br />
                      <b>YOU!</b>
                    </div>
                    <svg className="hero-squiggle" viewBox="0 0 100 50">
                      <path
                        d="M5 35Q25 5 35 25T65 20T95 10"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="5"
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="crayon crayon-purple" />
                    <div className="crayon crayon-coral" />
                  </div>
                </section>
                <section className="play-section">
                  <div className="section-heading">
                    <h2>
                      So many ways to play <span>✧</span>
                    </h2>
                    <span>Pick your kind of magic</span>
                  </div>
                  <div className="mode-grid">
                    {modes.map((m) => (
                      <button
                        key={m.id}
                        className={`mode-card ${mode === m.id ? "selected" : ""}`}
                        style={
                          {
                            "--mode-bg": m.background,
                            "--mode-color": m.color,
                          } as React.CSSProperties
                        }
                        onClick={() => chooseMode(m.id)}
                      >
                        <span className="mode-icon">
                          {m.id === "number" ? (
                            <b>123</b>
                          ) : (
                            <m.icon size={27} strokeWidth={2.2} />
                          )}
                        </span>
                        <span className="mode-name">{m.name}</span>
                        <span className="mode-subtitle">{m.subtitle}</span>
                        {mode === m.id && (
                          <span className="mode-check">
                            <Check size={11} />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </section>
                <DrawingLibrary
                  ref={libraryRef}
                  drawings={drawings}
                  categories={categories}
                  mode={mode}
                  difficultyLimit={settings.difficulty}
                  onChoose={(item) =>
                    startDrawing(
                      item,
                      mode === "draw" || mode === "glow" ? "fill" : mode,
                    )
                  }
                />
              </div>
            ) : (
              <section className="gallery-page">
                <div className="page-heading">
                  <div>
                    <h1>
                      My happy little gallery <span>✦</span>
                    </h1>
                    <p>
                      {myArt.length
                        ? `${myArt.length} wonderful ${myArt.length === 1 ? "creation" : "creations"} by ${profile.name}. Tap one to keep creating.`
                        : "A special home for all your big ideas."}
                    </p>
                  </div>
                  <button
                    className="primary-button"
                    onClick={() => setPage("home")}
                  >
                    <Plus size={20} /> Make something
                  </button>
                </div>
                {myArt.length ? (
                  <div className="drawing-grid gallery-grid">
                    {myArt.map((a) => (
                      <article className="saved-art-card" key={a.id}>
                        <button
                          onClick={() => openArt(a)}
                          className="saved-art-open"
                          aria-label={`Continue ${a.title}`}
                        >
                          <div className="saved-art-image">
                            {a.thumbnail ? (
                              <img src={a.thumbnail} alt={a.title} />
                            ) : a.drawingId && getDrawing(a.drawingId) ? (
                              <DrawingPreview
                                drawing={getDrawing(a.drawingId)!}
                                fills={a.fills}
                              />
                            ) : (
                              <Palette size={64} />
                            )}
                          </div>
                          <h3>{a.title}</h3>
                          <p>
                            {modes.find((m) => m.id === a.mode)?.name} ·{" "}
                            {new Date(a.updatedAt).toLocaleDateString(
                              undefined,
                              { month: "short", day: "numeric" },
                            )}
                          </p>
                        </button>
                        <button
                          className="delete-art icon-button"
                          aria-label={`Delete ${a.title}`}
                          onClick={() => {
                            setDeleteId(a.id);
                            setModal("delete");
                          }}
                        >
                          <Trash2 size={17} />
                        </button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state gallery-empty">
                    <div className="empty-icon">
                      <Image size={52} />
                      <span>✦</span>
                    </div>
                    <h2>Your next masterpiece belongs here</h2>
                    <p>
                      Pick a picture, add your colors, and watch your gallery
                      grow.
                      <br />
                      Everything you create stays safe on this device.
                    </p>
                    <button
                      className="primary-button"
                      onClick={() => setPage("home")}
                    >
                      Let's color <ArrowRight size={18} />
                    </button>
                  </div>
                )}
              </section>
            )}
          </main>
        </>
      )}
      {page === "studio" && art && (
        <main className={`studio ${mode === "glow" ? "glow-studio" : ""}`}>
          <header className="studio-header">
            <button
              className="back-button"
              aria-label="Back to all pictures"
              onClick={() => void leaveStudio()}
            >
              <ArrowLeft size={22} />
              <span>All pictures</span>
            </button>
            <div className="studio-title">
              <h1>{art.title}</h1>
              <span>
                {modeInfo.name} <span>·</span> {profile.name}
              </span>
            </div>
            <div className="studio-header-actions">
              <button
                className="icon-button"
                onClick={() => openGate("share")}
                aria-label="Share or download picture"
              >
                <Download size={21} />
              </button>
              <button className="save-button" onClick={() => void done()}>
                <Check size={20} />
                <span>All done!</span>
              </button>
            </div>
          </header>
          <div className="studio-workspace">
            <aside className="tool-rail" aria-label="Painting tools">
              {(mode === "number"
                ? [{ id: "fill", label: "Color", icon: Droplets }]
                : [
                    { id: "fill", label: "Fill", icon: Droplets },
                    { id: "brush", label: "Brush", icon: Paintbrush },
                    { id: "crayon", label: "Crayon", icon: Pencil },
                    { id: "glitter", label: "Sparkle", icon: Sparkles },
                    { id: "sticker", label: "Stickers", icon: StickerIcon },
                    { id: "eraser", label: "Eraser", icon: Eraser },
                  ]
              )
                .filter(
                  (t) =>
                    !(mode === "draw" || mode === "glow") || t.id !== "fill",
                )
                .map((t) => (
                  <button
                    key={t.id}
                    className={`tool-button ${tool === t.id ? "selected" : ""}`}
                    aria-pressed={tool === t.id}
                    onClick={() => setTool(t.id as Tool)}
                  >
                    <t.icon size={25} />
                    <span>{t.label}</span>
                  </button>
                ))}
              <div className="tool-divider" />
              <button
                className="tool-button"
                onClick={() => setHistoryIndex((i) => i - 1)}
                disabled={historyIndex <= 0}
                aria-label="Undo"
              >
                <Undo2 size={23} />
                <span>Undo</span>
              </button>
              <button
                className="tool-button"
                onClick={() => setHistoryIndex((i) => i + 1)}
                disabled={historyIndex >= history.length - 1}
                aria-label="Redo"
              >
                <Redo2 size={23} />
                <span>Redo</span>
              </button>
              <button
                className="tool-button clear-tool"
                onClick={() => setModal("clear")}
                aria-label="Start picture over"
              >
                <Trash2 size={20} />
                <span>Fresh start</span>
              </button>
            </aside>
            <div className="canvas-area">
              <div className="canvas-hint">
                {mode === "number" ? (
                  <>
                    <span className="hint-number">123</span> Pick a number, then
                    tap its matching space.
                  </>
                ) : tool === "fill" ? (
                  <>
                    <Droplets size={17} /> Pick a color. Tap a space. Make it
                    yours!
                  </>
                ) : tool === "sticker" ? (
                  <>
                    <Star size={17} /> Pick a sticker, then tap to add a little
                    happy.
                  </>
                ) : mode === "glow" ? (
                  <>
                    <Sparkles size={17} /> Your imagination lights up the night.
                  </>
                ) : (
                  <>
                    <Paintbrush size={17} /> Little strokes, big imagination.
                  </>
                )}
              </div>
              <div className="canvas-frame">
                <StudioViewport
                  resetKey={art.id}
                  toolbar={
                    drawing && (mode === "fill" || mode === "number") ? (
                      <div
                        className={`color-progress ${drawing.regions.every((r) => art.fills[r.id]) ? "complete" : ""}`}
                        aria-label={`${drawing.regions.filter((r) => art.fills[r.id]).length} of ${drawing.regions.length} spaces colored`}
                      >
                        <span className="progress-flower" aria-hidden="true">
                          ✿
                        </span>
                        <span>
                          {
                            drawing.regions.filter((r) => art.fills[r.id])
                              .length
                          }{" "}
                          / {drawing.regions.length}
                        </span>
                        <div className="progress-track">
                          <span
                            style={{
                              width: `${(drawing.regions.filter((r) => art.fills[r.id]).length / drawing.regions.length) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="color-progress">
                        <span className="progress-flower">✦</span>
                        <span>Make it yours</span>
                      </div>
                    )
                  }
                >
                  <PaintCanvas
                    ref={canvasRef}
                    artwork={art}
                    drawing={drawing}
                    tool={tool}
                    color={color}
                    size={size}
                    sticker={sticker}
                    hints={settings.hints}
                    onChange={changeArt}
                    onWrongColor={() =>
                      notify(
                        "Find the color with the same number. You’ve got this!",
                      )
                    }
                    onPaint={() => {
                      if (settings.sound) playNote();
                    }}
                  />
                </StudioViewport>
                {celebrate && (
                  <div className="celebration" aria-hidden="true">
                    {["⭐", "✨", "🌸", "💛", "🌈", "✦", "⭐"].map((s, i) => (
                      <span key={i} style={{ "--i": i } as React.CSSProperties}>
                        {s}
                      </span>
                    ))}
                    <div className="celebration-label">
                      Oh, happy colors! ✨
                    </div>
                  </div>
                )}
              </div>
              <div className="canvas-footer">
                <span>
                  <ShieldCheck size={13} /> Saved on this device
                </span>
                <div className="mobile-history">
                  <button
                    aria-label="Undo last action"
                    disabled={historyIndex <= 0}
                    onClick={() => setHistoryIndex((i) => i - 1)}
                  >
                    <Undo2 size={19} />
                  </button>
                  <button
                    aria-label="Redo last action"
                    disabled={historyIndex >= history.length - 1}
                    onClick={() => setHistoryIndex((i) => i + 1)}
                  >
                    <Redo2 size={19} />
                  </button>
                </div>
                <span>
                  Made by {profile.name} <Heart size={13} />
                </span>
              </div>
            </div>
            <aside className="studio-side-note">
              <div>✦</div>
              <p>
                There’s magic
                <br />
                in your hands.
              </p>
              <span>
                Make a little mess.
                <br />
                Make it yours.
              </span>
            </aside>
          </div>
          <footer className="palette-panel">
            {tool === "sticker" ? (
              <div className="sticker-tray" aria-label="Stickers">
                {stickerChoices.map((s) => (
                  <button
                    key={s}
                    aria-label={`Sticker ${s}`}
                    aria-pressed={sticker === s}
                    className={sticker === s ? "selected" : ""}
                    onClick={() => setSticker(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              <div className="palette" aria-label="Choose a color">
                {PALETTE.map((c, i) => ({ c, i }))
                  .filter(
                    ({ i }) =>
                      mode !== "number" ||
                      drawing?.regions.some((r) => r.number === i + 1),
                  )
                  .map(({ c, i }) => (
                    <button
                      key={c}
                      className={`color-swatch ${color === c ? "selected" : ""} ${mode === "number" && drawing?.regions.filter((r) => r.number === i + 1).every((r) => art.fills[r.id]) ? "finished-color" : ""}`}
                      style={{ "--swatch": c } as React.CSSProperties}
                      onClick={() => setColor(c)}
                      aria-label={`${colorNames[i]}${mode === "number" ? ` number ${i + 1}` : ""}`}
                      aria-pressed={color === c}
                    >
                      {mode === "number" ? (
                        <span style={{ color: i === 9 ? "#FFF" : "#263F43" }}>
                          {i + 1}
                        </span>
                      ) : (
                        color === c && (
                          <Check
                            size={23}
                            color={i === 9 ? "#FFF" : "#263F43"}
                          />
                        )
                      )}
                      {mode === "number" && drawing && (
                        <span className="color-remaining" aria-hidden="true">
                          {drawing.regions.filter(
                            (r) => r.number === i + 1 && !art.fills[r.id],
                          ).length || "✓"}
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            )}
            {tool !== "fill" && tool !== "sticker" && (
              <div className="brush-sizes" aria-label="Brush size">
                {[10, 22, 42].map((s, i) => (
                  <button
                    key={s}
                    className={size === s ? "selected" : ""}
                    aria-label={`${["Small", "Medium", "Large"][i]} brush`}
                    aria-pressed={size === s}
                    onClick={() => setSize(s)}
                  >
                    <span style={{ width: 6 + i * 6, height: 6 + i * 6 }} />
                  </button>
                ))}
              </div>
            )}
            <button
              className="icon-button palette-more"
              aria-label="Painting settings"
              onClick={openParents}
            >
              <Settings2 size={20} />
            </button>
          </footer>
        </main>
      )}
      {loadingPicture && (
        <div className="picture-loading" role="status">
          <div>
            <span className="loading-brush">
              <Paintbrush size={34} />
            </span>
            <h2>Opening a little adventure…</h2>
            <p>{loadingPicture}</p>
            <button
              className="secondary-button"
              onClick={() => {
                pictureRequest.current++;
                setLoadingPicture("");
              }}
            >
              Back to pictures
            </button>
          </div>
        </div>
      )}
      {modal === "finished" && (
        <Modal title="Your little masterpiece" onClose={closeModal}>
          <div className="finished-modal">
            <span className="finished-star" aria-hidden="true">
              ✦
            </span>
            <h2>Look what you made!</h2>
            <p>A little color. A whole lot of you.</p>
            {finishedPreview && (
              <img
                className="finished-preview"
                src={finishedPreview}
                alt="Your finished artwork"
              />
            )}
            <div className="modal-actions">
              <button
                className="primary-button"
                onClick={() => {
                  closeModal();
                  void leaveStudio();
                }}
              >
                Pick another picture <ArrowRight size={18} />
              </button>
              <button className="secondary-button" onClick={closeModal}>
                Keep coloring <Paintbrush size={17} />
              </button>
            </div>
            <p className="finished-caption">
              <ShieldCheck size={12} /> Safely tucked away in My art
            </p>
          </div>
        </Modal>
      )}
      {modal === "gate" && (
        <Modal title="Grown-up check" onClose={closeModal}>
          <div className="modal-illustration">🔐</div>
          <span className="eyebrow">JUST FOR THE GROWN-UPS</span>
          <h2>A tiny grown-up check</h2>
          <p>
            {gateAction === "share"
              ? "Ask a grown-up to solve this before sharing your masterpiece outside the app."
              : "Please ask a grown-up to solve this to enter the parent corner."}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (Number(gateAnswer) === gate[0] * gate[1]) {
                setGateError(false);
                if (gateAction === "share") {
                  setModal(null);
                  void download();
                } else setModal("parents");
              } else {
                setGateError(true);
                setGateAnswer("");
              }
            }}
          >
            <label className="gate-label" htmlFor="gate-answer">
              {gate[0]} × {gate[1]} = <span>?</span>
            </label>
            <input
              id="gate-answer"
              className="text-input gate-input"
              inputMode="numeric"
              type="number"
              value={gateAnswer}
              onChange={(e) => setGateAnswer(e.target.value)}
              placeholder="Your answer"
              aria-label="Answer to grown-up check"
              required
            />
            {gateError && (
              <p className="form-error">
                That’s not quite right. Let’s try again.
              </p>
            )}
            <button className="primary-button full-width" type="submit">
              {gateAction === "share"
                ? "Share masterpiece"
                : "Open grown-up corner"}{" "}
              <ArrowRight size={18} />
            </button>
          </form>
        </Modal>
      )}
      {modal === "parents" && (
        <Modal title="Grown-up corner" onClose={closeModal} wide>
          <div className="parent-heading">
            <span className="parent-icon">
              <ShieldCheck size={30} />
            </span>
            <div>
              <h2>Grown-up corner</h2>
              <p>A little space to make it just right.</p>
            </div>
          </div>
          <div className="parent-stats">
            <div>
              <strong>{myArt.length}</strong>
              <span>Saved creations</span>
            </div>
            <div>
              <strong>
                {
                  new Set(
                    myArt.filter((a) => a.drawingId).map((a) => a.drawingId),
                  ).size
                }
              </strong>
              <span>Pictures explored</span>
            </div>
            <div>
              <strong>{new Set(myArt.map((a) => a.mode)).size}</strong>
              <span>Ways to play</span>
            </div>
          </div>
          <div className="setting-row">
            <div>
              <b>Gentle sound effects</b>
              <p>Soft notes while coloring. No vibration.</p>
            </div>
            <button
              className={`toggle ${settings.sound ? "on" : ""}`}
              role="switch"
              aria-label="Gentle sound effects"
              aria-checked={settings.sound}
              onClick={() => setSettings((s) => ({ ...s, sound: !s.sound }))}
            >
              <span />
            </button>
          </div>
          <div className="setting-row">
            <div>
              <b>Number hints</b>
              <p>Show numbers on uncolored spaces.</p>
            </div>
            <button
              className={`toggle ${settings.hints ? "on" : ""}`}
              role="switch"
              aria-label="Number hints"
              aria-checked={settings.hints}
              onClick={() => setSettings((s) => ({ ...s, hints: !s.hints }))}
            >
              <span />
            </button>
          </div>
          <div className="setting-row">
            <div>
              <b>Picture difficulty</b>
              <p>Bigger, simpler shapes for smaller hands.</p>
            </div>
            <select
              aria-label="Picture difficulty"
              value={settings.difficulty}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  difficulty: e.target.value as Settings["difficulty"],
                }))
              }
            >
              <option value="all">All pictures</option>
              <option value="easy">Easy pictures</option>
              <option value="medium">Medium pictures</option>
              <option value="hard">Hard pictures</option>
            </select>
          </div>
          <div className="profile-management">
            <h3>
              Our little artists <span>{profiles.length}/6</span>
            </h3>
            <div className="profile-chips">
              {profiles.map((p) => (
                <button
                  key={p.id}
                  className={profile.id === p.id ? "selected" : ""}
                  onClick={() => {
                    if (page === "studio") {
                      notify("Finish this picture before switching artists.");
                      return;
                    }
                    setProfileId(p.id);
                  }}
                >
                  <span>{p.avatar}</span>
                  {p.name}
                  {profile.id === p.id && <Check size={14} />}
                </button>
              ))}
            </div>
            {profiles.length < 6 && (
              <form
                className="add-profile"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newName.trim()) return;
                  const p = {
                    id: crypto.randomUUID(),
                    name: newName.trim().slice(0, 20),
                    avatar: newAvatar,
                  };
                  setProfiles((prev) => [...prev, p]);
                  if (page !== "studio") setProfileId(p.id);
                  setNewName("");
                  notify("A new little artist has joined the club!");
                }}
              >
                <div className="avatar-picker">
                  {avatars.map((a) => (
                    <button
                      key={a}
                      type="button"
                      aria-label={`Choose avatar ${a}`}
                      aria-pressed={newAvatar === a}
                      className={newAvatar === a ? "selected" : ""}
                      onClick={() => setNewAvatar(a)}
                    >
                      {a}
                    </button>
                  ))}
                </div>
                <div className="profile-input-row">
                  <input
                    className="text-input"
                    aria-label="New artist name"
                    placeholder="Little artist’s nickname"
                    value={newName}
                    maxLength={20}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                  />
                  <button type="submit" className="secondary-button">
                    <Plus size={18} /> Add artist
                  </button>
                </div>
              </form>
            )}
          </div>
          <div className="privacy-note">
            <ShieldCheck size={21} />
            <p>
              <b>Their imagination. Their little world.</b>
              <br />
              No ads, purchases, accounts, or tracking. Pictures and nicknames
              stay on this device. Uninstalling the app removes local artwork;
              share favorites to keep a copy.
            </p>
          </div>
        </Modal>
      )}
      {modal === "profiles" && (
        <Modal title="Choose your artist" onClose={closeModal}>
          <span className="modal-illustration">🎨</span>
          <h2>Who’s making magic?</h2>
          <p>Everyone gets their very own art box.</p>
          <div className="choose-profiles">
            {profiles.map((p) => (
              <button
                className={profile.id === p.id ? "selected" : ""}
                key={p.id}
                onClick={() => {
                  setProfileId(p.id);
                  setModal(null);
                }}
              >
                <span>{p.avatar}</span>
                <b>{p.name}</b>
                {profile.id === p.id && <Check size={17} />}
              </button>
            ))}
          </div>
          <button className="text-button" onClick={openParents}>
            <LockKeyhole size={15} /> Add an artist in grown-up corner{" "}
            <ChevronRight size={16} />
          </button>
        </Modal>
      )}
      {modal === "about" && (
        <Modal title="About Little Color Club" onClose={closeModal}>
          <Logo />
          <h2>A little color goes a long way.</h2>
          <p>
            Little Color Club is a happy, quiet space for children to explore
            colors and make something of their own.
          </p>
          <div className="about-features">
            <span>
              <BookOpen />
              {drawings.length} original coloring pages
            </span>
            <span>
              <Palette />5 imaginative ways to play
            </span>
            <span>
              <Heart />
              Free from ads and purchases
            </span>
            <span>
              <ShieldCheck />
              Offline, private, and on your device
            </span>
          </div>
          <p className="fine-print">
            An original independent app. No account needed. Version 1.1.0.
          </p>
        </Modal>
      )}
      {modal === "clear" && (
        <Modal title="Start fresh" onClose={closeModal}>
          <span className="modal-illustration">🧼</span>
          <h2>A fresh little start?</h2>
          <p>
            This will clear the colors, brush strokes, and stickers on this
            picture. You can use Undo to bring them back.
          </p>
          <div className="modal-actions">
            <button className="secondary-button" onClick={closeModal}>
              Keep creating
            </button>
            <button
              className="primary-button"
              onClick={() => {
                changeArt({ ...art, fills: {}, strokes: [], stickers: [] });
                setModal(null);
              }}
            >
              Start fresh
            </button>
          </div>
        </Modal>
      )}
      {modal === "delete" && (
        <Modal title="Remove a picture" onClose={closeModal}>
          <span className="modal-illustration">🖼️</span>
          <h2>Say goodbye to this picture?</h2>
          <p>
            This removes it from your art box on this device. This can’t be
            undone.
          </p>
          <div className="modal-actions">
            <button className="secondary-button" onClick={closeModal}>
              Keep it
            </button>
            <button
              className="danger-button"
              onClick={async () => {
                try {
                  await deleteArtwork(deleteId);
                  setArtworks((prev) => prev.filter((a) => a.id !== deleteId));
                  setModal(null);
                  notify("Picture removed from My art.");
                } catch {
                  notify("The picture could not be removed. Please try again.");
                }
              }}
            >
              Remove picture
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>✦</span>
          {toast}
          <button aria-label="Dismiss message" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
