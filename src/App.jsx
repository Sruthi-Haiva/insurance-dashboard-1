import { useState, useEffect, useRef } from "react";
import { Chart, registerables } from "https://esm.sh/chart.js@4.4.1";
Chart.register(...registerables);
import haivaLogo from "./assets/haiva.png";

const API_URL      = "/api/records";
const CLASSIFY_URL = "/api/classify";

/* ── Responsive hook ── */
function useWindowWidth() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return w;
}

/* ── Sentiment category definitions ── */
const SENTIMENT_DEFS = {
  q3: {
    question: "How satisfied are you with the clarity of your policy documents?",
    categories: ["Very Satisfied", "Satisfied", "Neutral", "Not Satisfied"],
  },
  q4: {
    question: "Rate the speed at which your inquiries are resolved.",
    categories: ["Very Fast", "Fast", "Moderate", "Slow"],
  },
  q5: {
    question: "How fairly do you feel you were treated during your last interaction?",
    categories: ["Very Fair", "Fair", "Neutral", "Unfair"],
  },
};

/* ── Tooltip descriptions ── */
const DESCRIPTIONS = {
  totalResponses:    "Total number of customers who completed the call survey.",
  avgRecommendation: "Average score (0–10) for: 'How likely are you to recommend our insurance to family or friends?'",
  overallSat:        "Average of all four question scores combined.",
  resolution:        "Average score for: 'Rate the speed at which your inquiries are resolved.'",
  policyClarity:     "Average score for: 'How satisfied are you with the clarity of your policy documents?'",
  fairTreatment:     "Average score for: 'How fairly do you feel you were treated during your last interaction?'",
  q3: "How satisfied are you with the clarity of your policy documents?",
  q4: "Rate the speed at which your inquiries are resolved.",
  q5: "How fairly do you feel you were treated during your last interaction?",
  name:   "Customer's full name as captured during the call.",
  phone:  "Customer's phone number.",
  ins:    "Type of insurance policy the customer holds.",
  q1:     "Score given for: 'On a scale of 0–10, how likely are you to recommend our insurance to family or friends?'",
  q2:     "Area the customer suggested needs improvement.",
  q3col:  "Customer's response on policy document clarity.",
  q4col:  "Customer's response on inquiry resolution speed.",
  q5col:  "Customer's response on fairness of interaction.",
  ts:     "Date and time the survey call was recorded.",
};

/* ── Category colour palettes ── */
const CAT_COLORS = {
  "Very Satisfied": { bg: "#15803D", light: "#F0FDF4", text: "#15803D" },
  "Satisfied":      { bg: "#2563EB", light: "#EFF6FF", text: "#2563EB" },
  "Neutral":        { bg: "#6B7280", light: "#F3F4F6", text: "#6B7280" },
  "Not Satisfied":  { bg: "#C8102E", light: "#FDF2F3", text: "#C8102E" },
  "Very Fast":      { bg: "#15803D", light: "#F0FDF4", text: "#15803D" },
  "Fast":           { bg: "#16A34A", light: "#F0FDF4", text: "#16A34A" },
  "Moderate":       { bg: "#B45309", light: "#FFFBEB", text: "#B45309" },
  "Slow":           { bg: "#C8102E", light: "#FDF2F3", text: "#C8102E" },
  "Fair":           { bg: "#15803D", light: "#F0FDF4", text: "#15803D" },
  "Unfair":         { bg: "#C8102E", light: "#FDF2F3", text: "#C8102E" },
  "Very Fair": { bg: "#15803D", light: "#F0FDF4", text: "#15803D" },
};

/* ── helpers ── */
const avg = (a) => (a.length ? +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(1) : 0);
const pct = (n, t) => (t ? Math.round((n / t) * 100) : 0);
const TM = {
  "very satisfied": 9, "satisfied": 7, "neutral": 5, "unsatisfied": 3, "not satisfied at all": 1,
  "extremely fairly": 9, "very fairly": 9, "very fair": 9, "fairly": 7, "fair": 7, "unfair": 3, "very unfair": 1,
  "very fast": 9, "fast": 9, "moderate": 6, "low": 4, "slow": 3, "very slow": 1,
};
const toN = (v) => TM[(v || "").toLowerCase().trim()] ?? 5;

/* ── chart hook ── */
function useChart(ref, config) {
  const inst = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    if (inst.current) inst.current.destroy();
    inst.current = new Chart(ref.current, config);
    return () => inst.current?.destroy();
    // eslint-disable-next-line
  }, [JSON.stringify(config?.data)]);
}

