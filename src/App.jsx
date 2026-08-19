import { useState, useEffect, useRef, useCallback } from "react";
import { db, doc, getDoc, setDoc, onSnapshot, runTransaction } from "./firebase";
import { logout } from "./firebase";

/* ------------------------------------------------------------------ */
/*  Tokens                                                             */
/* ------------------------------------------------------------------ */
const C = {
  bg: "#191713",
  card: "#221F1A",
  cardSoft: "#1D1B16",
  line: "#332E26",
  lineSoft: "#2A251E",
  ink: "#F2EDE4",
  mute: "#9A9186",
  faint: "#6B6359",
  brass: "#C9A227",
  amber: "#D99A2B",
  red: "#D2544B",
  green: "#7FA37C",
};

const DISPLAY = "Georgia, 'Times New Roman', serif";
const BODY =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const TYPES = [
  { id: "sale", label: "Satış" },
  { id: "cs", label: "CS" },
];
const typeLabel = (id) => TYPES.find((t) => t.id === id)?.label ?? "—";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const dayKey = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `queue-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const clockOf = (ts) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
};

const minsBetween = (a, b) => Math.max(0, Math.floor((b - a) / 60000));

const waitColor = (m) => (m >= 15 ? C.red : m >= 8 ? C.amber : C.ink);

const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const mergeById = (a, b) => {
  const m = new Map();
  [...a, ...b].forEach((e) => {
    const prev = m.get(e.id);
    if (!prev || (e.updatedAt || 0) >= (prev.updatedAt || 0)) m.set(e.id, e);
  });
  return [...m.values()].sort((x, y) => x.createdAt - y.createdAt);
};

/* ------------------------------------------------------------------ */
/*  App                                                                */
/*  props.user: Firebase Auth user objesi (AuthGate tarafindan verilir) */
/* ------------------------------------------------------------------ */
export default function BoutiqueQueue({ user }) {
  const me = user.displayName || user.email;

  const [entries, setEntries] = useState([]);
  const [booting, setBooting] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [problem, setProblem] = useState(null);
  const [flash, setFlash] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [desc, setDesc] = useState("");
  const [type, setType] = useState("sale");
  const [pax, setPax] = useState(1);
  const [note, setNote] = useState("");
  const [noteMeta, setNoteMeta] = useState(null);
  const [noteDirty, setNoteDirty] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());

  const entriesRef = useRef([]);
  entriesRef.current = entries;
  const keyRef = useRef(dayKey());
  const clearedRef = useRef(0);
  const noteDirtyRef = useRef(false);
  noteDirtyRef.current = noteDirty;

  /* ticking clock for the counters */
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);

  /* --------------------------- Firestore refs --------------------------- */
  const queueDocRef = useCallback(
    () => doc(db, "queues", keyRef.current),
    []
  );
  const noteDocRef = useCallback(() => doc(db, "notes", "shift-note"), []);

  /* --------------------------- live sync (onSnapshot) --------------------------- */
  useEffect(() => {
    setBooting(true);
    const unsubQueue = onSnapshot(
      queueDocRef(),
      (snap) => {
        const o = snap.exists() ? snap.data() : { entries: [], clearedAt: 0 };
        const cleared = Math.max(clearedRef.current, o.clearedAt || 0);
        clearedRef.current = cleared;
        setEntries(mergeById(entriesRef.current, o.entries || []).filter(
          (e) => e.createdAt > cleared
        ));
        setLastSync(Date.now());
        setProblem(null);
        setBooting(false);
      },
      () => {
        setProblem("Bağlantı sorunu. İnternete bağlan ve Yenile'ye bas.");
        setBooting(false);
      }
    );

    const unsubNote = onSnapshot(noteDocRef(), (snap) => {
      if (!snap.exists()) return;
      const o = snap.data();
      setNoteMeta({ by: o.by, at: o.at });
      if (!noteDirtyRef.current) setNote(o.text || "");
    });

    return () => {
      unsubQueue();
      unsubNote();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* midnight rollover: recompute the day key every minute */
  useEffect(() => {
    const t = setInterval(() => {
      keyRef.current = dayKey();
    }, 60000);
    return () => clearInterval(t);
  }, []);

  const manualRefresh = async () => {
    setSyncing(true);
    try {
      const snap = await getDoc(queueDocRef());
      const o = snap.exists() ? snap.data() : { entries: [], clearedAt: 0 };
      const cleared = Math.max(clearedRef.current, o.clearedAt || 0);
      clearedRef.current = cleared;
      setEntries(mergeById(entriesRef.current, o.entries || []).filter(
        (e) => e.createdAt > cleared
      ));
      setLastSync(Date.now());
      setProblem(null);
      setFlash(true);
      setTimeout(() => setFlash(false), 1600);
    } catch {
      setProblem("Yenilenemedi. İnternete bağlan ve tekrar dene.");
    }
    setSyncing(false);
  };

  const push = useCallback(
          async (next) => {
                    setSyncing(true);
                    try {
                                const merged = await runTransaction(db, async (tx) => {
                                              const snap = await tx.get(queueDocRef());
                                              const o = snap.exists() ? snap.data() : { entries: [], clearedAt: 0 };
                                              const cleared = Math.max(clearedRef.current, o.clearedAt || 0);
                                              clearedRef.current = cleared;
                                              const m = mergeById(o.entries || [], next).filter(
                                                              (e) => e.createdAt > cleared
                                                                            );
                                              tx.set(queueDocRef(), { entries: m, clearedAt: cleared });
                                              return m;
                                });
                                setEntries(merged);
                                setLastSync(Date.now());
                                setProblem(null);
                    } catch {
                                setProblem("Kaydedilemedi. İnternete bağlan ve Yenile'ye bas.");
                    }
                    setSyncing(false);
          },
          // eslint-disable-next-line react-hooks/exhaustive-deps
          []
        );

  const clearDay = useCallback(async () => {
    const t = Date.now();
    clearedRef.current = t;
    setEntries([]);
    setConfirmClear(false);
    setSyncing(true);
    try {
      await setDoc(queueDocRef(), { entries: [], clearedAt: t });
      setLastSync(Date.now());
      setProblem(null);
    } catch {
      setProblem("Temizlenemedi. İnternete bağlan ve tekrar dene.");
    }
    setSyncing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveNote = useCallback(
    async (text) => {
      try {
        await setDoc(noteDocRef(), { text, by: me, at: Date.now() });
        setNoteMeta({ by: me, at: Date.now() });
        setNoteDirty(false);
        setNoteSaved(true);
        setTimeout(() => setNoteSaved(false), 1800);
      } catch {
        setProblem("Not kaydedilemedi. İnternete bağlan ve tekrar dene.");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me]
  );

  /* --------------------------- actions --------------------------- */
  const addGuest = () => {
    const t = Date.now();
    const e = {
      id: uid(),
      desc: desc.trim() || typeLabel(type),
      type,
      pax,
      status: "waiting",
      createdAt: t,
      updatedAt: t,
      addedBy: me,
      startedAt: null,
      closedAt: null,
      closedBy: null,
    };
    const next = [...entriesRef.current, e];
    setEntries(next);
    setDesc("");
    setPax(1);
    push(next);
  };

  const setPaxOf = (id, delta) => {
    const t = Date.now();
    const next = entriesRef.current.map((e) =>
      e.id !== id
        ? e
        : {
            ...e,
            pax: Math.min(12, Math.max(1, (e.pax || 1) + delta)),
            updatedAt: t,
          }
    );
    setEntries(next);
    push(next);
  };

  const setStatus = (id, status) => {
    const t = Date.now();
    const next = entriesRef.current.map((e) =>
      e.id !== id
        ? e
        : {
            ...e,
            status,
            updatedAt: t,
            startedAt: status === "with" ? t : e.startedAt,
            closedAt: status === "done" || status === "left" ? t : null,
            closedBy: status === "done" || status === "left" ? me : null,
          }
    );
    setEntries(next);
    push(next);
  };

  /* --------------------------- derived --------------------------- */
  const waiting = entries
    .filter((e) => e.status === "waiting")
    .sort((a, b) => a.createdAt - b.createdAt);
  const waitingSale = waiting.filter((e) => e.type !== "cs");
  const waitingCs = waiting.filter((e) => e.type === "cs");
  const withAdvisor = entries.filter((e) => e.status === "with");
  const closed = entries
    .filter((e) => e.status === "done" || e.status === "left")
    .sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0));

  const served = entries.filter((e) => e.startedAt);
  const avgWait = served.length
    ? Math.round(
        served.reduce((s, e) => s + minsBetween(e.createdAt, e.startedAt), 0) /
          served.length
      )
    : null;
  const leftCount = entries.filter((e) => e.status === "left").length;
  const paxOf = (e) => e.pax || 1;
  const head = entries.reduce((s, e) => s + paxOf(e), 0);
  const headSale = entries
    .filter((e) => e.type !== "cs")
    .reduce((s, e) => s + paxOf(e), 0);
  const headCs = entries
    .filter((e) => e.type === "cs")
    .reduce((s, e) => s + paxOf(e), 0);
  const leftHead = entries
    .filter((e) => e.status === "left")
    .reduce((s, e) => s + paxOf(e), 0);

  const summaryText = () => {
    const d = new Date().toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "long",
      weekday: "long",
    });
    return [
      `${d} — kapı özeti`,
      `${head} misafir / ${entries.length} grup (Satış ${headSale}, CS ${headCs})`,
      `Ortalama bekleme: ${avgWait === null ? "—" : avgWait + " dk"}`,
      `Beklemeden ayrılan: ${leftHead} misafir`,
    ].join("\n");
  };

  const copySummary = async () => {
    const text = summaryText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  /* --------------------------- row ------------------------------- */
  const queueRow = (e, i) => {
    const m = minsBetween(e.createdAt, now);
    const cs = e.type === "cs";
    return (
      <article
        key={e.id}
        style={{ ...S.row, borderLeft: `3px solid ${cs ? C.mute : C.brass}` }}
      >
        <div style={S.meter}>
          <span style={{ ...S.mins, color: waitColor(m) }}>{m}</span>
          <span style={S.minsUnit}>dk</span>
          <div style={S.trackWrap}>
            <div
              style={{
                ...S.track,
                width: `${Math.min(100, (m / 20) * 100)}%`,
                background: waitColor(m),
              }}
            />
          </div>
        </div>
        <div style={S.rowBody}>
          <div style={S.tagRow}>
            <span style={cs ? S.tagCs : S.tagSale}>{typeLabel(e.type)}</span>
            {i === 0 && <span style={S.next}>SIRADAKİ</span>}
          </div>
          <p style={S.desc}>{e.desc}</p>
          <div style={S.paxRow}>
            <button
              onClick={() => setPaxOf(e.id, -1)}
              style={S.paxBtn}
              aria-label="Kişi azalt"
            >
              −
            </button>
            <span style={S.paxCount}>{paxOf(e)} kişi</span>
            <button
              onClick={() => setPaxOf(e.id, 1)}
              style={S.paxBtn}
              aria-label="Kişi ekle"
            >
              +
            </button>
            <span style={S.metaLine}>
              {clockOf(e.createdAt)} · {e.addedBy}
            </span>
          </div>
          <div style={S.actions}>
            <button onClick={() => setStatus(e.id, "with")} style={S.actPrimary}>
              Danışmana verdim
            </button>
            <button onClick={() => setStatus(e.id, "left")} style={S.actQuiet}>
              Ayrıldı
            </button>
          </div>
        </div>
      </article>
    );
  };

  if (booting) {
    return (
      <div style={{ ...S.page, justifyContent: "center", alignItems: "center" }}>
        <p style={S.help}>Yükleniyor…</p>
      </div>
    );
  }

  /* --------------------------- render ---------------------------- */
  return (
    <div style={S.page}>
      <div style={S.shell}>
        {/* header */}
        <header style={S.header}>
          <div>
            <p style={S.eyebrow}>Kapı · Sıra</p>
            <h1 style={S.h1}>Bekleme listesi</h1>
          </div>
          <button
            onClick={manualRefresh}
            disabled={syncing}
            style={flash ? { ...S.ghost, ...S.ghostOk } : S.ghost}
            aria-label="Listeyi yenile"
          >
            {syncing ? "Bakılıyor…" : flash ? "Güncel ✓" : "Yenile"}
          </button>
        </header>

        <p style={S.syncline}>
          {me} olarak bağlısın ·{" "}
          {lastSync
            ? `son güncelleme ${new Date(lastSync).toLocaleTimeString("tr-TR")}`
            : "bağlanıyor"}{" "}
          ·{" "}
          <button onClick={logout} style={S.logoutLink}>
            çıkış yap
          </button>
        </p>

        {problem && <div style={S.alert}>{problem}</div>}

        {/* add guest */}
        <section style={{ ...S.card, padding: 16, marginBottom: 18 }}>
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addGuest()}
            placeholder="Kısa tarif — örn. gri ceketli bey"
            style={S.input}
            maxLength={40}
          />
          <div style={S.chips}>
            {TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => setType(t.id)}
                style={type === t.id ? S.chipOn : S.chip}
              >
                {t.label}
              </button>
            ))}
            <span style={S.chipDivider} />
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => setPax(n)}
                style={pax === n ? S.chipOn : S.chip}
              >
                {n === 4 ? "4+" : n} kişi
              </button>
            ))}
          </div>
          <button onClick={addGuest} style={S.primary}>
            Sıraya ekle
          </button>
          <p style={{ ...S.help, marginTop: 10 }}>
            İsim yazma. Tarif yeter — liste gün sonunda kapanır.
          </p>
        </section>

        {/* waiting — two separate queues */}
        <SectionTitle
          label="Satış"
          count={waitingSale.length}
          hint={waitingSale.length ? "en uzun bekleyen üstte" : null}
        />
        {waitingSale.length === 0 ? (
          <Empty text="Satışta bekleyen yok." />
        ) : (
          waitingSale.map((e, i) => queueRow(e, i))
        )}

        <SectionTitle
          label="CS"
          count={waitingCs.length}
          hint={waitingCs.length ? "en uzun bekleyen üstte" : null}
        />
        {waitingCs.length === 0 ? (
          <Empty text="CS'te bekleyen yok." />
        ) : (
          waitingCs.map((e, i) => queueRow(e, i))
        )}

        {/* with advisor */}
        {withAdvisor.length > 0 && (
          <>
            <SectionTitle label="Danışmanda" count={withAdvisor.length} />
            {withAdvisor.map((e) => (
              <article key={e.id} style={{ ...S.row, ...S.rowSoft }}>
                <div style={S.meter}>
                  <span style={{ ...S.mins, color: C.faint, fontSize: 26 }}>
                    {minsBetween(e.createdAt, e.startedAt)}
                  </span>
                  <span style={S.minsUnit}>dk bekledi</span>
                </div>
                <div style={S.rowBody}>
                  <p style={{ ...S.desc, color: C.mute }}>{e.desc}</p>
                  <p style={S.metaLine}>
                    {typeLabel(e.type)} · {clockOf(e.startedAt)}'de içeri alındı
                  </p>
                  <div style={S.actions}>
                    <button
                      onClick={() => setStatus(e.id, "done")}
                      style={S.actQuiet}
                    >
                      Bitti
                    </button>
                    <button
                      onClick={() => setStatus(e.id, "waiting")}
                      style={S.actQuiet}
                    >
                      Sıraya geri al
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </>
        )}

        {/* closed */}
        {closed.length > 0 && (
          <>
            <button
              onClick={() => setShowClosed((v) => !v)}
              style={S.disclosure}
            >
              {showClosed ? "Kapanan kayıtları gizle" : "Kapanan kayıtlar"} (
              {closed.length})
            </button>
            {showClosed &&
              closed.map((e) => (
                <div key={e.id} style={S.closedRow}>
                  <span style={{ color: e.status === "left" ? C.red : C.faint }}>
                    {e.status === "left" ? "Ayrıldı" : "Bitti"}
                  </span>
                  <span style={{ color: C.mute, flex: 1 }}>
                    {e.desc}
                    {paxOf(e) > 1 && (
                      <span style={{ color: C.faint }}> · {paxOf(e)} kişi</span>
                    )}
                  </span>
                  <span style={{ color: C.faint, fontFamily: MONO, fontSize: 12 }}>
                    {clockOf(e.closedAt)}
                  </span>
                  <button
                    onClick={() => setStatus(e.id, "waiting")}
                    style={S.undo}
                  >
                    Geri al
                  </button>
                </div>
              ))}
          </>
        )}

        {/* shift note */}
        <section style={{ ...S.card, padding: 16, marginTop: 26 }}>
          <div style={S.noteHead}>
            <p style={S.eyebrow}>Vardiya notu</p>
            {noteMeta?.at && (
              <span style={S.noteMeta}>
                {noteMeta.by} · {clockOf(noteMeta.at)}
              </span>
            )}
          </div>
          <textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setNoteDirty(true);
            }}
            placeholder="Diğerinin bilmesi gerekenler — örn. salı 15:00 tamir teslimi var"
            rows={4}
            style={S.textarea}
          />
          <button
            onClick={() => saveNote(note)}
            disabled={!noteDirty}
            style={
              noteSaved
                ? { ...S.noteSave, ...S.ghostOk }
                : noteDirty
                ? S.noteSave
                : { ...S.noteSave, opacity: 0.4 }
            }
          >
            {noteSaved ? "Kaydedildi ✓" : "Notu kaydet"}
          </button>
          <p style={{ ...S.help, marginTop: 9 }}>
            Not günlük değil, sen silene kadar durur. Herkes düzenleyebilir.
          </p>
        </section>

        {/* summary */}
        <section style={S.summary}>
          <p style={S.eyebrow}>Bugün</p>
          <div style={S.stats}>
            <Stat n={head} label="misafir" />
            <Stat n={avgWait === null ? "—" : avgWait} label="dk ortalama" />
            <Stat n={leftHead} label="beklemeden ayrıldı" warn={leftCount > 0} />
          </div>
          <p style={{ ...S.help, marginTop: 12 }}>
            {entries.length} grup · Satış {headSale} · CS {headCs}
          </p>
          <button
            onClick={copySummary}
            style={
              copied
                ? { ...S.ghost, ...S.ghostOk, marginTop: 14 }
                : { ...S.ghost, marginTop: 14 }
            }
          >
            {copied ? "Kopyalandı ✓" : "Özeti kopyala"}
          </button>
        </section>

        <div style={S.clearWrap}>
          {confirmClear ? (
            <>
              <button onClick={clearDay} style={S.danger}>
                Evet, hepsini sil
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                style={S.actQuiet}
              >
                Vazgeç
              </button>
            </>
          ) : (
            <button onClick={() => setConfirmClear(true)} style={S.actQuiet}>
              Listeyi temizle
            </button>
          )}
        </div>

        <p style={S.foot}>
          Liste ekipte ortak ve canlı senkronize. Temizlersen herkeste birden
          temizlenir.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small pieces                                                       */
/* ------------------------------------------------------------------ */
function SectionTitle({ label, count, hint }) {
  return (
    <div style={S.sectionTitle}>
      <span style={S.sectionLabel}>{label}</span>
      <span style={S.sectionCount}>{count}</span>
      {hint && <span style={S.sectionHint}>{hint}</span>}
    </div>
  );
}

function Empty({ text }) {
  return <div style={S.empty}>{text}</div>;
}

function Stat({ n, label, warn }) {
  return (
    <div>
      <p style={{ ...S.statN, color: warn ? C.red : C.brass }}>{n}</p>
      <p style={S.statL}>{label}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */
const S = {
  page: {
    background: C.bg,
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    padding: "18px 14px 32px",
    fontFamily: BODY,
    color: C.ink,
    WebkitFontSmoothing: "antialiased",
  },
  shell: { width: "100%", maxWidth: 520, margin: "0 auto" },
  header: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  eyebrow: {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: C.brass,
    margin: 0,
  },
  h1: {
    fontFamily: DISPLAY,
    fontSize: 26,
    fontWeight: 400,
    letterSpacing: "0.01em",
    margin: "4px 0 0",
  },
  syncline: {
    fontSize: 12,
    color: C.faint,
    margin: "10px 0 16px",
    borderTop: `1px solid ${C.lineSoft}`,
    paddingTop: 10,
  },
  logoutLink: {
    background: "none",
    border: "none",
    color: C.faint,
    textDecoration: "underline",
    fontSize: 12,
    cursor: "pointer",
    padding: 0,
  },
  alert: {
    background: "rgba(210,84,75,0.12)",
    border: `1px solid ${C.red}`,
    color: C.red,
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    marginBottom: 14,
  },
  card: {
    background: C.card,
    border: `1px solid ${C.line}`,
    borderRadius: 12,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    background: C.cardSoft,
    border: `1px solid ${C.line}`,
    borderRadius: 8,
    color: C.ink,
    fontSize: 16,
    fontFamily: BODY,
    padding: "13px 14px",
    outline: "none",
  },
  chips: { display: "flex", flexWrap: "wrap", gap: 6, margin: "12px 0 14px" },
  chip: {
    background: "transparent",
    border: `1px solid ${C.line}`,
    color: C.mute,
    borderRadius: 999,
    padding: "7px 13px",
    fontSize: 13,
    fontFamily: BODY,
    cursor: "pointer",
  },
  chipOn: {
    background: C.brass,
    border: `1px solid ${C.brass}`,
    color: "#191713",
    borderRadius: 999,
    padding: "7px 13px",
    fontSize: 13,
    fontWeight: 600,
    fontFamily: BODY,
    cursor: "pointer",
  },
  primary: {
    width: "100%",
    background: C.ink,
    color: C.bg,
    border: "none",
    borderRadius: 8,
    padding: "14px",
    fontSize: 15,
    fontWeight: 600,
    fontFamily: BODY,
    cursor: "pointer",
  },
  ghost: {
    background: "transparent",
    border: `1px solid ${C.line}`,
    color: C.mute,
    borderRadius: 999,
    padding: "8px 14px",
    fontSize: 13,
    fontFamily: BODY,
    cursor: "pointer",
  },
  chipDivider: {
    width: 1,
    alignSelf: "stretch",
    background: C.line,
    margin: "2px 4px",
  },
  paxRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 7,
    flexWrap: "wrap",
  },
  paxBtn: {
    width: 28,
    height: 28,
    lineHeight: "26px",
    background: "transparent",
    border: `1px solid ${C.line}`,
    color: C.mute,
    borderRadius: 6,
    fontSize: 15,
    padding: 0,
    cursor: "pointer",
  },
  paxCount: {
    fontFamily: MONO,
    fontSize: 12,
    color: C.ink,
    minWidth: 48,
    textAlign: "center",
  },
  undo: {
    background: "transparent",
    border: `1px solid ${C.line}`,
    color: C.mute,
    borderRadius: 6,
    padding: "5px 9px",
    fontSize: 11,
    fontFamily: BODY,
    cursor: "pointer",
  },
  noteHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 9,
  },
  noteMeta: { fontSize: 11, color: C.faint },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    background: C.cardSoft,
    border: `1px solid ${C.line}`,
    borderRadius: 8,
    color: C.ink,
    fontSize: 15,
    fontFamily: BODY,
    lineHeight: 1.5,
    padding: "12px 13px",
    outline: "none",
    resize: "vertical",
  },
  noteSave: {
    marginTop: 10,
    background: "transparent",
    border: `1px solid ${C.line}`,
    color: C.mute,
    borderRadius: 7,
    padding: "9px 14px",
    fontSize: 13,
    fontFamily: BODY,
    cursor: "pointer",
  },
  ghostOk: { borderColor: C.green, color: C.green },
  clearWrap: { display: "flex", gap: 8, marginTop: 22 },
  danger: {
    background: "rgba(210,84,75,0.14)",
    border: `1px solid ${C.red}`,
    color: C.red,
    borderRadius: 7,
    padding: "9px 14px",
    fontSize: 13,
    fontFamily: BODY,
    cursor: "pointer",
  },
  help: { fontSize: 12, color: C.faint, margin: 0, lineHeight: 1.5 },

  sectionTitle: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    margin: "22px 0 10px",
  },
  sectionLabel: {
    fontFamily: DISPLAY,
    fontSize: 17,
    letterSpacing: "0.01em",
    color: C.ink,
  },
  sectionCount: { fontFamily: MONO, fontSize: 11, color: C.brass },
  sectionHint: { fontSize: 11, color: C.faint, marginLeft: "auto" },

  row: {
    display: "flex",
    gap: 14,
    background: C.card,
    border: `1px solid ${C.line}`,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  rowSoft: { background: C.cardSoft, borderColor: C.lineSoft },
  meter: { width: 58, flexShrink: 0, textAlign: "center" },
  mins: {
    display: "block",
    fontFamily: MONO,
    fontSize: 34,
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
  },
  minsUnit: {
    display: "block",
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: "0.1em",
    color: C.faint,
    marginTop: 3,
  },
  trackWrap: {
    height: 2,
    background: C.line,
    borderRadius: 2,
    marginTop: 9,
    overflow: "hidden",
  },
  track: { height: 2, borderRadius: 2, transition: "width 400ms linear" },
  rowBody: { flex: 1, minWidth: 0 },
  desc: {
    margin: 0,
    fontSize: 16,
    fontFamily: DISPLAY,
    lineHeight: 1.3,
    wordBreak: "break-word",
  },
  next: {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: "0.14em",
    color: C.brass,
  },
  tagRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 7 },
  tagSale: {
    fontFamily: BODY,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.06em",
    color: C.brass,
    border: `1px solid ${C.brass}`,
    borderRadius: 5,
    padding: "3px 10px",
    whiteSpace: "nowrap",
  },
  tagCs: {
    fontFamily: BODY,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.06em",
    color: C.bg,
    background: C.mute,
    borderRadius: 5,
    padding: "4px 10px",
    whiteSpace: "nowrap",
  },
  metaLine: { margin: "5px 0 0", fontSize: 12, color: C.faint },
  actions: { display: "flex", gap: 6, marginTop: 11 },
  actPrimary: {
    background: "rgba(201,162,39,0.14)",
    border: `1px solid ${C.brass}`,
    color: C.brass,
    borderRadius: 7,
    padding: "9px 12px",
    fontSize: 13,
    fontFamily: BODY,
    cursor: "pointer",
  },
  actQuiet: {
    background: "transparent",
    border: `1px solid ${C.line}`,
    color: C.mute,
    borderRadius: 7,
    padding: "9px 12px",
    fontSize: 13,
    fontFamily: BODY,
    cursor: "pointer",
  },

  empty: {
    border: `1px dashed ${C.line}`,
    borderRadius: 12,
    padding: "20px 16px",
    fontSize: 13,
    color: C.faint,
    textAlign: "center",
    lineHeight: 1.5,
  },

  disclosure: {
    width: "100%",
    background: "transparent",
    border: "none",
    borderTop: `1px solid ${C.lineSoft}`,
    color: C.mute,
    fontSize: 12,
    fontFamily: BODY,
    padding: "16px 0 10px",
    textAlign: "left",
    cursor: "pointer",
  },
  closedRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    fontSize: 13,
    padding: "9px 2px",
    borderBottom: `1px solid ${C.lineSoft}`,
  },

  summary: {
    marginTop: 26,
    borderTop: `1px solid ${C.line}`,
    paddingTop: 16,
  },
  stats: { display: "flex", gap: 26, marginTop: 10 },
  statN: {
    fontFamily: MONO,
    fontSize: 24,
    margin: 0,
    fontVariantNumeric: "tabular-nums",
  },
  statL: { fontSize: 11, color: C.faint, margin: "3px 0 0" },
  foot: {
    fontSize: 11,
    color: C.faint,
    marginTop: 22,
    lineHeight: 1.6,
  },
};
