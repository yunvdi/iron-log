import { useState, useEffect, useCallback } from "react";
import { supabase, getUserId, isConfigured } from "./supabase.js";

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

const DEFAULT_DATA = {
  workouts: [],
  customExercises: [],
  templates: {
    "Грудь / Бицепс": [],
    "Спина / Трицепс": [],
    "Ноги / Плечи": []
  }
};

export default function FitnessTracker() {
  const [data, setData] = useState(DEFAULT_DATA);
  const [view, setView] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState(false);

  const [workout, setWorkout] = useState({
    date: new Date().toISOString().split("T")[0],
    name: "",
    exercises: []
  });
  const [addingExercise, setAddingExercise] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [newSet, setNewSet] = useState({ weight: "", reps: "", note: "" });
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

  // ── ЗАГРУЗКА ИЗ SUPABASE ────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      if (!isConfigured || !supabase) {
        setSyncError(true);
        setLoading(false);
        return;
      }
      try {
        const uid = getUserId();
        const { data: row, error } = await supabase
          .from("user_data")
          .select("data")
          .eq("user_id", uid)
          .maybeSingle();
        if (error) throw error;
        if (row && row.data) {
          setData(prev => ({
            ...DEFAULT_DATA,
            ...row.data,
            templates: { ...DEFAULT_DATA.templates, ...(row.data.templates || {}) }
          }));
        }
      } catch (e) {
        console.error('Supabase load error:', e);
        setSyncError(true);
      }
      setLoading(false);
    }
    load();
  }, []);

  // ── СОХРАНЕНИЕ В SUPABASE ───────────────────────────────────────────────────
  const save = useCallback(async (newData) => {
    setData(newData);
    if (!isConfigured || !supabase) return;
    try {
      const uid = getUserId();
      await supabase
        .from("user_data")
        .upsert({ user_id: uid, data: newData, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    } catch (e) {
      console.error('Supabase save error:', e);
      setSyncError(true);
    }
  }, []);

  const allExercises = [...data.customExercises].sort();

  // ── STATS ───────────────────────────────────────────────────────────────────
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
    ? data.workouts
        .filter(w => w.exercises.some(e => e.name === progressExercise))
        .map(w => {
          const ex = w.exercises.find(e => e.name === progressExercise);
          const maxW = Math.max(...ex.sets.map(s => parseFloat(s.weight) || 0));
          return { date: w.date, maxWeight: maxW };
        })
        .sort((a, b) => new Date(a.date) - new Date(b.date))
    : [];

  // ── WORKOUT ACTIONS ─────────────────────────────────────────────────────────
  function addExerciseToWorkout(name) {
    setWorkout(w => ({ ...w, exercises: [...w.exercises, { name, sets: [] }] }));
    setSelectedExercise(name);
    setAddingExercise(false);
    setExerciseSearch("");
  }

  function addSetToExercise(exName) {
    if (!newSet.weight && !newSet.reps) return;
    setWorkout(w => ({
      ...w,
      exercises: w.exercises.map(e =>
        e.name === exName ? { ...e, sets: [...e.sets, { ...newSet, id: Date.now() }] } : e
      )
    }));
    setNewSet({ weight: "", reps: "", note: "" });
  }

  function removeSet(exName, setId) {
    setWorkout(w => ({
      ...w,
      exercises: w.exercises.map(e =>
        e.name === exName ? { ...e, sets: e.sets.filter(s => s.id !== setId) } : e
      )
    }));
  }

  function updateSet(exName, setId, field, value) {
    setWorkout(w => ({
      ...w,
      exercises: w.exercises.map(e =>
        e.name === exName
          ? { ...e, sets: e.sets.map(s => s.id === setId ? { ...s, [field]: value } : s) }
          : e
      )
    }));
  }

  function removeExercise(exName) {
    setWorkout(w => ({ ...w, exercises: w.exercises.filter(e => e.name !== exName) }));
    if (selectedExercise === exName) setSelectedExercise(null);
  }

  function renameExercise(oldName, newName) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) { setEditingExName(null); return; }
    setWorkout(w => ({ ...w, exercises: w.exercises.map(e => e.name === oldName ? { ...e, name: trimmed } : e) }));
    if (selectedExercise === oldName) setSelectedExercise(trimmed);
    setEditingExName(null);
  }

  function loadWorkoutForEdit(w) {
    setWorkout({ ...w });
    setEditingWorkoutId(w.id);
    setSelectedExercise(null);
    setEditingSet(null);
    setView("log");
  }

  function saveWorkout() {
    if (workout.exercises.length === 0) return;
    const wName = workout.name || `Тренировка ${formatDate(workout.date)}`;
    let newData;
    if (editingWorkoutId) {
      newData = { ...data, workouts: data.workouts.map(w => w.id === editingWorkoutId ? { ...workout, name: wName } : w) };
      setEditingWorkoutId(null);
    } else {
      newData = { ...data, workouts: [{ ...workout, name: wName, id: Date.now() }, ...data.workouts] };
    }
    save(newData);
    setWorkout({ date: new Date().toISOString().split("T")[0], name: "", exercises: [] });
    setSelectedExercise(null);
    setSaveMsg(editingWorkoutId ? "Тренировка обновлена ✓" : "Тренировка сохранена ✓");
    setTimeout(() => setSaveMsg(""), 3000);
    setView("dashboard");
  }

  function deleteWorkout(id) {
    save({ ...data, workouts: data.workouts.filter(w => w.id !== id) });
  }

  const filteredHistory = data.workouts.filter(w =>
    w.name.toLowerCase().includes(historySearch.toLowerCase()) ||
    w.exercises.some(e => e.name.toLowerCase().includes(historySearch.toLowerCase()))
  );

  const filteredExercises = allExercises.filter(e =>
    e.toLowerCase().includes(exerciseSearch.toLowerCase())
  );

  // ── LOADING SCREEN ──────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ background: "#f5f6fa", height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', 'Helvetica Neue', sans-serif", gap: 20 }}>
      <div style={{ fontSize: 36 }}>🏋️</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "#4f7ef8" }}>Iron Log</div>
      <div style={{ display: "flex", gap: 6 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#4f7ef8", animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`, opacity: 0.7 }} />
        ))}
      </div>
      <style>{`@keyframes bounce { 0%,80%,100%{transform:scale(0.7);opacity:0.4}40%{transform:scale(1);opacity:1} }`}</style>
    </div>
  );

  // ── MINI CHART ──────────────────────────────────────────────────────────────
  function MiniChart({ points, color = "#4f7ef8" }) {
    if (points.length < 2) return <div style={{ color: "#bbb", fontSize: 12, padding: "20px 0" }}>Недостаточно данных</div>;
    const vals = points.map(p => p.y);
    const min = Math.min(...vals), max = Math.max(...vals);
    const W = 280, H = 80, pad = 8;
    const sx = i => pad + (i / (points.length - 1)) * (W - 2 * pad);
    const sy = v => H - pad - ((v - min) / (max - min || 1)) * (H - 2 * pad);
    const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${sx(i).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
    const area = path + ` L${sx(points.length - 1)},${H} L${sx(0)},${H} Z`;
    return (
      <svg width={W} height={H} style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#cg)" />
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => <circle key={i} cx={sx(i)} cy={sy(p.y)} r="3.5" fill={color} />)}
      </svg>
    );
  }

  // ── STYLES ──────────────────────────────────────────────────────────────────
  const S = {
    app: { background: "#f5f6fa", minHeight: "100vh", fontFamily: "'Segoe UI','Helvetica Neue',sans-serif", color: "#1a1d2e", paddingBottom: 80 },
    header: { background: "#fff", borderBottom: "1px solid #e8eaf0", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" },
    logo: { fontSize: 19, fontWeight: 800, letterSpacing: 1, color: "#4f7ef8" },
    nav: { position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #e8eaf0", display: "flex", zIndex: 100, boxShadow: "0 -2px 12px rgba(0,0,0,0.06)" },
    navBtn: (active) => ({
      flex: 1, padding: "12px 4px 8px", background: "none", border: "none", cursor: "pointer",
      color: active ? "#4f7ef8" : "#b0b5c8", fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
      borderTop: active ? "2px solid #4f7ef8" : "2px solid transparent",
      transition: "all 0.15s", fontFamily: "inherit"
    }),
    page: { padding: "20px 16px", maxWidth: 480, margin: "0 auto" },
    section: { marginBottom: 24 },
    label: { fontSize: 11, letterSpacing: 0.5, color: "#8b90a7", textTransform: "uppercase", marginBottom: 8, display: "block", fontWeight: 600 },
    card: { background: "#fff", border: "1px solid #e8eaf0", borderRadius: 14, padding: 16, marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" },
    statGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 },
    statCard: { background: "#fff", border: "1px solid #e8eaf0", borderRadius: 14, padding: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" },
    statNum: { fontSize: 32, fontWeight: 800, color: "#4f7ef8", letterSpacing: -1, lineHeight: 1 },
    statLabel: { fontSize: 11, color: "#8b90a7", letterSpacing: 0.3, marginTop: 5, fontWeight: 500 },
    btn: { background: "#4f7ef8", color: "#fff", border: "none", padding: "11px 22px", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", borderRadius: 10 },
    btnGhost: { background: "none", color: "#4f7ef8", border: "1.5px solid #4f7ef8", padding: "8px 16px", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer", borderRadius: 10 },
    btnDanger: { background: "none", color: "#f05252", border: "1.5px solid #f8c5c5", padding: "7px 14px", fontFamily: "inherit", fontSize: 11, cursor: "pointer", borderRadius: 10, fontWeight: 600 },
    input: { background: "#f5f6fa", border: "1.5px solid #e0e3ef", color: "#1a1d2e", padding: "10px 14px", fontFamily: "inherit", fontSize: 14, borderRadius: 10, width: "100%", boxSizing: "border-box", outline: "none" },
    select: { background: "#f5f6fa", border: "1.5px solid #e0e3ef", color: "#1a1d2e", padding: "10px 14px", fontFamily: "inherit", fontSize: 13, borderRadius: 10, width: "100%", boxSizing: "border-box" },
    tag: { display: "inline-block", background: "#eef2ff", color: "#4f7ef8", fontSize: 11, padding: "4px 10px", borderRadius: 20, fontWeight: 600 },
    exRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f0f1f7" },
    setRow: { display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f5f6fa" },
    badge: (col) => ({ background: col + "18", color: col, fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 700 }),
  };

  const NavIcons = { dashboard: "▦", log: "＋", history: "≡", exercises: "◈", progress: "↗", records: "★" };
  const NavLabels = { dashboard: "Главная", log: "Тренировка", history: "История", exercises: "Упражнения", progress: "Прогресс", records: "Рекорды" };

  // ── DASHBOARD ───────────────────────────────────────────────────────────────
  function Dashboard() {
    const lastWorkout = [...data.workouts].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    const ROTATION = ["Грудь / Бицепс", "Спина / Трицепс", "Ноги / Плечи"];
    const EMOJI = { "Грудь / Бицепс": "🏋️", "Спина / Трицепс": "💪", "Ноги / Плечи": "🦵" };
    const lastType = lastWorkout ? ROTATION.find(t => lastWorkout.name === t) : null;
    const nextWorkout = lastType ? ROTATION[(ROTATION.indexOf(lastType) + 1) % ROTATION.length] : ROTATION[0];

    return (
      <div style={S.page}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: "#8b90a7", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 }}>
            {new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1.1 }}>
            Твой атлетический<br /><span style={{ color: "#4f7ef8" }}>дашборд</span>
          </div>
        </div>

        {syncError && (
          <div style={{ background: "#fff5f5", border: "1px solid #fcc", borderRadius: 10, padding: "10px 14px", color: "#e53e3e", fontSize: 12, marginBottom: 16 }}>
            {!isConfigured
              ? "⚠️ Supabase не настроен. Добавь VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в Environment Variables на Vercel и сделай Redeploy."
              : "⚠️ Нет связи с облаком. Данные сохраняются только локально."}
          </div>
        )}

        <div style={S.statGrid}>
          <div style={S.statCard}>
            <div style={S.statNum}>{totalWorkouts}</div>
            <div style={S.statLabel}>Тренировок всего</div>
          </div>
          <div style={S.statCard}>
            <div style={S.statNum}>{thisWeek}<span style={{ fontSize: 16, color: "#b0b5c8", fontWeight: 400 }}>/3</span></div>
            <div style={S.statLabel}>За 7 дней</div>
          </div>
          <div style={{ ...S.statCard, gridColumn: "1 / -1" }}>
            <div style={S.statNum}>{data.workouts.filter(w => (new Date() - new Date(w.date)) / 86400000 < 30).length}</div>
            <div style={S.statLabel}>За последние 30 дней</div>
          </div>
        </div>

        <div style={{ ...S.card, background: "#eef2ff", border: "1.5px solid #c7d4fd", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, color: "#7b93e8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Следующая тренировка</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#2d4fd4" }}>{EMOJI[nextWorkout]} {nextWorkout}</div>
          </div>
          <button style={{ ...S.btn, fontSize: 12, padding: "9px 16px", whiteSpace: "nowrap" }}
            onClick={() => { setWorkout(w => ({ ...w, name: nextWorkout })); setView("log"); }}>
            Начать →
          </button>
        </div>

        {lastWorkout ? (
          <div style={S.section}>
            <span style={S.label}>Последняя тренировка</span>
            <div style={{ ...S.card, cursor: "pointer" }}
              onClick={() => { setExpanded(lastWorkout.id); setView("history"); }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{lastWorkout.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={S.badge("#8b90a7")}>{formatDate(lastWorkout.date)}</div>
                  <span style={{ color: "#4f7ef8", fontSize: 13 }}>→</span>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {lastWorkout.exercises.map((e, i) => <span key={i} style={S.tag}>{e.name} · {e.sets.length}×</span>)}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ ...S.card, textAlign: "center", padding: "32px 16px" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>💪</div>
            <div style={{ color: "#8b90a7", fontSize: 13, marginBottom: 16 }}>Тренировок пока нет.<br />Начни прямо сейчас!</div>
            <button style={S.btn} onClick={() => setView("log")}>Записать тренировку</button>
          </div>
        )}

        {saveMsg && (
          <div style={{ background: "#eefaf3", border: "1px solid #a7e3c0", borderRadius: 10, padding: "12px 16px", color: "#27a05a", fontSize: 13 }}>
            {saveMsg}
          </div>
        )}
      </div>
    );
  }

  // ── LOG WORKOUT ─────────────────────────────────────────────────────────────
  function LogWorkout() {
    return (
      <div style={S.page}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#1a1d2e" }}>
            <span style={{ color: "#4f7ef8" }}>{editingWorkoutId ? "✎" : "+"}</span> {editingWorkoutId ? "Редактировать" : "Новая тренировка"}
          </div>
          <div style={{ fontSize: 12, color: "#8b90a7", marginTop: 4, display: "flex", gap: 12, alignItems: "center" }}>
            {formatDate(workout.date)}
            {editingWorkoutId && (
              <button style={{ ...S.btnGhost, padding: "3px 10px", fontSize: 10 }} onClick={() => {
                setEditingWorkoutId(null);
                setWorkout({ date: new Date().toISOString().split("T")[0], name: "", exercises: [] });
                setView("history");
              }}>Отмена</button>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={S.label}>Дата</label>
              <input type="date" style={S.input} value={workout.date}
                onChange={e => setWorkout(w => ({ ...w, date: e.target.value }))} />
            </div>
            <div>
              <label style={S.label}>Тип тренировки</label>
              <select style={S.select} value={workout.name}
                onChange={e => setWorkout(w => ({ ...w, name: e.target.value }))}>
                <option value="">— выбери —</option>
                <option value="Грудь / Бицепс">Грудь / Бицепс</option>
                <option value="Спина / Трицепс">Спина / Трицепс</option>
                <option value="Ноги / Плечи">Ноги / Плечи</option>
              </select>
            </div>
          </div>

          {workout.exercises.length === 0 && workout.name && data.templates[workout.name]?.length > 0 && (
            <button style={{ ...S.btnGhost, width: "100%", marginBottom: 4 }}
              onClick={() => {
                const tpl = data.templates[workout.name];
                const exercises = tpl.map(name => ({ name, sets: [] }));
                setWorkout(wk => ({ ...wk, exercises }));
                setSelectedExercise(exercises[0]?.name || null);
              }}>
              ⎘ Загрузить шаблон «{workout.name}»
            </button>
          )}
        </div>

        {workout.exercises.map(ex => (
          <div key={ex.name} style={{ ...S.card, border: selectedExercise === ex.name ? "1.5px solid #4f7ef8aa" : "1px solid #e8eaf0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              {editingExName === ex.name ? (
                <input
                  style={{ ...S.input, fontSize: 14, fontWeight: 700, padding: "4px 8px", flex: 1, marginRight: 8 }}
                  value={editingExValue} autoFocus
                  onChange={e => setEditingExValue(e.target.value)}
                  onBlur={() => renameExercise(ex.name, editingExValue)}
                  onKeyDown={e => { if (e.key === "Enter") renameExercise(ex.name, editingExValue); if (e.key === "Escape") setEditingExName(null); }}
                />
              ) : (
                <div style={{ fontWeight: 700, fontSize: 14, cursor: "pointer", flex: 1, display: "flex", alignItems: "center", gap: 6 }}
                  onClick={() => setSelectedExercise(selectedExercise === ex.name ? null : ex.name)}
                  onDoubleClick={() => { setEditingExName(ex.name); setEditingExValue(ex.name); }}>
                  {ex.name}
                  <span style={{ fontSize: 11, color: "#c0c4d6", cursor: "pointer", padding: "2px 4px" }}
                    onClick={e => { e.stopPropagation(); setEditingExName(ex.name); setEditingExValue(ex.name); }}>✎</span>
                </div>
              )}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={S.badge("#4f7ef8")}>{ex.sets.length} подх.</span>
                <button style={S.btnDanger} onClick={() => removeExercise(ex.name)}>✕</button>
              </div>
            </div>

            {ex.sets.map((set, i) => {
              const isEditing = editingSet === set.id;
              return (
                <div key={set.id} style={{ ...S.setRow, background: isEditing ? "#f0f4ff" : "none", borderRadius: 8, padding: "6px 4px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "#4f7ef8", fontSize: 11, minWidth: 20 }}>#{i + 1}</span>
                    {isEditing ? (
                      <input type="number" placeholder="кг" style={{ ...S.input, padding: "4px 8px", fontSize: 13, width: 70 }}
                        value={set.weight} onChange={e => updateSet(ex.name, set.id, "weight", e.target.value)} autoFocus />
                    ) : (
                      <span style={{ color: "#1a1d2e", fontSize: 13, cursor: "pointer" }} onClick={() => setEditingSet(set.id)}>
                        {set.weight ? `${set.weight} кг` : <span style={{ color: "#c0c4d6" }}>— кг</span>}
                      </span>
                    )}
                  </div>
                  <div>
                    {isEditing ? (
                      <input type="number" placeholder="повт." style={{ ...S.input, padding: "4px 8px", fontSize: 13, width: 70 }}
                        value={set.reps} onChange={e => updateSet(ex.name, set.id, "reps", e.target.value)} />
                    ) : (
                      <span style={{ color: "#1a1d2e", fontSize: 13, cursor: "pointer" }} onClick={() => setEditingSet(set.id)}>
                        {set.reps ? `${set.reps} повт.` : <span style={{ color: "#c0c4d6" }}>— повт.</span>}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {isEditing
                      ? <button onClick={() => setEditingSet(null)} style={{ background: "none", border: "none", color: "#4caf50", cursor: "pointer", fontSize: 16 }}>✓</button>
                      : <button onClick={() => setEditingSet(set.id)} style={{ background: "none", border: "none", color: "#b0b5c8", cursor: "pointer", fontSize: 12 }}>✎</button>}
                    <button onClick={() => removeSet(ex.name, set.id)} style={{ background: "none", border: "none", color: "#c0c4d6", cursor: "pointer", fontSize: 16 }}>×</button>
                  </div>
                </div>
              );
            })}

            {selectedExercise === ex.name && (
              <div style={{ marginTop: 12, padding: "12px 0 0", borderTop: "1px solid #e8eaf0" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <div>
                    <label style={S.label}>Вес (кг)</label>
                    <input style={S.input} type="number" placeholder="0" value={newSet.weight}
                      onChange={e => setNewSet(n => ({ ...n, weight: e.target.value }))} />
                  </div>
                  <div>
                    <label style={S.label}>Повторений</label>
                    <input style={S.input} type="number" placeholder="0" value={newSet.reps}
                      onChange={e => setNewSet(n => ({ ...n, reps: e.target.value }))} />
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end" }}>
                    <button style={{ ...S.btn, width: "100%", padding: "10px 0" }} onClick={() => addSetToExercise(ex.name)}>+ Подход</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {addingExercise ? (
          <div style={S.card}>
            <input style={{ ...S.input, marginBottom: 10 }} placeholder="Поиск упражнения..."
              value={exerciseSearch} onChange={e => setExerciseSearch(e.target.value)} autoFocus />
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              {filteredExercises.filter(e => !workout.exercises.some(ex => ex.name === e)).map(e => (
                <div key={e} style={S.exRow} onClick={() => addExerciseToWorkout(e)}>
                  <span style={{ fontSize: 13, cursor: "pointer" }}>{e}</span>
                  <span style={{ color: "#4f7ef8", fontSize: 18 }}>+</span>
                </div>
              ))}
              {exerciseSearch && !filteredExercises.includes(exerciseSearch) && (
                <div style={S.exRow} onClick={() => {
                  save({ ...data, customExercises: [...data.customExercises, exerciseSearch] });
                  addExerciseToWorkout(exerciseSearch);
                }}>
                  <span style={{ fontSize: 13, cursor: "pointer", color: "#4f7ef8" }}>+ Добавить «{exerciseSearch}»</span>
                </div>
              )}
            </div>
            <button style={{ ...S.btnGhost, marginTop: 10 }} onClick={() => setAddingExercise(false)}>Отмена</button>
          </div>
        ) : (
          <button style={{ ...S.btnGhost, width: "100%", marginBottom: 16 }} onClick={() => setAddingExercise(true)}>+ Добавить упражнение</button>
        )}

        {workout.exercises.length > 0 && (
          <button style={{ ...S.btn, width: "100%", padding: "14px", fontSize: 13 }} onClick={saveWorkout}>
            Сохранить тренировку
          </button>
        )}
      </div>
    );
  }

  // ── HISTORY ─────────────────────────────────────────────────────────────────
  function History() {
    return (
      <div style={S.page}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#1a1d2e", marginBottom: 16 }}>История тренировок</div>
        <input style={{ ...S.input, marginBottom: 16 }} placeholder="Поиск по тренировкам..."
          value={historySearch} onChange={e => setHistorySearch(e.target.value)} />
        {filteredHistory.length === 0 && <div style={{ color: "#b0b5c8", textAlign: "center", padding: 40 }}>Нет записей</div>}
        {filteredHistory.sort((a, b) => new Date(b.date) - new Date(a.date)).map(w => (
          <div key={w.id} style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", cursor: "pointer" }}
              onClick={() => setExpanded(expanded === w.id ? null : w.id)}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{w.name}</div>
                <div style={{ color: "#8b90a7", fontSize: 11 }}>{formatDate(w.date)}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={S.badge("#8b90a7")}>{w.exercises.length} упр.</span>
                <span style={{ color: "#b0b5c8" }}>{expanded === w.id ? "▲" : "▼"}</span>
              </div>
            </div>
            {expanded === w.id && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f0f1f7" }}>
                {w.exercises.map((ex, i) => (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#4f7ef8", marginBottom: 4 }}>{ex.name}</div>
                    {ex.sets.map((set, j) => (
                      <div key={j} style={{ fontSize: 12, color: "#8b90a7", padding: "3px 0" }}>
                        #{j + 1} — {set.weight || "—"}кг × {set.reps || "—"} повт.
                      </div>
                    ))}
                  </div>
                ))}
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

  // ── EXERCISES ───────────────────────────────────────────────────────────────
  function Exercises() {
    function addExercise() {
      const trimmed = newExName.trim();
      if (!trimmed || allExercises.includes(trimmed)) return;
      save({ ...data, customExercises: [...data.customExercises, trimmed] });
      setNewExName("");
    }
    function deleteExercise(name) {
      save({ ...data, customExercises: data.customExercises.filter(e => e !== name) });
    }
    function renameExerciseItem(oldName, newName) {
      const trimmed = newName.trim();
      if (!trimmed || trimmed === oldName) { setEditingExItem(null); return; }
      save({ ...data, customExercises: data.customExercises.map(e => e === oldName ? trimmed : e) });
      setEditingExItem(null);
    }
    return (
      <div style={S.page}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#1a1d2e", marginBottom: 4 }}>Упражнения</div>
        <div style={{ fontSize: 12, color: "#8b90a7", marginBottom: 20 }}>{allExercises.length} упражнений</div>

        <div style={{ ...S.card, display: "flex", gap: 8, alignItems: "center" }}>
          <input style={{ ...S.input, flex: 1 }} placeholder="Название нового упражнения..."
            value={newExName} onChange={e => setNewExName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addExercise()} />
          <button style={{ ...S.btn, padding: "10px 16px", flexShrink: 0 }} onClick={addExercise}>+ Добавить</button>
        </div>

        <input style={{ ...S.input, marginBottom: 12 }} placeholder="Поиск..."
          value={exSearch} onChange={e => setExSearch(e.target.value)} />

        {data.customExercises.filter(e => e.toLowerCase().includes(exSearch.toLowerCase())).length > 0 ? (
          <div style={S.card}>
            {data.customExercises.filter(e => e.toLowerCase().includes(exSearch.toLowerCase())).map(name => (
              <div key={name} style={{ ...S.exRow, gap: 8 }}>
                {editingExItem === name ? (
                  <input style={{ ...S.input, flex: 1, padding: "4px 10px", fontSize: 13 }}
                    value={editingExItemValue} autoFocus
                    onChange={e => setEditingExItemValue(e.target.value)}
                    onBlur={() => renameExerciseItem(name, editingExItemValue)}
                    onKeyDown={e => { if (e.key === "Enter") renameExerciseItem(name, editingExItemValue); if (e.key === "Escape") setEditingExItem(null); }} />
                ) : (
                  <span style={{ flex: 1, fontSize: 13, color: "#1a1d2e" }}>{name}</span>
                )}
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {editingExItem === name
                    ? <button onClick={() => renameExerciseItem(name, editingExItemValue)} style={{ background: "none", border: "none", color: "#4caf50", cursor: "pointer", fontSize: 16 }}>✓</button>
                    : <button onClick={() => { setEditingExItem(name); setEditingExItemValue(name); }} style={{ background: "none", border: "none", color: "#b0b5c8", cursor: "pointer", fontSize: 14 }}>✎</button>}
                  <button onClick={() => deleteExercise(name)} style={{ background: "none", border: "none", color: "#f05252", cursor: "pointer", fontSize: 16 }}>×</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: "#b0b5c8", textAlign: "center", padding: 40, fontSize: 13 }}>
            Нет упражнений. Добавь своё выше.
          </div>
        )}

        <div style={{ marginTop: 8 }}>
          <span style={S.label}>Шаблоны тренировок</span>
          {["Грудь / Бицепс", "Спина / Трицепс", "Ноги / Плечи"].map(type => {
            const tplExercises = data.templates[type] || [];
            const isOpen = expandedTemplate === type;
            return (
              <div key={type} style={{ ...S.card, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                  onClick={() => setExpandedTemplate(isOpen ? null : type)}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#1a1d2e" }}>{type}</div>
                    {!isOpen && tplExercises.length > 0 && (
                      <div style={{ fontSize: 11, color: "#8b90a7", marginTop: 2 }}>{tplExercises.length} упражнений</div>
                    )}
                  </div>
                  <span style={{ color: "#b0b5c8", fontSize: 13 }}>{isOpen ? "▲" : "▼"}</span>
                </div>
                {isOpen && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #f0f1f7" }}>
                    {tplExercises.map((name, i) => (
                      <div key={i} style={S.exRow}>
                        <span style={{ fontSize: 13, color: "#1a1d2e" }}>{name}</span>
                        <button onClick={() => save({ ...data, templates: { ...data.templates, [type]: tplExercises.filter((_, j) => j !== i) } })}
                          style={{ background: "none", border: "none", color: "#f05252", cursor: "pointer", fontSize: 16 }}>×</button>
                      </div>
                    ))}
                    <select style={{ ...S.select, marginTop: tplExercises.length > 0 ? 8 : 0, fontSize: 12 }} value=""
                      onChange={e => {
                        if (!e.target.value || tplExercises.includes(e.target.value)) return;
                        save({ ...data, templates: { ...data.templates, [type]: [...tplExercises, e.target.value] } });
                      }}>
                      <option value="">+ Добавить упражнение...</option>
                      {data.customExercises.slice().sort().filter(e => !tplExercises.includes(e)).map(e => (
                        <option key={e} value={e}>{e}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── PROGRESS ─────────────────────────────────────────────────────────────────
  function Progress() {
    const exercisesWithData = allExercises.filter(e => data.workouts.some(w => w.exercises.some(ex => ex.name === e)));
    return (
      <div style={S.page}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#1a1d2e", marginBottom: 16 }}>Прогресс</div>
        <div style={{ marginBottom: 20 }}>
          <label style={S.label}>Упражнение</label>
          <select style={S.select} value={progressExercise} onChange={e => setProgressExercise(e.target.value)}>
            <option value="">— выбери упражнение —</option>
            {exercisesWithData.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        {progressExercise && progressData.length > 0 && (
          <>
            <div style={S.card}>
              <label style={S.label}>Максимальный вес (кг)</label>
              <MiniChart points={progressData.map(d => ({ x: d.date, y: d.maxWeight }))} color="#4f7ef8" />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                <span style={{ fontSize: 11, color: "#8b90a7" }}>Старт: {progressData[0].maxWeight}кг</span>
                <span style={{ fontSize: 11, color: "#4f7ef8", fontWeight: 700 }}>
                  Сейчас: {progressData[progressData.length - 1].maxWeight}кг
                  {progressData.length > 1 && (
                    <span style={{ marginLeft: 6 }}>
                      ({progressData[progressData.length - 1].maxWeight > progressData[0].maxWeight ? "+" : ""}
                      {(progressData[progressData.length - 1].maxWeight - progressData[0].maxWeight).toFixed(1)}кг)
                    </span>
                  )}
                </span>
              </div>
            </div>
            <div style={S.card}>
              <label style={S.label}>История по датам</label>
              {progressData.map((d, i) => (
                <div key={i} style={{ ...S.exRow, fontSize: 12 }}>
                  <span style={{ color: "#8b90a7" }}>{formatDate(d.date)}</span>
                  <span style={{ color: "#4f7ef8", fontWeight: 700 }}>{d.maxWeight}кг</span>
                </div>
              ))}
            </div>
          </>
        )}
        {progressExercise && progressData.length === 0 && <div style={{ color: "#b0b5c8", textAlign: "center", padding: 40 }}>Нет данных</div>}
        {!progressExercise && <div style={{ color: "#c0c4d6", textAlign: "center", padding: 40, fontSize: 13 }}>Выбери упражнение, чтобы увидеть динамику</div>}
      </div>
    );
  }

  // ── RECORDS ─────────────────────────────────────────────────────────────────
  function Records() {
    const recordList = Object.entries(records).sort((a, b) => b[1].maxWeight - a[1].maxWeight);
    return (
      <div style={S.page}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#1a1d2e", marginBottom: 16 }}>Личные рекорды</div>
        {recordList.length === 0 && <div style={{ color: "#b0b5c8", textAlign: "center", padding: 40 }}>Запиши тренировки, чтобы увидеть рекорды</div>}
        {recordList.map(([name, rec]) => (
          <div key={name} style={S.card}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: "#1a1d2e" }}>{name}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ ...S.statNum, fontSize: 22 }}>{rec.maxWeight}<span style={{ fontSize: 13, color: "#7b9ef8" }}>кг</span></div>
                <div style={S.statLabel}>Макс вес</div>
              </div>
              <div>
                <div style={{ ...S.statNum, fontSize: 22 }}>{rec.maxReps}</div>
                <div style={S.statLabel}>Повт. при макс весе</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div style={S.app}>
      <div style={S.header}>
        <div style={S.logo}>Iron Log</div>
        <div style={{ fontSize: 11, color: "#b0b5c8" }}>
          {new Date().toLocaleDateString("ru-RU", { weekday: "short" }).toUpperCase()}
        </div>
      </div>

      {view === "dashboard" && Dashboard()}
      {view === "log" && LogWorkout()}
      {view === "history" && History()}
      {view === "exercises" && Exercises()}
      {view === "progress" && Progress()}
      {view === "records" && Records()}

      <nav style={S.nav}>
        {["dashboard", "log", "history", "exercises", "progress", "records"].map(v => (
          <button key={v} style={S.navBtn(view === v)} onClick={() => setView(v)}>
            <span style={{ fontSize: 16 }}>{NavIcons[v]}</span>
            <span>{NavLabels[v]}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