/* ── classify via backend ── */
async function classifyBatch(answers, categories) {
  if (!answers.length) return Object.fromEntries(categories.map((c) => [c, 0]));
  const res = await fetch(CLASSIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers, categories }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Classify API ${res.status}: ${body.slice(0, 120)}`);
  }
  return res.json();
}

/* ── Info Icon ── */
function InfoIcon({ text }) {
  const [pos, setPos] = useState(null);
  const iconRef = useRef(null);
  const handleEnter = () => {
    if (iconRef.current) {
      const r = iconRef.current.getBoundingClientRect();
      setPos({ x: r.left + r.width / 2, y: r.top });
    }
  };
  return (
    <>
      <span ref={iconRef} style={{ display: "inline-flex", alignItems: "center", marginLeft: 4, cursor: "default", flexShrink: 0 }}
        onMouseEnter={handleEnter} onMouseLeave={() => setPos(null)}>
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none" style={{ verticalAlign: "middle", display: "block" }}>
          <circle cx="10" cy="10" r="9" stroke="#C4C9D4" strokeWidth="1.5" fill="#F3F4F6"/>
          <text x="10" y="14.5" textAnchor="middle" fontSize="11" fontWeight="700" fill="#6B7280" fontFamily="Inter,sans-serif">i</text>
        </svg>
      </span>
      {pos && (
        <div style={{
          position: "fixed", left: pos.x, top: pos.y - 8, transform: "translate(-50%, -100%)",
          background: "#1F2937", color: "#F9FAFB", fontSize: 11, lineHeight: 1.55,
          padding: "8px 11px", borderRadius: 7, whiteSpace: "normal", width: 210,
          boxShadow: "0 4px 14px rgba(0,0,0,0.2)", zIndex: 99999, pointerEvents: "none",
          textAlign: "left", fontWeight: 400, textTransform: "none", letterSpacing: 0,
        }}>
          {text}
          <div style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
            borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "5px solid #1F2937" }} />
        </div>
      )}
    </>
  );
}

/* ── KPI Card ── */
function KpiCard({ label, num, sub, accent, fill, descKey }) {
  return (
    <div style={S.kpi}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#6B7280" }}>{label}</div>
        <InfoIcon text={DESCRIPTIONS[descKey]} />
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color: accent ? "#C8102E" : "#111827", lineHeight: 1, marginBottom: 4 }}>{num}</div>
      <div style={{ fontSize: 12, color: "#9CA3AF" }}>{sub}</div>
      <div style={{ height: 2, background: "#E4E6EA", borderRadius: 2, marginTop: 10, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${fill}%`, background: "#C8102E", borderRadius: 2 }} />
      </div>
    </div>
  );
}

/* ── Score Box ── */
function ScoreBox({ n }) {
  const cls = n >= 9 ? { bg: "#F0FDF4", color: "#15803D" } : n >= 7 ? { bg: "#FFFBEB", color: "#B45309" } : { bg: "#FDF2F3", color: "#C8102E" };
  return (
    <span style={{ display: "inline-block", width: 26, height: 26, borderRadius: 5, textAlign: "center", lineHeight: "26px", fontSize: 12, fontWeight: 700, background: cls.bg, color: cls.color }}>{n}</span>
  );
}

/* ── Text Tag ── */
function TxtTag({ v }) {
  const s = (v || "").toLowerCase();
  let style = { fontSize: 11, padding: "2px 7px", borderRadius: 4, fontWeight: 500 };
  if (s.includes("very sat") || s.includes("very fair") || s.includes("extremely") || s.includes("fast"))
    style = { ...style, background: "#F0FDF4", color: "#15803D" };
  else if (s.includes("sat") || s.includes("fair") || s.includes("mod"))
    style = { ...style, background: "#F0F9FF", color: "#0369A1" };
  else if (s.includes("neut"))
    style = { ...style, background: "#F0F1F3", color: "#6B7280" };
  else
    style = { ...style, background: "#FDF2F3", color: "#C8102E" };
  return <span style={style}>{v}</span>;
}

/* ── Donut ── */
function NpsDonut({ prom, pass, det }) {
  const ref = useRef(null);
  useChart(ref, {
    type: "doughnut",
    data: {
      labels: ["Unlikely (0–6)", "Somewhat Likely (7–8)", "Very Likely (9–10)"],
      datasets: [{ data: [det, pass, prom], backgroundColor: ["#C8102E", "#B45309", "#15803D"], borderWidth: 3, borderColor: "#fff", hoverOffset: 4 }],
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: "72%", plugins: { legend: { display: false } } },
  });
  return <canvas ref={ref} />;
}

