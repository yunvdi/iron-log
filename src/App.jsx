import { useState, useEffect, useCallback } from "react";
import { supabase, getUserId, isConfigured } from "./supabase.js";


function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

const DEFAULT_DATA = {
  workouts: [],
  customExercises: [],
  weightLog: [],
  templates: { "Грудь / Бицепс": [], "Спина / Трицепс": [], "Ноги / Плечи": [] }
};

export default function FitnessTracker() {
  const [data, setData] = useState(DEFAULT_DATA);
  const [view, setView] = useState("dashboard");
  const [loading, setLoading] = useState(true);

  const [workout, setWorkout] = useState({ date: new Date().toISOString().split("T")[0], name: "", exercises: [] });
  const [addingExercise, setAddingExercise] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [newSet, setNewSet] = useState({ weight: "", reps: "" });
  const [editingSet, setEditingSet] = useState(null);
  const [editingExName, setEditingExName] = useState(null);
  const [editingExValue, setEditingExValue] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  const [historySearch, setHistorySearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [editingWorkoutId, setEditingWorkoutId] = useState(null);

  const [exSearch, setExSearch] = useState("");
  const [newExName, setNewExName] = useState("");
  const [editingExItem, setEditingExItem] = useState(null);
  const [editingExItemValue, setEditingExItemValue] = useState("");
  const [expandedTemplate, setExpandedTemplate] = useState(null);
  const [progressExercise, setProgressExercise] = useState("");
  const [newWeight, setNewWeight] = useState({ date: new Date().toISOString().split("T")[0], value: "" });
  const [libraryTab, setLibraryTab] = useState("history");   // "history" | "exercises"
  const [analyticsTab, setAnalyticsTab] = useState("weight"); // "weight" | "progress" | "records"
  const [showProfile, setShowProfile] = useState(false);
  const [profile, setProfile] = useState({ name: "", age: "", weight: "", height: "", goal: "" });
  const [profileEdit, setProfileEdit] = useState({ name: "", age: "", weight: "", height: "", goal: "" });

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap";
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    async function load() {
      if (!isConfigured || !supabase) { setLoading(false); return; }
      try {
        const uid = getUserId();
        const { data: row, error } = await supabase.from("user_data").select("data").eq("user_id", uid).maybeSingle();
        if (error) throw error;
        if (row?.data) {
          const loaded = row.data;
          setData(prev => ({ ...DEFAULT_DATA, ...loaded, templates: { ...DEFAULT_DATA.templates, ...(loaded.templates || {}) } }));
        }
        const { data: pr } = await supabase.from("user_data").select("data").eq("user_id", uid + "_profile").maybeSingle();
        if (pr?.data) { setProfile(pr.data); setProfileEdit(pr.data); }
      } catch (e) { console.error("Supabase load error:", e); }
      setLoading(false);
    }
    load();
  }, []);

  const save = useCallback(async (newData) => {
    setData(newData);
    if (!isConfigured || !supabase) return;
    try {
      const uid = getUserId();
      await supabase.from("user_data").upsert({ user_id: uid, data: newData, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    } catch (e) { console.error("Supabase save error:", e); }
  }, []);

  const allExercises = [...data.customExercises].sort();
  const totalWorkouts = data.workouts.length;
  const thisWeek = data.workouts.filter(w => (new Date() - new Date(w.date)) / 86400000 < 7).length;

  const records = {};
  data.workouts.forEach(w => {
    w.exercises.forEach(ex => {
      ex.sets.forEach(set => {
        const wt = parseFloat(set.weight) || 0;
        const r = parseInt(set.reps) || 0;
        if (!records[ex.name]) records[ex.name] = { maxWeight: 0, maxReps: 0 };
        if (wt > records[ex.name].maxWeight) { records[ex.name].maxWeight = wt; records[ex.name].maxReps = r; }
        else if (wt === records[ex.name].maxWeight && r > records[ex.name].maxReps) records[ex.name].maxReps = r;
      });
    });
  });

  const progressData = progressExercise
    ? data.workouts.filter(w => w.exercises.some(e => e.name === progressExercise))
        .map(w => { const ex = w.exercises.find(e => e.name === progressExercise); const maxW = Math.max(...ex.sets.map(s => parseFloat(s.weight) || 0)); return { date: w.date, maxWeight: maxW }; })
        .sort((a, b) => new Date(a.date) - new Date(b.date))
    : [];

  function addExerciseToWorkout(name) { setWorkout(w => ({ ...w, exercises: [...w.exercises, { name, sets: [] }] })); setSelectedExercise(name); setAddingExercise(false); setExerciseSearch(""); }
  function addSetToExercise(exName) { if (!newSet.weight && !newSet.reps) return; setWorkout(w => ({ ...w, exercises: w.exercises.map(e => e.name === exName ? { ...e, sets: [...e.sets, { ...newSet, id: Date.now() }] } : e) })); setNewSet({ weight: "", reps: "" }); }
  function removeSet(exName, setId) { setWorkout(w => ({ ...w, exercises: w.exercises.map(e => e.name === exName ? { ...e, sets: e.sets.filter(s => s.id !== setId) } : e) })); }
  function updateSet(exName, setId, field, value) { setWorkout(w => ({ ...w, exercises: w.exercises.map(e => e.name === exName ? { ...e, sets: e.sets.map(s => s.id === setId ? { ...s, [field]: value } : s) } : e) })); }
  function removeExercise(exName) { setWorkout(w => ({ ...w, exercises: w.exercises.filter(e => e.name !== exName) })); if (selectedExercise === exName) setSelectedExercise(null); }
  function renameExercise(oldName, newName) { const t = newName.trim(); if (!t || t === oldName) { setEditingExName(null); return; } setWorkout(w => ({ ...w, exercises: w.exercises.map(e => e.name === oldName ? { ...e, name: t } : e) })); if (selectedExercise === oldName) setSelectedExercise(t); setEditingExName(null); }
  function loadWorkoutForEdit(w) { setWorkout({ ...w }); setEditingWorkoutId(w.id); setSelectedExercise(null); setEditingSet(null); setView("log"); }
  function saveWorkout() {
    if (workout.exercises.length === 0) return;
    const wName = workout.name || `Тренировка ${formatDate(workout.date)}`;
    let newData;
    if (editingWorkoutId) { newData = { ...data, workouts: data.workouts.map(w => w.id === editingWorkoutId ? { ...workout, name: wName } : w) }; setEditingWorkoutId(null); }
    else { newData = { ...data, workouts: [{ ...workout, name: wName, id: Date.now() }, ...data.workouts] }; }
    save(newData);
    setWorkout({ date: new Date().toISOString().split("T")[0], name: "", exercises: [] });
    setSelectedExercise(null);
    setSaveMsg(editingWorkoutId ? "Тренировка обновлена ✓" : "Тренировка сохранена ✓");
    setTimeout(() => setSaveMsg(""), 3000);
    setView("dashboard");
  }
  function deleteWorkout(id) { save({ ...data, workouts: data.workouts.filter(w => w.id !== id) }); }

  const filteredHistory = data.workouts.filter(w => w.name.toLowerCase().includes(historySearch.toLowerCase()) || w.exercises.some(e => e.name.toLowerCase().includes(historySearch.toLowerCase())));
  const filteredExercises = allExercises.filter(e => e.toLowerCase().includes(exerciseSearch.toLowerCase()));

  const [openDropdown, setOpenDropdown] = useState(null);

  if (loading) return (
    <div style={{ background: "#faf6ef", height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Inter','Segoe UI',sans-serif", gap: 20 }}>
      <div style={{ fontSize: 36 }}>🏋️</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "#c49a4a" }}>Iron Log</div>
      <div style={{ display: "flex", gap: 6 }}>{[0,1,2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#c49a4a", animation: `bounce 1.2s ease-in-out ${i*0.2}s infinite`, opacity: 0.7 }} />)}</div>
      <style>{`@keyframes bounce{0%,80%,100%{transform:scale(0.7);opacity:0.4}40%{transform:scale(1);opacity:1}}`}</style>
    </div>
  );

  function MiniChart({ points, color = ACCENT, unit = "кг" }) {
    const [hovered, setHovered] = useState(null);
    if (points.length < 2) return <div style={{ color: "#bbb", fontSize: 12, padding: "20px 0" }}>Недостаточно данных</div>;
    const vals = points.map(p => p.y);
    const min = Math.min(...vals), max = Math.max(...vals);
    const W = 280, H = 90, pad = 10;
    const sx = i => pad + (i / (points.length - 1)) * (W - 2 * pad);
    const sy = v => H - pad - ((v - min) / (max - min || 1)) * (H - 2 * pad);
    const path = points.map((p, i) => `${i===0?"M":"L"}${sx(i).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
    const area = path + ` L${sx(points.length-1)},${H} L${sx(0)},${H} Z`;
    return (
      <div style={{ position: "relative" }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible", display: "block" }}>
          <defs>
            <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22"/>
              <stop offset="100%" stopColor={color} stopOpacity="0"/>
            </linearGradient>
          </defs>
          <path d={area} fill="url(#cg)"/>
          <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          {points.map((p, i) => {
            const cx = sx(i), cy = sy(p.y);
            const isHovered = hovered === i;
            return (
              <g key={i}>
                <circle cx={cx} cy={cy} r={isHovered ? 6 : 4} fill={color} style={{ transition: "r 0.12s" }}/>
                {isHovered && <circle cx={cx} cy={cy} r={10} fill={color} fillOpacity="0.15"/>}
                <circle cx={cx} cy={cy} r={14} fill="transparent"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: "crosshair" }}/>
              </g>
            );
          })}
          {hovered !== null && (() => {
            const p = points[hovered];
            const cx = sx(hovered), cy = sy(p.y);
            const label = `${p.y} ${unit}`;
            const dateLabel = new Date(p.x).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
            const boxW = Math.max(label.length, dateLabel.length) * 7 + 16;
            const boxX = Math.min(Math.max(cx - boxW / 2, 0), W - boxW);
            const boxY = cy - 52;
            return (
              <g style={{ pointerEvents: "none" }}>
                <line x1={cx} y1={cy - 7} x2={cx} y2={H} stroke={color} strokeWidth="1" strokeDasharray="3 3" strokeOpacity="0.4"/>
                <rect x={boxX} y={boxY < 0 ? cy + 12 : boxY} width={boxW} height={38} rx="8"
                  fill={CARD} stroke={BORDER} strokeWidth="1"
                  style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.10))" }}/>
                <text x={boxX + boxW/2} y={(boxY < 0 ? cy + 12 : boxY) + 14} textAnchor="middle"
                  fontSize="11" fontWeight="700" fill={color}>{label}</text>
                <text x={boxX + boxW/2} y={(boxY < 0 ? cy + 12 : boxY) + 28} textAnchor="middle"
                  fontSize="10" fill={MUTED}>{dateLabel}</text>
              </g>
            );
          })()}
        </svg>
      </div>
    );
  }

  const ACCENT = "#c49a4a";
  const ACCENT2 = "#dbb96a";
  const BG = "#faf6ef";
  const CARD = "#fffef9";
  const TEXT = "#221a10";
  const MUTED = "#a8997f";
  const BORDER = "#f0e6d2";

  function CustomSelect({ id, value, onChange, options, placeholder = "— выбери —" }) {
    const isOpen = openDropdown === id;
    const selected = options.find(o => o.value === value);
    return (
      <div style={{ position: "relative" }} onClick={e => e.stopPropagation()}>
        {isOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 49 }} onClick={() => setOpenDropdown(null)} />
        )}
        <div onClick={() => setOpenDropdown(isOpen ? null : id)}
          style={{ background: "#fdf8f0", border: `1.5px solid ${isOpen ? ACCENT : BORDER}`, borderRadius: 12, padding: "11px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "border-color 0.15s", position: "relative", zIndex: 50 }}>
          <span style={{ fontSize: 13, color: selected ? TEXT : MUTED, fontWeight: selected ? 600 : 400 }}>
            {selected ? selected.label : placeholder}
          </span>
          <span style={{ color: MUTED, fontSize: 11, transition: "transform 0.2s", display: "inline-block", transform: isOpen ? "rotate(180deg)" : "none" }}>▼</span>
        </div>
        {isOpen && (
          <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, boxShadow: "0 8px 32px rgba(100,70,20,0.14)", zIndex: 50, overflow: "hidden" }}>
            {options.map((o, i) => (
              <div key={o.value} onClick={() => { onChange(o.value); setOpenDropdown(null); }}
                style={{ padding: "12px 16px", fontSize: 13, cursor: "pointer", color: o.value === value ? ACCENT : TEXT, fontWeight: o.value === value ? 700 : 400, background: o.value === value ? "#fdf3e3" : "transparent", borderBottom: i < options.length - 1 ? `1px solid ${BORDER}` : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {o.label}
                {o.value === value && <span style={{ color: ACCENT, fontSize: 14 }}>✓</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const S = {
    app: { background: BG, minHeight: "100vh", fontFamily: "'Inter','Segoe UI',sans-serif", color: TEXT, paddingBottom: 88 },
    header: { background: "linear-gradient(135deg, #4a3520 0%, #6b4f2e 100%)", padding: "18px 20px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" },
    logo: { fontSize: 20, fontWeight: 800, letterSpacing: 0.5, color: "#e8c97a" },
    nav: { position: "fixed", bottom: 0, left: 0, right: 0, background: CARD, borderTop: `1px solid ${BORDER}`, display: "flex", zIndex: 100, boxShadow: "0 -4px 24px rgba(100,60,10,0.08)" },
    navBtn: (active) => ({ flex: 1, padding: "10px 4px 8px", background: "none", border: "none", cursor: "pointer", color: active ? ACCENT : "#c8b99e", fontSize: 10, letterSpacing: 0.4, textTransform: "uppercase", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, fontFamily: "inherit", transition: "all 0.15s", fontWeight: active ? 700 : 500 }),
    navDot: (active) => ({ width: 4, height: 4, borderRadius: "50%", background: active ? ACCENT : "transparent", marginTop: 2 }),
    page: { padding: "20px 16px 8px", maxWidth: 480, margin: "0 auto" },
    section: { marginBottom: 24 },
    label: { fontSize: 11, letterSpacing: 0.8, color: MUTED, textTransform: "uppercase", marginBottom: 10, display: "block", fontWeight: 600 },
    card: { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 18, padding: "16px 18px", marginBottom: 12, boxShadow: "0 2px 12px rgba(100,60,10,0.06)" },
    statGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 },
    statCard: { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 18, padding: "18px 16px", boxShadow: "0 2px 12px rgba(100,60,10,0.06)" },
    statNum: { fontSize: 34, fontWeight: 800, color: ACCENT, letterSpacing: -1.5, lineHeight: 1 },
    statLabel: { fontSize: 11, color: MUTED, letterSpacing: 0.2, marginTop: 6, fontWeight: 500 },
    btn: { background: "linear-gradient(135deg, #c49a4a, #d4b060)", color: "#fff", border: "none", padding: "12px 24px", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", borderRadius: 12, boxShadow: "0 4px 14px rgba(180,140,50,0.28)" },
    btnGhost: { background: "none", color: ACCENT, border: `1.5px solid ${ACCENT}`, padding: "9px 18px", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer", borderRadius: 12 },
    btnDanger: { background: "none", color: "#c0503a", border: "1.5px solid #f0c8be", padding: "7px 14px", fontFamily: "inherit", fontSize: 11, cursor: "pointer", borderRadius: 10, fontWeight: 600 },
    input: { background: "#fdf8f0", border: `1.5px solid ${BORDER}`, color: TEXT, padding: "11px 14px", fontFamily: "inherit", fontSize: 14, borderRadius: 12, width: "100%", boxSizing: "border-box", outline: "none" },
    select: { background: "#fdf8f0", border: `1.5px solid ${BORDER}`, color: TEXT, padding: "11px 14px", fontFamily: "inherit", fontSize: 13, borderRadius: 12, width: "100%", boxSizing: "border-box" },
    tag: { display: "inline-block", background: "#f5ece0", color: "#8a6030", fontSize: 11, padding: "4px 11px", borderRadius: 20, fontWeight: 600 },
    exRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: `1px solid ${BORDER}` },
    setRow: { display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f0e8d8" },
    badge: (col) => ({ background: col + "18", color: col, fontSize: 11, padding: "4px 11px", borderRadius: 20, fontWeight: 700 }),
  };

  const NavIcons = { dashboard: "🏠", log: "➕", library: "📋", analytics: "📈" };
  const NavLabels = { dashboard: "Главная", log: "Тренировка", library: "Журнал", analytics: "Аналитика" };

  function Dashboard() {
    const lastWorkout = [...data.workouts].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    const ROTATION = ["Грудь / Бицепс", "Спина / Трицепс", "Ноги / Плечи"];
    const EMOJI = { "Грудь / Бицепс": "🏋️", "Спина / Трицепс": "💪", "Ноги / Плечи": "🦵" };
    const lastType = lastWorkout ? ROTATION.find(t => lastWorkout.name === t) : null;
    const nextWorkout = lastType ? ROTATION[(ROTATION.indexOf(lastType) + 1) % ROTATION.length] : ROTATION[0];
    return (
      <div style={S.page}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 6 }}>{new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}</div>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -0.8, lineHeight: 1.15, color: TEXT }}>
            {profile.name ? <>Привет, <span style={{ color: ACCENT }}>{profile.name}</span> 👋</> : <>Твой атлетический<br /><span style={{ color: ACCENT }}>дашборд</span></>}
          </div>        </div>
        <div style={S.statGrid}>
          <div style={S.statCard}>
            <div style={{ fontSize: 11, color: MUTED, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>Всего</div>
            <div style={S.statNum}>{totalWorkouts}</div>
            <div style={S.statLabel}>тренировок</div>
          </div>
          <div style={S.statCard}>
            <div style={{ fontSize: 11, color: MUTED, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>Неделя</div>
            <div style={S.statNum}>{thisWeek}<span style={{ fontSize: 18, color: "#c2c5d8", fontWeight: 500 }}>/3</span></div>
            <div style={S.statLabel}>тренировок</div>
          </div>
          <div style={{ ...S.statCard, gridColumn: "1 / -1", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 11, color: MUTED, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>Месяц</div>
              <div style={S.statNum}>{data.workouts.filter(w => (new Date() - new Date(w.date)) / 86400000 < 30).length}</div>
              <div style={S.statLabel}>тренировок</div>
            </div>
            <div style={{ fontSize: 40, opacity: 0.15 }}>📅</div>
          </div>
        </div>
        <div style={{ background: "linear-gradient(135deg, #4a3520 0%, #6b4f2e 50%, #8a6238 100%)", borderRadius: 20, padding: "18px 20px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 8px 28px rgba(100,70,30,0.20)" }}>
          <div>
            <div style={{ fontSize: 11, color: "rgba(232,185,120,0.70)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Следующая</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#e8c97a" }}>{EMOJI[nextWorkout]} {nextWorkout}</div>
          </div>
          <button style={{ background: "rgba(232,185,120,0.18)", color: "#e8c97a", border: "1.5px solid rgba(232,185,120,0.35)", padding: "9px 18px", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", borderRadius: 12 }}
            onClick={() => { setWorkout(w => ({ ...w, name: nextWorkout })); setView("log"); }}>
            Начать →
          </button>
        </div>
        {lastWorkout ? (
          <div style={S.section}>
            <span style={S.label}>Последняя тренировка</span>
            <div style={{ ...S.card, cursor: "pointer" }} onClick={() => { setExpanded(lastWorkout.id); setView("history"); }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: TEXT }}>{lastWorkout.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={S.badge(MUTED)}>{formatDate(lastWorkout.date)}</div>
                  <span style={{ color: ACCENT, fontSize: 14 }}>›</span>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{lastWorkout.exercises.map((e, i) => <span key={i} style={S.tag}>{e.name} · {e.sets.length}×</span>)}</div>
            </div>
          </div>
        ) : (
          <div style={{ ...S.card, textAlign: "center", padding: "36px 16px" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>💪</div>
            <div style={{ color: MUTED, fontSize: 13, marginBottom: 18 }}>Тренировок пока нет.<br />Начни прямо сейчас!</div>
            <button style={S.btn} onClick={() => setView("log")}>Записать тренировку</button>
          </div>
        )}
        {saveMsg && <div style={{ background: "#edfaf4", border: "1px solid #a7e3c0", borderRadius: 12, padding: "12px 16px", color: "#1e8a4a", fontSize: 13, fontWeight: 600 }}>{saveMsg}</div>}
      </div>
    );
  }

  function LogWorkout() {
    return (
      <div style={S.page}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: TEXT }}><span style={{ color: ACCENT }}>{editingWorkoutId ? "✎" : "+"}</span> {editingWorkoutId ? "Редактировать" : "Новая тренировка"}</div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 4, display: "flex", gap: 12, alignItems: "center" }}>
            {formatDate(workout.date)}
            {editingWorkoutId && <button style={{ ...S.btnGhost, padding: "3px 10px", fontSize: 10 }} onClick={() => { setEditingWorkoutId(null); setWorkout({ date: new Date().toISOString().split("T")[0], name: "", exercises: [] }); setView("history"); }}>Отмена</button>}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div><label style={S.label}>Дата</label><input type="date" style={S.input} value={workout.date} onChange={e => setWorkout(w => ({ ...w, date: e.target.value }))} /></div>
            <div>
              <label style={S.label}>Тип тренировки</label>
              <CustomSelect id="workout-type" value={workout.name}
                onChange={v => setWorkout(w => ({ ...w, name: v }))}
                placeholder="— выбери —"
                options={[
                  { value: "Грудь / Бицепс", label: "🏋️ Грудь / Бицепс" },
                  { value: "Спина / Трицепс", label: "💪 Спина / Трицепс" },
                  { value: "Ноги / Плечи", label: "🦵 Ноги / Плечи" },
                ]} />
            </div>
          </div>
          {workout.exercises.length === 0 && workout.name && data.templates[workout.name]?.length > 0 && (
            <button style={{ ...S.btnGhost, width: "100%", marginBottom: 4 }} onClick={() => { const exercises = data.templates[workout.name].map(name => ({ name, sets: [] })); setWorkout(wk => ({ ...wk, exercises })); setSelectedExercise(exercises[0]?.name || null); }}>
              ⎘ Загрузить шаблон «{workout.name}»
            </button>
          )}
        </div>
        {workout.exercises.map(ex => (
          <div key={ex.name} style={{ ...S.card, border: selectedExercise === ex.name ? "1.5px solid #4f7ef8aa" : "1px solid #e8eaf0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              {editingExName === ex.name ? (
                <input style={{ ...S.input, fontSize: 14, fontWeight: 700, padding: "4px 8px", flex: 1, marginRight: 8 }} value={editingExValue} autoFocus onChange={e => setEditingExValue(e.target.value)} onBlur={() => renameExercise(ex.name, editingExValue)} onKeyDown={e => { if (e.key === "Enter") renameExercise(ex.name, editingExValue); if (e.key === "Escape") setEditingExName(null); }} />
              ) : (
                <div style={{ fontWeight: 700, fontSize: 14, cursor: "pointer", flex: 1, display: "flex", alignItems: "center", gap: 6 }} onClick={() => setSelectedExercise(selectedExercise === ex.name ? null : ex.name)} onDoubleClick={() => { setEditingExName(ex.name); setEditingExValue(ex.name); }}>
                  {ex.name}
                  <span style={{ fontSize: 11, color: MUTED, cursor: "pointer", padding: "2px 4px" }} onClick={e => { e.stopPropagation(); setEditingExName(ex.name); setEditingExValue(ex.name); }}>✎</span>
                </div>
              )}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={S.badge(ACCENT)}>{ex.sets.length} подх.</span>
                <button style={S.btnDanger} onClick={() => removeExercise(ex.name)}>✕</button>
              </div>
            </div>
            {ex.sets.map((set, i) => {
              const isEditing = editingSet === set.id;
              return (
                <div key={set.id} style={{ ...S.setRow, background: isEditing ? "#f0f4ff" : "none", borderRadius: 8, padding: "6px 4px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: ACCENT, fontSize: 11, minWidth: 20 }}>#{i+1}</span>
                    {isEditing ? <input type="number" placeholder="кг" style={{ ...S.input, padding: "4px 8px", fontSize: 13, width: 70 }} value={set.weight} onChange={e => updateSet(ex.name, set.id, "weight", e.target.value)} autoFocus /> : <span style={{ color: TEXT, fontSize: 13, cursor: "pointer" }} onClick={() => setEditingSet(set.id)}>{set.weight ? `${set.weight} кг` : <span style={{ color: MUTED }}>— кг</span>}</span>}
                  </div>
                  <div>{isEditing ? <input type="number" placeholder="повт." style={{ ...S.input, padding: "4px 8px", fontSize: 13, width: 70 }} value={set.reps} onChange={e => updateSet(ex.name, set.id, "reps", e.target.value)} /> : <span style={{ color: TEXT, fontSize: 13, cursor: "pointer" }} onClick={() => setEditingSet(set.id)}>{set.reps ? `${set.reps} повт.` : <span style={{ color: MUTED }}>— повт.</span>}</span>}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {isEditing ? <button onClick={() => setEditingSet(null)} style={{ background: "none", border: "none", color: "#4caf50", cursor: "pointer", fontSize: 16 }}>✓</button> : <button onClick={() => setEditingSet(set.id)} style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 12 }}>✎</button>}
                    <button onClick={() => removeSet(ex.name, set.id)} style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 16 }}>×</button>
                  </div>
                </div>
              );
            })}
            {selectedExercise === ex.name && (
              <div style={{ marginTop: 12, padding: "12px 0 0", borderTop: "1px solid #e8eaf0" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <div><label style={S.label}>Вес (кг)</label><input style={S.input} type="number" placeholder="0" value={newSet.weight} onChange={e => setNewSet(n => ({ ...n, weight: e.target.value }))} /></div>
                  <div><label style={S.label}>Повторений</label><input style={S.input} type="number" placeholder="0" value={newSet.reps} onChange={e => setNewSet(n => ({ ...n, reps: e.target.value }))} /></div>
                  <div style={{ display: "flex", alignItems: "flex-end" }}><button style={{ ...S.btn, width: "100%", padding: "10px 0" }} onClick={() => addSetToExercise(ex.name)}>+ Подход</button></div>
                </div>
              </div>
            )}
          </div>
        ))}
        {addingExercise ? (
          <div style={S.card}>
            <input style={{ ...S.input, marginBottom: 10 }} placeholder="Поиск упражнения..." value={exerciseSearch} onChange={e => setExerciseSearch(e.target.value)} autoFocus />
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              {filteredExercises.filter(e => !workout.exercises.some(ex => ex.name === e)).map(e => <div key={e} style={S.exRow} onClick={() => addExerciseToWorkout(e)}><span style={{ fontSize: 13, cursor: "pointer" }}>{e}</span><span style={{ color: ACCENT, fontSize: 18 }}>+</span></div>)}
              {exerciseSearch && !filteredExercises.includes(exerciseSearch) && <div style={S.exRow} onClick={() => { save({ ...data, customExercises: [...data.customExercises, exerciseSearch] }); addExerciseToWorkout(exerciseSearch); }}><span style={{ fontSize: 13, cursor: "pointer", color: ACCENT }}>+ Добавить «{exerciseSearch}»</span></div>}
            </div>
            <button style={{ ...S.btnGhost, marginTop: 10 }} onClick={() => setAddingExercise(false)}>Отмена</button>
          </div>
        ) : (
          <button style={{ ...S.btnGhost, width: "100%", marginBottom: 16 }} onClick={() => setAddingExercise(true)}>+ Добавить упражнение</button>
        )}
        {workout.exercises.length > 0 && <button style={{ ...S.btn, width: "100%", padding: "14px", fontSize: 13 }} onClick={saveWorkout}>Сохранить тренировку</button>}
      </div>
    );
  }

  function History() {
    return (
      <div style={S.page}>
        <div style={{ fontSize: 22, fontWeight: 800, color: TEXT, marginBottom: 16 }}>История тренировок</div>
        <input style={{ ...S.input, marginBottom: 16 }} placeholder="Поиск по тренировкам..." value={historySearch} onChange={e => setHistorySearch(e.target.value)} />
        {filteredHistory.length === 0 && <div style={{ color: MUTED, textAlign: "center", padding: 40 }}>Нет записей</div>}
        {filteredHistory.sort((a, b) => new Date(b.date) - new Date(a.date)).map(w => (
          <div key={w.id} style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", cursor: "pointer" }} onClick={() => setExpanded(expanded === w.id ? null : w.id)}>
              <div><div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{w.name}</div><div style={{ color: MUTED, fontSize: 11 }}>{formatDate(w.date)}</div></div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={S.badge(MUTED)}>{w.exercises.length} упр.</span><span style={{ color: MUTED }}>{expanded === w.id ? "▲" : "▼"}</span></div>
            </div>
            {expanded === w.id && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f0f1f7" }}>
                {w.exercises.map((ex, i) => <div key={i} style={{ marginBottom: 10 }}><div style={{ fontSize: 12, fontWeight: 700, color: ACCENT, marginBottom: 4 }}>{ex.name}</div>{ex.sets.map((set, j) => <div key={j} style={{ fontSize: 12, color: MUTED, padding: "3px 0" }}>#{j+1} — {set.weight||"—"}кг × {set.reps||"—"} повт.</div>)}</div>)}
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button style={S.btnGhost} onClick={() => loadWorkoutForEdit(w)}>✎ Редактировать</button>
                  <button style={S.btnDanger} onClick={() => deleteWorkout(w.id)}>Удалить</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  function Exercises() {
    function addExercise() { const t = newExName.trim(); if (!t || allExercises.includes(t)) return; save({ ...data, customExercises: [...data.customExercises, t] }); setNewExName(""); }
    function deleteExercise(name) { save({ ...data, customExercises: data.customExercises.filter(e => e !== name) }); }
    function renameExerciseItem(oldName, newName) { const t = newName.trim(); if (!t || t === oldName) { setEditingExItem(null); return; } save({ ...data, customExercises: data.customExercises.map(e => e === oldName ? t : e) }); setEditingExItem(null); }
    return (
      <div style={S.page}>
        <div style={{ fontSize: 22, fontWeight: 800, color: TEXT, marginBottom: 4 }}>Упражнения</div>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 20 }}>{allExercises.length} упражнений</div>
        <div style={{ ...S.card, display: "flex", gap: 8, alignItems: "center" }}>
          <input style={{ ...S.input, flex: 1 }} placeholder="Название нового упражнения..." value={newExName} onChange={e => setNewExName(e.target.value)} onKeyDown={e => e.key === "Enter" && addExercise()} />
          <button style={{ ...S.btn, padding: "10px 16px", flexShrink: 0 }} onClick={addExercise}>+ Добавить</button>
        </div>
        <input style={{ ...S.input, marginBottom: 12 }} placeholder="Поиск..." value={exSearch} onChange={e => setExSearch(e.target.value)} />
        {data.customExercises.filter(e => e.toLowerCase().includes(exSearch.toLowerCase())).length > 0 ? (
          <div style={S.card}>
            {data.customExercises.filter(e => e.toLowerCase().includes(exSearch.toLowerCase())).map(name => (
              <div key={name} style={{ ...S.exRow, gap: 8 }}>
                {editingExItem === name ? <input style={{ ...S.input, flex: 1, padding: "4px 10px", fontSize: 13 }} value={editingExItemValue} autoFocus onChange={e => setEditingExItemValue(e.target.value)} onKeyDown={e => { if (e.key === "Enter") renameExerciseItem(name, editingExItemValue); if (e.key === "Escape") setEditingExItem(null); }} /> : <span style={{ flex: 1, fontSize: 13, color: TEXT }}>{name}</span>}
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {editingExItem === name
                    ? <button onMouseDown={e => { e.preventDefault(); renameExerciseItem(name, editingExItemValue); }} style={{ background: "none", border: "none", color: "#4caf50", cursor: "pointer", fontSize: 16 }}>✓</button>
                    : <button onMouseDown={() => { setEditingExItem(name); setEditingExItemValue(name); }} style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 14 }}>✎</button>}
                  <button onClick={() => deleteExercise(name)} style={{ background: "none", border: "none", color: "#f05252", cursor: "pointer", fontSize: 16 }}>×</button>
                </div>
              </div>
            ))}
          </div>
        ) : <div style={{ color: MUTED, textAlign: "center", padding: 40, fontSize: 13 }}>Нет упражнений. Добавь своё выше.</div>}
        <div style={{ marginTop: 8 }}>
          <span style={S.label}>Шаблоны тренировок</span>
          {["Грудь / Бицепс", "Спина / Трицепс", "Ноги / Плечи"].map(type => {
            const tplExercises = data.templates[type] || [];
            const isOpen = expandedTemplate === type;
            return (
              <div key={type} style={{ ...S.card, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setExpandedTemplate(isOpen ? null : type)}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: TEXT }}>{type}</div>
                    {!isOpen && tplExercises.length > 0 && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{tplExercises.length} упражнений</div>}
                  </div>
                  <span style={{ color: MUTED, fontSize: 13 }}>{isOpen ? "▲" : "▼"}</span>
                </div>
                {isOpen && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #f0f1f7" }}>
                    {tplExercises.map((name, i) => <div key={i} style={S.exRow}><span style={{ fontSize: 13, color: TEXT }}>{name}</span><button onClick={() => save({ ...data, templates: { ...data.templates, [type]: tplExercises.filter((_, j) => j !== i) } })} style={{ background: "none", border: "none", color: "#f05252", cursor: "pointer", fontSize: 16 }}>×</button></div>)}
                    <div style={{ marginTop: tplExercises.length > 0 ? 8 : 0 }}>
                      <CustomSelect id={`tpl-${type}`} value="" placeholder="+ Добавить упражнение..."
                        onChange={v => { if (!v || tplExercises.includes(v)) return; save({ ...data, templates: { ...data.templates, [type]: [...tplExercises, v] } }); }}
                        options={data.customExercises.slice().sort().filter(e => !tplExercises.includes(e)).map(e => ({ value: e, label: e }))} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function Progress() {
    const exercisesWithData = allExercises.filter(e => data.workouts.some(w => w.exercises.some(ex => ex.name === e)));
    return (
      <div style={S.page}>
        <div style={{ fontSize: 22, fontWeight: 800, color: TEXT, marginBottom: 16 }}>Прогресс</div>
        <div style={{ marginBottom: 20 }}>
          <label style={S.label}>Упражнение</label>
          <CustomSelect id="progress-ex" value={progressExercise}
            onChange={v => setProgressExercise(v)}
            placeholder="— выбери упражнение —"
            options={exercisesWithData.map(e => ({ value: e, label: e }))} />
        </div>
        {progressExercise && progressData.length > 0 && (
          <>
            <div style={S.card}>
              <label style={S.label}>Максимальный вес (кг)</label>
              <MiniChart points={progressData.map(d => ({ x: d.date, y: d.maxWeight }))} color={ACCENT} unit="кг" />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                <span style={{ fontSize: 11, color: MUTED }}>Старт: {progressData[0].maxWeight}кг</span>
                <span style={{ fontSize: 11, color: ACCENT, fontWeight: 700 }}>Сейчас: {progressData[progressData.length-1].maxWeight}кг{progressData.length > 1 && <span style={{ marginLeft: 6 }}>({progressData[progressData.length-1].maxWeight > progressData[0].maxWeight ? "+" : ""}{(progressData[progressData.length-1].maxWeight - progressData[0].maxWeight).toFixed(1)}кг)</span>}</span>
              </div>
            </div>
            <div style={S.card}>
              <label style={S.label}>История по датам</label>
              {progressData.map((d, i) => <div key={i} style={{ ...S.exRow, fontSize: 12 }}><span style={{ color: MUTED }}>{formatDate(d.date)}</span><span style={{ color: ACCENT, fontWeight: 700 }}>{d.maxWeight}кг</span></div>)}
            </div>
          </>
        )}
        {progressExercise && progressData.length === 0 && <div style={{ color: MUTED, textAlign: "center", padding: 40 }}>Нет данных</div>}
        {!progressExercise && <div style={{ color: MUTED, textAlign: "center", padding: 40, fontSize: 13 }}>Выбери упражнение, чтобы увидеть динамику</div>}
      </div>
    );
  }

  function WeightLog() {
    const sorted = [...(data.weightLog || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
    const last = sorted[sorted.length - 1];
    const first = sorted[0];
    const diff = last && first && sorted.length > 1 ? (parseFloat(last.value) - parseFloat(first.value)).toFixed(1) : null;

    function addEntry() {
      const v = parseFloat(newWeight.value);
      if (!v || !newWeight.date) return;
      const existing = (data.weightLog || []).findIndex(e => e.date === newWeight.date);
      let newLog;
      if (existing >= 0) {
        newLog = data.weightLog.map((e, i) => i === existing ? { ...e, value: newWeight.value } : e);
      } else {
        newLog = [...(data.weightLog || []), { date: newWeight.date, value: newWeight.value, id: Date.now() }];
      }
      save({ ...data, weightLog: newLog });
      setNewWeight({ date: new Date().toISOString().split("T")[0], value: "" });
    }

    function deleteEntry(id) {
      save({ ...data, weightLog: data.weightLog.filter(e => e.id !== id) });
    }

    const chartPoints = sorted.map(e => ({ x: e.date, y: parseFloat(e.value) }));
    const diffNum = diff !== null ? parseFloat(diff) : 0;
    const diffColor = !profile.goal ? ACCENT
      : profile.goal === "gain"
        ? (diffNum > 0 ? "#2e8a4a" : diffNum < 0 ? "#c0503a" : ACCENT)
        : (diffNum < 0 ? "#2e8a4a" : diffNum > 0 ? "#c0503a" : ACCENT);

    return (
      <div style={S.page}>
        <div style={{ fontSize: 22, fontWeight: 800, color: TEXT, marginBottom: 4 }}>Вес тела</div>
        {!profile.goal && <div style={{ fontSize: 12, color: MUTED, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <span>Укажи цель в</span>
          <button onMouseDown={() => { setProfileEdit({ ...profile }); setShowProfile(true); }} style={{ background: "none", border: "none", color: ACCENT, fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>профиле →</button>
        </div>}
        {profile.goal && <div style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
          Цель: <span style={{ color: ACCENT, fontWeight: 700 }}>{profile.goal === "gain" ? "💪 Набор массы" : "🔥 Похудение"}</span>
        </div>}
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 16 }}>{sorted.length} записей</div>

        {sorted.length >= 2 && (
          <div style={S.statGrid}>
            <div style={S.statCard}>
              <div style={{ fontSize: 11, color: MUTED, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Сейчас</div>
              <div style={S.statNum}>{last.value}<span style={{ fontSize: 14, color: MUTED, fontWeight: 500 }}> кг</span></div>
              <div style={S.statLabel}>{formatDate(last.date)}</div>
            </div>
            <div style={S.statCard}>
              <div style={{ fontSize: 11, color: MUTED, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Изменение</div>
              <div style={{ ...S.statNum, color: diffColor }}>
                {diff > 0 ? "+" : ""}{diff}<span style={{ fontSize: 14, fontWeight: 500 }}> кг</span>
              </div>
              <div style={S.statLabel}>с начала</div>
            </div>
          </div>
        )}

        {sorted.length >= 2 && (
          <div style={{ ...S.card, marginBottom: 16 }}>
            <span style={S.label}>Динамика</span>
            <MiniChart points={chartPoints} color={diffColor} unit="кг" />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <span style={{ fontSize: 11, color: MUTED }}>{first.value} кг · {formatDate(first.date)}</span>
              <span style={{ fontSize: 11, color: ACCENT, fontWeight: 700 }}>{last.value} кг · {formatDate(last.date)}</span>
            </div>
          </div>
        )}

        <div style={{ ...S.card, marginBottom: 16 }}>
          <span style={S.label}>Добавить запись</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ ...S.label, marginBottom: 6 }}>Дата</label>
              <input type="date" style={S.input} value={newWeight.date} onChange={e => setNewWeight(n => ({ ...n, date: e.target.value }))} />
            </div>
            <div>
              <label style={{ ...S.label, marginBottom: 6 }}>Вес (кг)</label>
              <input type="number" step="0.1" placeholder="70.0" style={S.input} value={newWeight.value}
                onChange={e => setNewWeight(n => ({ ...n, value: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && addEntry()} />
            </div>
          </div>
          <button style={{ ...S.btn, width: "100%" }} onClick={addEntry}>+ Сохранить</button>
        </div>

        {sorted.length > 0 && (
          <div style={S.card}>
            <span style={S.label}>История</span>
            {[...sorted].reverse().map(e => (
              <div key={e.id} style={S.exRow}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{e.value} кг</div>
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{formatDate(e.date)}</div>
                </div>
                <button onClick={() => deleteEntry(e.id)} style={{ background: "none", border: "none", color: "#d0b090", cursor: "pointer", fontSize: 18 }}>×</button>
              </div>
            ))}
          </div>
        )}

        {sorted.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 0", color: MUTED, fontSize: 13 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚖️</div>
            Добавь первую запись, чтобы начать отслеживать
          </div>
        )}
      </div>
    );
  }

  function Records() {
    const recordList = Object.entries(records).sort((a, b) => b[1].maxWeight - a[1].maxWeight);
    return (
      <div style={S.page}>
        <div style={{ fontSize: 22, fontWeight: 800, color: TEXT, marginBottom: 16 }}>Личные рекорды</div>
        {recordList.length === 0 && <div style={{ color: MUTED, textAlign: "center", padding: 40 }}>Запиши тренировки, чтобы увидеть рекорды</div>}
        {recordList.map(([name, rec]) => (
          <div key={name} style={S.card}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: TEXT }}>{name}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div><div style={{ ...S.statNum, fontSize: 22 }}>{rec.maxWeight}<span style={{ fontSize: 13, color: ACCENT }}>кг</span></div><div style={S.statLabel}>Макс вес</div></div>
              <div><div style={{ ...S.statNum, fontSize: 22 }}>{rec.maxReps}</div><div style={S.statLabel}>Повт. при макс весе</div></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={S.app}>
      <style>{`
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>
      <div style={S.header}>
        <div style={S.logo}>Iron Log</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 11, color: "rgba(232,185,120,0.60)", letterSpacing: 1, fontWeight: 600 }}>
            {new Date().toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" }).toUpperCase()}
          </div>
          <button onClick={() => { setProfileEdit({ ...profile }); setShowProfile(true); }} style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(232,185,120,0.18)", border: "1.5px solid rgba(232,185,120,0.35)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#e8c97a" }}>
            {profile.name ? profile.name[0].toUpperCase() : "👤"}
          </button>
        </div>
      </div>

      {showProfile && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(34,26,16,0.5)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "flex-end" }} onClick={() => setShowProfile(false)}>
          <div style={{ background: CARD, width: 300, margin: "64px 12px 0 0", borderRadius: 20, border: `1px solid ${BORDER}`, boxShadow: "0 16px 48px rgba(100,70,20,0.18)", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
            <div style={{ background: "linear-gradient(135deg, #4a3520, #6b4f2e)", padding: "20px 20px 16px", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(232,185,120,0.2)", border: "2px solid rgba(232,185,120,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "#e8c97a", fontWeight: 800, flexShrink: 0 }}>
                {profile.name ? profile.name[0].toUpperCase() : "?"}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#e8c97a" }}>{profile.name || "Без имени"}</div>
                {(profile.age || profile.weight || profile.height) && (
                  <div style={{ fontSize: 12, color: "rgba(232,185,120,0.6)", marginTop: 2 }}>
                    {[profile.age && `${profile.age} лет`, profile.weight && `${profile.weight} кг`, profile.height && `${profile.height} см`].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
            </div>
            <div style={{ padding: "16px 20px 20px" }}>
              {[
                { key: "name", label: "Имя", placeholder: "Как тебя зовут?", type: "text" },
                { key: "age", label: "Возраст", placeholder: "лет", type: "number" },
                { key: "weight", label: "Вес", placeholder: "кг", type: "number" },
                { key: "height", label: "Рост", placeholder: "см", type: "number" },
              ].map(({ key, label, placeholder, type }) => (
                <div key={key} style={{ marginBottom: 12 }}>
                  <label style={S.label}>{label}</label>
                  <input type={type} placeholder={placeholder} value={profileEdit[key]}
                    onChange={e => setProfileEdit(p => ({ ...p, [key]: e.target.value }))}
                    style={S.input} />
                </div>
              ))}
              <div style={{ marginBottom: 12 }}>
                <label style={S.label}>Цель</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {[["gain", "💪 Набор массы"], ["loss", "🔥 Похудение"]].map(([val, label]) => (
                    <button key={val} onMouseDown={() => setProfileEdit(p => ({ ...p, goal: val }))}
                      style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: `1.5px solid ${profileEdit.goal === val ? ACCENT : BORDER}`, background: profileEdit.goal === val ? "#fdf3e3" : "#fdf8f0", color: profileEdit.goal === val ? ACCENT : MUTED, fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <button style={{ ...S.btn, width: "100%", marginTop: 4 }} onClick={async () => {
                setProfile(profileEdit);
                try {
                  if (isConfigured && supabase) {
                    const uid = getUserId();
                    await supabase.from("user_data").upsert({ user_id: uid + "_profile", data: profileEdit, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
                  }
                } catch {}
                setShowProfile(false);
              }}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
      {view === "dashboard" && Dashboard()}
      {view === "log" && LogWorkout()}
      {view === "library" && (
        <div>
          <div style={{ display: "flex", gap: 8, padding: "14px 16px 0", maxWidth: 480, margin: "0 auto" }}>
            {[["history","📋 История"], ["exercises","🏋️ Упражнения"]].map(([k, label]) => (
              <button key={k} onClick={() => setLibraryTab(k)} style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, background: libraryTab === k ? ACCENT : BORDER, color: libraryTab === k ? "#fff" : MUTED, transition: "all 0.15s" }}>{label}</button>
            ))}
          </div>
          {libraryTab === "history" && History()}
          {libraryTab === "exercises" && Exercises()}
        </div>
      )}
      {view === "analytics" && (
        <div>
          <div style={{ display: "flex", gap: 6, padding: "14px 16px 0", maxWidth: 480, margin: "0 auto" }}>
            {[["weight","⚖️ Вес"], ["progress","📈 Прогресс"], ["records","🏆 Рекорды"]].map(([k, label]) => (
              <button key={k} onClick={() => setAnalyticsTab(k)} style={{ flex: 1, padding: "9px 0", borderRadius: 12, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, background: analyticsTab === k ? ACCENT : BORDER, color: analyticsTab === k ? "#fff" : MUTED, transition: "all 0.15s" }}>{label}</button>
            ))}
          </div>
          {analyticsTab === "weight" && WeightLog()}
          {analyticsTab === "progress" && Progress()}
          {analyticsTab === "records" && Records()}
        </div>
      )}
      <nav style={S.nav}>
        {["dashboard", "log", "library", "analytics"].map(v => (
          <button key={v} style={S.navBtn(view === v)} onClick={() => setView(v)}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>{NavIcons[v]}</span>
            <span>{NavLabels[v]}</span>
            <div style={S.navDot(view === v)} />
          </button>
        ))}
      </nav>
    </div>
  );
}