/* ── Histogram ── */
function Histogram({ data }) {
  const ref = useRef(null);
  const dist = Array.from({ length: 11 }, (_, i) => data.filter((d) => d === i).length);
  const colors = dist.map((_, i) => i <= 6 ? "rgba(200,16,46,0.55)" : i <= 8 ? "rgba(180,83,9,0.45)" : "rgba(21,128,61,0.55)");
  useChart(ref, {
    type: "bar",
    data: { labels: ["0","1","2","3","4","5","6","7","8","9","10"], datasets: [{ data: dist, backgroundColor: colors, borderRadius: 5, borderSkipped: false }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: (items) => `Score: ${items[0].label}`, label: (c) => ` ${c.raw} response${c.raw !== 1 ? "s" : ""}` } } },
      scales: {
        x: { grid: { display: false }, border: { color: "transparent" }, ticks: { color: "#9CA3AF", font: { size: 11 } } },
        y: { grid: { color: "#F3F4F6" }, border: { color: "transparent" }, ticks: { color: "#9CA3AF", font: { size: 11 }, stepSize: 1 } },
      },
    },
  });
  return <canvas ref={ref} />;
}

/* ── Sentiment Chart ── */
function SentimentChart({ counts, categories, total, loading, error }) {
  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9, paddingTop: 2 }}>
      {categories.map((_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 72, height: 9, borderRadius: 4, background: "#E4E6EA", animation: `pulse 1.4s ease-in-out ${i * 0.15}s infinite` }} />
          <div style={{ flex: 1, height: 9, borderRadius: 4, background: "#E4E6EA", animation: `pulse 1.4s ease-in-out ${i * 0.15}s infinite`, maxWidth: `${[85,65,50,35][i] || 40}%` }} />
          <div style={{ width: 24, height: 9, borderRadius: 4, background: "#E4E6EA", animation: `pulse 1.4s ease-in-out ${i * 0.15}s infinite` }} />
        </div>
      ))}
    </div>
  );
  if (error) return (
    <div style={{ fontSize: 11, color: "#C8102E", padding: "6px 0", lineHeight: 1.5 }}>
      ⚠ Sentiment unavailable<br />
      <span style={{ color: "#9CA3AF", fontSize: 10 }}>{error}</span>
    </div>
  );
  const tot = total || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {categories.map((cat) => {
        const count = counts?.[cat] ?? 0;
        const share = pct(count, tot);
        const col   = CAT_COLORS[cat] || { bg: "#6B7280", light: "#F3F4F6", text: "#6B7280" };
        return (
          <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: col.text, width: 76, flexShrink: 0, textAlign: "right", whiteSpace: "nowrap" }}>{cat}</span>
            <div style={{ flex: 1, height: 8, background: "#F0F1F3", borderRadius: 6, overflow: "hidden", minWidth: 0 }}>
              <div style={{ height: "100%", width: `${share}%`, background: col.bg, borderRadius: 6, transition: "width .6s ease" }} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: col.text, width: 28, textAlign: "right", flexShrink: 0 }}>{share}%</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Styles ── */
const S = {
  kpi:      { background: "#fff", border: "1px solid #E4E6EA", borderRadius: 10, padding: "16px 18px", minWidth: 0 },
  card:     { background: "#fff", border: "1px solid #E4E6EA", borderRadius: 10, padding: "18px 20px" },
  cardHd:   { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 6 },
  badge:    { fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 5, background: "#F0F1F3", color: "#6B7280", whiteSpace: "nowrap" },
  badgeRed: { fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 5, background: "#FDF2F3", color: "#C8102E", whiteSpace: "nowrap" },
  secHd:    { fontSize: "11.5px", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".7px", color: "#9CA3AF", marginBottom: 12 },
};

/* ══════════════════════════════════════════════
   MAIN APP
══════════════════════════════════════════════ */
export default function App() {
  const vw = useWindowWidth();
  const isMobile = vw < 640;
  const isTablet = vw >= 640 && vw < 1024;

  const [records, setRecords]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [filter, setFilter]         = useState("all");
  const [now, setNow]               = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);

  const [sentiment,   setSentiment]   = useState({ q3: null,  q4: null,  q5: null  });
  const [sentLoading, setSentLoading] = useState({ q3: false, q4: false, q5: false });
  const [sentError,   setSentError]   = useState({ q3: null,  q4: null,  q5: null  });

  const fetchData = (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    fetch(API_URL)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => {
        let rows = [];
        if (Array.isArray(data?.records))         rows = data.records;
        else if (Array.isArray(data?.data?.rows)) rows = data.data.rows;
        else if (data?.fields && Array.isArray(data?.rows)) {
          const cols = data.fields.map((f) => f.label || f.column_name || f.name);
          rows = data.rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
        } else if (Array.isArray(data)) rows = data;
        else { setError("Unexpected API format"); setLoading(false); setRefreshing(false); return; }
        setRecords(rows);
        setNow(new Date());
        setLoading(false);
        setRefreshing(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); setRefreshing(false); });
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if (!records.length) return;
    const fk = (row, ...kws) => {
      for (const kw of kws) {
        const k = Object.keys(row).find((c) => c.toLowerCase().includes(kw.toLowerCase()));
        if (k && row[k] !== undefined && row[k] !== "") return String(row[k]);
      }
      return "";
    };
    const mapped = records.map((r) => ({
      q3: fk(r, "clarity of your policy", "policy document", "clarity"),
      q4: fk(r, "speed at which", "inquir", "speed"),
      q5: fk(r, "fairly do you", "treated", "fairly"),
    }));
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    const runSentiment = async (qk, delayMs) => {
      const answers = mapped.map((r) => r[qk]).filter(Boolean);
      if (!answers.length) return;
      await sleep(delayMs);
      setSentLoading((p) => ({ ...p, [qk]: true  }));
      setSentError  ((p) => ({ ...p, [qk]: null  }));
      try {
        const counts = await classifyBatch(answers, SENTIMENT_DEFS[qk].categories);
        setSentiment  ((p) => ({ ...p, [qk]: counts }));
      } catch (e) {
        setSentError  ((p) => ({ ...p, [qk]: e.message }));
      } finally {
        setSentLoading((p) => ({ ...p, [qk]: false }));
      }
    };
    runSentiment("q3", 0);
    runSentiment("q4", 1500);
    runSentiment("q5", 3000);
  }, [records]);

  const findCol = (row, ...keywords) => {
    const colKeys = Object.keys(row);
    for (const kw of keywords) {
      const found = colKeys.find((c) => c.toLowerCase().includes(kw.toLowerCase()));
      if (found && row[found] !== undefined && row[found] !== "") return row[found];
    }
    return "";
  };

  const rows = records.map((r) => ({
    raw:   r,
    name:  findCol(r, "name"),
    phone: findCol(r, "phone", "mobile"),
    ins:   findCol(r, "purchased"),
    q1:    Number(findCol(r, "recommend", "likely", "scale of 0")) || 0,
    q2:    findCol(r, "aspect", "improve"),
    q3:    findCol(r, "clarity", "policy document"),
    q4:    findCol(r, "speed", "inquir"),
    q5:    findCol(r, "fairly", "treated"),
    ts:    findCol(r, "timestamp"),
  }));

  const filtered = rows.filter((r) => {
    if (filter === "all")  return true;
    if (filter === "prom") return r.q1 >= 9;
    if (filter === "det")  return r.q1 <= 6;
    return r.ins === filter;
  });

  const q1vals = rows.map((r) => r.q1).filter(Boolean);
  const q3vals = rows.map((r) => toN(r.q3));
  const q4vals = rows.map((r) => toN(r.q4));
  const q5vals = rows.map((r) => toN(r.q5));
  const ov     = +((avg(q1vals) + avg(q3vals) + avg(q4vals) + avg(q5vals)) / 4).toFixed(1);

  const t    = rows.length || 1;
  const prom = rows.filter((r) => r.q1 >= 9).length;
  const pass = rows.filter((r) => r.q1 >= 7 && r.q1 <= 8).length;
  const det  = rows.filter((r) => r.q1 <= 6).length;
  const npsScore = Math.round(((prom - det) / t) * 100);

  const cnt = {};
  rows.forEach((r) => { const k = (r.q2 || "").trim(); if (k) cnt[k] = (cnt[k] || 0) + 1; });
  const impAreas = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
  const impTotal = impAreas.reduce((s, [, c]) => s + c, 0) || 1;

  const insTypes = [...new Set(rows.map((r) => r.ins).filter(Boolean))];

  /* ── responsive values ── */
  const pagePad   = isMobile ? "12px 12px 48px" : isTablet ? "18px 18px 48px" : "22px 28px 48px";
  const kpiCols   = isMobile ? "repeat(2, minmax(0,1fr))" : "repeat(3, minmax(0,1fr))";
  const npsCols   = isMobile || isTablet ? "1fr" : "minmax(0,1.35fr) minmax(0,1fr)";
  const satCols   = isMobile ? "1fr" : isTablet ? "repeat(2, minmax(0,1fr))" : "repeat(3, minmax(0,1fr))";
  const impCols   = isMobile ? "1fr" : "minmax(0,1fr) minmax(0,1fr)";
  const donutSize = isMobile ? 120 : 150;

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5F6F8", fontFamily: "Inter,sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 40, height: 40, border: "3px solid #E4E6EA", borderTopColor: "#C8102E", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto" }} />
        <p style={{ color: "#9CA3AF", marginTop: 16, fontSize: 13 }}>Loading dashboard…</p>
      </div>
      <style>{css}</style>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5F6F8", fontFamily: "Inter,sans-serif" }}>
      <div style={{ background: "#fff", border: "1px solid #E4E6EA", borderRadius: 12, padding: "32px 24px", maxWidth: 480, margin: "0 16px" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <h3 style={{ color: "#C8102E", marginBottom: 8 }}>Failed to load</h3>
        <p style={{ color: "#6B7280", fontSize: 13 }}>{error}</p>
        <p style={{ color: "#9CA3AF", fontSize: 12, marginTop: 12 }}>Make sure FastAPI is running on <code>localhost:8000</code></p>
      </div>
      <style>{css}</style>
    </div>
  );

  const COLS = [
    { key: "name",  label: "Name",          desc: DESCRIPTIONS.name,   find: (r) => r.name  },
    { key: "phone", label: "Phone",          desc: DESCRIPTIONS.phone,  find: (r) => r.phone },
    { key: "ins",   label: "Insurance",      desc: DESCRIPTIONS.ins,    find: (r) => r.ins   },
    { key: "q1",    label: <><span>Rec.</span><br/><span>Score</span></>,
                    desc: DESCRIPTIONS.q1,   find: (r) => r.q1 },
    { key: "q2",    label: "Improve",        desc: DESCRIPTIONS.q2,     find: (r) => r.q2    },
    { key: "q3",    label: "Clarity",        desc: DESCRIPTIONS.q3col,  find: (r) => r.q3    },
    { key: "q4",    label: "Resolution",     desc: DESCRIPTIONS.q4col,  find: (r) => r.q4    },
    { key: "q5",    label: "Fairness",       desc: DESCRIPTIONS.q5col,  find: (r) => r.q5    },
    { key: "ts",    label: "Time",           desc: DESCRIPTIONS.ts,     find: (r) => r.ts    },
  ];

  const satCards = [
    { qk: "q3", title: "Policy Document Clarity", vals: rows.map((r) => r.q3) },
    { qk: "q4", title: "Inquiry Resolution Speed", vals: rows.map((r) => r.q4) },
    { qk: "q5", title: "Fairness of Interaction",  vals: rows.map((r) => r.q5) },
  ];

  return (
    <div style={{ fontFamily: "Inter,sans-serif", background: "#F5F6F8", color: "#111827", fontSize: 14 }}>
      <style>{css}</style>

      {/* ── NAV ── */}
      <nav style={{
        background: "#fff", borderBottom: "1px solid #E4E6EA",
        display: "flex", flexWrap: "wrap", alignItems: "center",
        padding: isMobile ? "10px 12px" : "0 28px",
        minHeight: 58, gap: isMobile ? 8 : 16,
        position: "sticky", top: 0, zIndex: 50,
        boxSizing: "border-box", width: "100%",
      }}>
        {/* Brand */}
        <span style={{ fontSize: "13.5px", fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>Chola MS</span>

        {!isMobile && <div style={{ width: 1, height: 20, background: "#E4E6EA", flexShrink: 0 }} />}

        {/* Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
          <button style={{ padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, color: "#fff", background: "#C8102E", border: "none", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
            Survey Dashboard
          </button>
          <button onClick={() => fetchData(true)} disabled={refreshing}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: refreshing ? "not-allowed" : "pointer", border: "1px solid #E4E6EA", background: "#fff", color: refreshing ? "#9CA3AF" : "#374151", fontFamily: "Inter,sans-serif", transition: "all .2s", whiteSpace: "nowrap" }}>
            <span style={{ display: "inline-block", animation: refreshing ? "spin .7s linear infinite" : "none" }}>↺</span>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          {!isMobile && (
            <span style={{ fontSize: 11.5, color: "#9CA3AF", whiteSpace: "nowrap" }}>
              Last updated {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>

        {/* Right: Haiva branding */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: isMobile ? 8 : 14, flexShrink: 0 }}>
          {!isMobile && <>
            <span style={{ fontSize: 12, color: "#9CA3AF", whiteSpace: "nowrap" }}>
              {now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            </span>
            <div style={{ width: 1, height: 20, background: "#E4E6EA" }} />
          </>}
          <img src={haivaLogo} alt="Haiva" style={{ width: 40, height: 30, objectFit: "contain", borderRadius: 6 }} />
          {!isMobile && <div style={{ fontSize: "13px", fontWeight: 700, color: "#111827" }}>Haiva</div>}
        </div>

        {/* Mobile: last updated row */}
        {isMobile && (
          <div style={{ width: "100%", fontSize: 11, color: "#9CA3AF", paddingBottom: 4 }}>
            Last updated {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            &nbsp;·&nbsp;
            {now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
          </div>
        )}
      </nav>

      <div style={{ width: "100%", maxWidth: "100vw", padding: pagePad, boxSizing: "border-box" }}>

        {/* PAGE HEAD */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: isMobile ? 15 : 17, fontWeight: 700, margin: 0 }}>Customer Experience Dashboard</h1>
          <p style={{ fontSize: "12.5px", color: "#9CA3AF", marginTop: 3, marginBottom: 0 }}>
            Call Survey Analytics &nbsp;·&nbsp; {rows.length} responses collected
          </p>
        </div>

        {/* 1. KPIs */}
        <div style={{ marginBottom: 24 }}>
          <div style={S.secHd}>Overall Summary</div>
          <div style={{ display: "grid", gridTemplateColumns: kpiCols, gap: 10, marginBottom: 10 }}>
            <KpiCard label="Total Responses"      descKey="totalResponses"    num={rows.length}  sub="Surveys completed"  accent fill={100} />
            <KpiCard label="Avg Recommendation"   descKey="avgRecommendation" num={avg(q1vals)}  sub="Score out of 10"    accent fill={avg(q1vals) * 10} />
            {!isMobile && <KpiCard label="Overall Satisfaction" descKey="overallSat" num={ov} sub="All questions avg" fill={ov * 10} />}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: kpiCols, gap: 10 }}>
            <KpiCard label="Resolution Rating" descKey="resolution"    num={avg(q4vals)} sub="Speed score /10"    fill={avg(q4vals) * 10} />
            <KpiCard label="Policy Clarity"    descKey="policyClarity" num={avg(q3vals)} sub="Clarity score /10"  fill={avg(q3vals) * 10} />
            {!isMobile
              ? <KpiCard label="Fair Treatment"       descKey="fairTreatment" num={avg(q5vals)} sub="Fairness score /10"  fill={avg(q5vals) * 10} />
              : <KpiCard label="Overall Satisfaction" descKey="overallSat"    num={ov}          sub="All questions avg"   fill={ov * 10} />
            }
          </div>
          {isMobile && (
            <div style={{ marginTop: 10 }}>
              <KpiCard label="Fair Treatment" descKey="fairTreatment" num={avg(q5vals)} sub="Fairness score /10" fill={avg(q5vals) * 10} />
            </div>
          )}
        </div>

        {/* 2. Recommendation Score */}
        <div style={{ marginBottom: 24 }}>
          <div style={S.secHd}>Recommendation Score Analysis</div>
          <div style={{ display: "grid", gridTemplateColumns: npsCols, gap: 14 }}>

            {/* Donut card */}
            <div style={S.card}>
              <div style={S.cardHd}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <h3 style={{ fontSize: "13.5px", fontWeight: 600, margin: 0 }}>Recommendation Score Breakdown</h3>
                  <InfoIcon text="Customers grouped by how likely they are to recommend: Very Likely (9–10), Somewhat Likely (7–8), and Unlikely (0–6)." />
                </div>
                <span style={S.badgeRed}>Score: {npsScore >= 0 ? "+" : ""}{npsScore}</span>
              </div>
              <div style={{ display: "flex", gap: isMobile ? 14 : 20, alignItems: "center", flexWrap: isMobile ? "wrap" : "nowrap" }}>
                <div style={{ position: "relative", width: donutSize, height: donutSize, flexShrink: 0, margin: isMobile ? "0 auto" : 0 }}>
                  <NpsDonut prom={prom} pass={pass} det={det} />
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                    <div style={{ fontSize: isMobile ? 24 : 30, fontWeight: 700 }}>{npsScore >= 0 ? "+" : ""}{npsScore}</div>
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0, width: isMobile ? "100%" : "auto" }}>
                  {[{ color: "#15803D", label: "Very Likely",     desc: "Would recommend us",    range: "(9–10)", n: prom },
                    { color: "#B45309", label: "Somewhat Likely", desc: "Satisfied but passive",  range: "(7–8)",  n: pass },
                    { color: "#C8102E", label: "Unlikely",        desc: "Had a poor experience",  range: "(0–6)",  n: det  }].map((row) => (
                    <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 0", borderBottom: "1px solid #F0F1F3" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: row.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "12.5px", color: "#374151" }}>{row.label} <span style={{ color: "#9CA3AF", fontSize: 11 }}>{row.range}</span></div>
                        <div style={{ fontSize: 10, color: "#9CA3AF" }}>{row.desc}</div>
                      </div>
                      <span style={{ fontSize: 16, fontWeight: 700, minWidth: 28, textAlign: "right" }}>{row.n}</span>
                      <span style={{ fontSize: "11.5px", color: "#9CA3AF", minWidth: 34, textAlign: "right" }}>{pct(row.n, t)}%</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", height: 5, borderRadius: 5, overflow: "hidden", gap: 2, marginTop: 12 }}>
                    <div style={{ width: `${pct(det,  t)}%`, background: "#C8102E", opacity: 0.7 }} />
                    <div style={{ width: `${pct(pass, t)}%`, background: "#B45309", opacity: 0.5 }} />
                    <div style={{ width: `${pct(prom, t)}%`, background: "#15803D", opacity: 0.7 }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Histogram card */}
            <div style={S.card}>
              <div style={S.cardHd}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <h3 style={{ fontSize: "13.5px", fontWeight: 600, margin: 0 }}>Score Distribution</h3>
                  <InfoIcon text="Distribution of individual scores (0–10) given for the recommendation likelihood question across all respondents." />
                </div>
                <span style={S.badge}>Recommendation 0–10</span>
              </div>
              <div style={{ position: "relative", height: isMobile ? 160 : 210 }}>
                <Histogram data={q1vals} />
              </div>
            </div>
          </div>
        </div>

        {/* 3. SATISFACTION BY TOPIC */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ ...S.secHd, marginBottom: 0 }}>Satisfaction</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: satCols, gap: 14 }}>
            {satCards.map(({ qk, title, vals }) => {
              const score      = avg(vals.map(toN));
              const scoreColor = score >= 7 ? "#15803D" : score >= 5 ? "#B45309" : "#C8102E";
              const def        = SENTIMENT_DEFS[qk];
              const isLoading  = sentLoading[qk];
              const err        = sentError[qk];
              const counts     = sentiment[qk];
              return (
                <div key={qk} style={S.card}>
                  <div style={S.cardHd}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <h3 style={{ fontSize: "13.5px", fontWeight: 600, margin: 0 }}>{title}</h3>
                      <InfoIcon text={DESCRIPTIONS[qk]} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {isLoading && (
                        <span style={{ fontSize: 10, color: "#2563EB", display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <span style={{ display: "inline-block", width: 10, height: 10, border: "1.5px solid #BFDBFE", borderTopColor: "#2563EB", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
                          Analysing…
                        </span>
                      )}
                      <span style={{ ...S.badge, color: scoreColor, background: score >= 7 ? "#F0FDF4" : score >= 5 ? "#FFFBEB" : "#FDF2F3" }}>
                        Avg {score} / 10
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 14, alignItems: "flex-start", minWidth: 0 }}>
                    <div style={{ flexShrink: 0, textAlign: "center", background: score >= 7 ? "#F0FDF4" : score >= 5 ? "#FFFBEB" : "#FDF2F3", borderRadius: 12, padding: "12px 10px", minWidth: 58 }}>
                      <div style={{ fontSize: 26, fontWeight: 700, color: scoreColor, lineHeight: 1 }}>{score}</div>
                      <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>/ 10</div>
                      <div style={{ marginTop: 5, fontSize: 10, fontWeight: 600, color: scoreColor }}>
                        {score >= 7 ? "✓ Good" : score >= 5 ? "~ Avg" : "✗ Low"}
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                      <SentimentChart counts={counts} categories={def.categories} total={vals.filter(Boolean).length} loading={isLoading} error={err} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 4. IMPROVEMENT AREAS */}
        <div style={{ marginBottom: 24 }}>
          <div style={S.secHd}>Improvement Areas</div>
          <div style={S.card}>
            <div style={S.cardHd}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <h3 style={{ fontSize: "13.5px", fontWeight: 600, margin: 0 }}>Improvement Area Analysis</h3>
                <InfoIcon text="Areas customers said need improvement, based on their open-ended responses. Shows how frequently each area was mentioned." />
              </div>
            </div>
            {impAreas.length === 0
              ? <p style={{ color: "#9CA3AF", fontSize: 13 }}>No data</p>
              : (
                <div style={{ display: "grid", gridTemplateColumns: impCols, gap: "4px 32px" }}>
                  {impAreas.map(([label, count]) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #F0F1F3", minWidth: 0 }}>
                      <span style={{ fontSize: "12.5px", color: "#374151", minWidth: 0, flex: "0 0 130px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                      <div style={{ flex: 1, height: 6, background: "#F0F1F3", borderRadius: 6, overflow: "hidden", minWidth: 0 }}>
                        <div style={{ height: "100%", width: `${pct(count, impTotal)}%`, background: "#C8102E", opacity: 0.75, borderRadius: 6 }} />
                      </div>
                      <span style={{ fontSize: "12.5px", fontWeight: 600, width: 36, textAlign: "right", flexShrink: 0 }}>{pct(count, impTotal)}%</span>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>

        {/* 5. RAW TABLE */}
        <div style={{ marginBottom: 24 }}>
          <div style={S.secHd}>All Feedback Records</div>
          <div style={S.card}>
            <div style={S.cardHd}>
              <h3 style={{ fontSize: "13.5px", fontWeight: 600, margin: 0 }}>Call Survey Responses</h3>
              <span style={S.badge}>{filtered.length} records</span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 500 }}>Filter:</span>
              {[{ key: "all", label: "All" },
                { key: "prom", label: isMobile ? "Very Likely" : "Very Likely (9–10)" },
                { key: "det",  label: isMobile ? "Unlikely"    : "Unlikely (0–6)" },
                ...insTypes.map((ins) => ({ key: ins, label: ins.replace(" Insurance", "") }))
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setFilter(key)}
                  style={{ padding: "4px 11px", borderRadius: 5, fontSize: 12, fontWeight: filter === key ? 600 : 500, cursor: "pointer", border: "1px solid", borderColor: filter === key ? "#C8102E" : "#E4E6EA", background: filter === key ? "#C8102E" : "#fff", color: filter === key ? "#fff" : "#6B7280", fontFamily: "Inter,sans-serif" }}>
                  {label}
                </button>
              ))}
            </div>
            {/* Horizontally scrollable table on small screens */}
            <div style={{ width: "100%", overflowX: "auto", overflowY: "auto", maxHeight: 340, WebkitOverflowScrolling: "touch" }}>
              <table style={{ borderCollapse: "collapse", fontSize: "12.5px", tableLayout: "auto", minWidth: 640 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: 32 }}>#</th>
                    {COLS.map((col) => (
                      <th key={col.key} style={thStyle}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                          {col.label}
                          <InfoIcon text={col.desc} />
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => (
                    <tr key={i} onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFAFA")} onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                      <td style={tdStyle}><span style={{ color: "#9CA3AF", fontSize: 11 }}>{i + 1}</span></td>
                      {COLS.map((col) => {
                        const val    = col.find(row);
                        const isNps  = col.key === "q1";
                        const isText = ["q3", "q4", "q5"].includes(col.key);
                        return (
                          <td key={col.key} style={{ ...tdStyle, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {isNps && !isNaN(Number(val)) && Number(val) > 0
                              ? <ScoreBox n={Number(val)} />
                              : isText
                              ? <TxtTag v={String(val ?? "")} />
                              : val === null || val === undefined || val === ""
                              ? <span style={{ color: "#D1D5DB" }}>—</span>
                              : String(val)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

const css = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body, #root { margin: 0; padding: 0; width: 100%; min-height: 100vh; }
  body { overflow-x: hidden; }
  @keyframes spin  { to { transform: rotate(360deg) } }
  @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
`;

const thStyle = {
  textAlign: "left", padding: "8px 10px", fontSize: 11, textTransform: "uppercase",
  letterSpacing: ".6px", color: "#9CA3AF", fontWeight: 600, background: "#F0F1F3",
  borderBottom: "1px solid #E4E6EA", position: "sticky", top: 0, whiteSpace: "nowrap",
};
const tdStyle = {
  padding: "9px 10px", borderBottom: "1px solid #F0F1F3", color: "#374151", verticalAlign: "middle",
};