import { useState, useRef, useEffect } from "react";

const API = "https://careerpilot-api-v1i2.onrender.com";

function saveHistory(entry) {
  const prev = JSON.parse(localStorage.getItem("cp_history") || "[]");
  prev.unshift({ ...entry, id: Date.now(), date: new Date().toLocaleDateString() });
  localStorage.setItem("cp_history", JSON.stringify(prev.slice(0, 20)));
}
function getHistory() {
  return JSON.parse(localStorage.getItem("cp_history") || "[]");
}

/* ── Design tokens ── */
const C = {
  bg: "#F5F7FB",
  white: "#FFFFFF",
  blue: "#273C90",
  blue2: "#3E63DD",
  text: "#1E293B",
  text2: "#64748B",
  border: "#E5E7EB",
  success: "#16A34A",
  warning: "#F59E0B",
  error: "#DC2626",
  activeNav: "#EEF2FF",
};

const shadow = "0 4px 18px rgba(18,38,63,0.06)";
const card = { background: C.white, borderRadius: 14, boxShadow: shadow, border: `1px solid ${C.border}` };

/* ── Spinner ── */
function Spinner({ size = 15, color = C.white }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" style={{ animation: "spin .8s linear infinite", flexShrink: 0 }}>
      <circle cx="10" cy="10" r="8" fill="none" stroke={color} strokeWidth="2.5" strokeDasharray="30" strokeDashoffset="10" strokeLinecap="round" />
    </svg>
  );
}

/* ── Score gauge (thin radial, Resume Worded style) ── */
function ScoreGauge({ score }) {
  const r = 44, circ = 2 * Math.PI * r;
  const color = score >= 75 ? C.success : score >= 50 ? C.warning : C.error;
  const label = score >= 75 ? "Strong match" : score >= 50 ? "Partial match" : "Weak match";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width="110" height="110" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r={r} fill="none" stroke="#F1F5F9" strokeWidth="7" />
        <circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={circ}
          strokeDashoffset={circ - (circ * score) / 100}
          strokeLinecap="round"
          transform="rotate(-90 55 55)"
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
        <text x="55" y="50" textAnchor="middle" fill={C.text} fontSize="26" fontWeight="700" fontFamily="Inter, sans-serif">{score}</text>
        <text x="55" y="66" textAnchor="middle" fill={C.text2} fontSize="10" fontFamily="Inter, sans-serif">out of 100</text>
      </svg>
      <span style={{ fontSize: 12, color, fontWeight: 600 }}>{label}</span>
    </div>
  );
}

/* ── Thin progress bar ── */
function ProgressBar({ label, value }) {
  const pct = Math.round(value);
  const color = pct >= 75 ? C.success : pct >= 50 ? C.warning : C.error;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: C.text2, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{pct}</span>
      </div>
      <div style={{ height: 4, background: "#F1F5F9", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 99, transition: "width .9s ease" }} />
      </div>
    </div>
  );
}

/* ── Skill chip ── */
function Chip({ label, kind }) {
  const styles = {
    matched: { bg: "#F0FDF4", text: "#15803D", border: "#BBF7D0" },
    missing: { bg: "#FEF2F2", text: "#B91C1C", border: "#FECACA" },
    neutral: { bg: "#F8FAFC", text: C.text2, border: C.border },
  };
  const s = styles[kind] || styles.neutral;
  return (
    <span style={{
      display: "inline-block", padding: "3px 9px", borderRadius: 6,
      fontSize: 11, fontWeight: 500, color: s.text,
      background: s.bg, border: `1px solid ${s.border}`,
      margin: "2px 3px 2px 0",
    }}>{label}</span>
  );
}

/* ── Section label ── */
function SectionLabel({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: C.text2, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>{children}</div>;
}

/* ── Copy button ── */
function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{ padding: "4px 12px", fontSize: 12, fontWeight: 500, border: `1px solid ${C.border}`, borderRadius: 6, background: C.white, color: C.text2, cursor: "pointer", fontFamily: "Inter, sans-serif", transition: "background .15s" }}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/* ── Resume preview with skill highlights ── */
function ResumeDoc({ text, matchedSkills, missingSkills }) {
  if (!text) return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: C.text2, fontSize: 13 }}>
      <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke={C.border} strokeWidth="1.5" style={{ marginBottom: 10, display: "block", margin: "0 auto 10px" }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      Resume preview appears after analysis
    </div>
  );

  const skills = [
    ...matchedSkills.map(s => ({ s, type: "matched" })),
    ...missingSkills.map(s => ({ s, type: "missing" })),
  ].sort((a, b) => b.s.length - a.s.length);

  const highlight = (raw) => {
    let segs = [{ text: raw, type: null }];
    for (const { s, type } of skills) {
      const next = [];
      for (const seg of segs) {
        if (seg.type !== null) { next.push(seg); continue; }
        const re = new RegExp(`(${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
        const parts = seg.text.split(re); re.lastIndex = 0;
        for (const p of parts) { re.lastIndex = 0; next.push({ text: p, type: re.test(p) ? type : null }); re.lastIndex = 0; }
      }
      segs = next;
    }
    return segs;
  };

  const renderSegs = (segs) => segs.map((seg, i) => {
    if (!seg.type) return <span key={i}>{seg.text}</span>;
    if (seg.type === "matched") return <mark key={i} style={{ background: "#DCFCE7", color: "#15803D", borderRadius: 2, padding: "0 2px", fontWeight: 600 }}>{seg.text}</mark>;
    return <mark key={i} style={{ background: "#FEE2E2", color: "#B91C1C", borderRadius: 2, padding: "0 2px", textDecoration: "underline dotted #B91C1C", fontWeight: 600 }}>{seg.text}</mark>;
  });

  return (
    <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.7, color: C.text }}>
      {text.split("\n").map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} style={{ height: 7 }} />;
        const isHeader = /^[A-Z][A-Z\s&\/\-]{2,}$/.test(t);
        const isBullet = t.startsWith("-") || t.startsWith("•");
        const segs = highlight(line);
        if (isHeader) return (
          <div key={i} style={{ marginTop: 18, marginBottom: 4, paddingBottom: 4, borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.text2, textTransform: "uppercase", letterSpacing: "0.08em" }}>{renderSegs(segs)}</span>
          </div>
        );
        if (isBullet) return (
          <div key={i} style={{ display: "flex", gap: 8, paddingLeft: 4, marginBottom: 1 }}>
            <span style={{ color: C.text2, flexShrink: 0 }}>·</span>
            <span>{renderSegs(segs)}</span>
          </div>
        );
        return <div key={i} style={{ marginBottom: 1 }}>{renderSegs(segs)}</div>;
      })}
    </div>
  );
}

/* ── AI explanation renderer ── */
function AIExplanation({ text }) {
  if (!text) return null;
  const sections = [];
  let cur = null;
  text.split("\n").forEach(l => {
    if (l.startsWith("## ")) { if (cur) sections.push(cur); cur = { heading: l.replace("## ", "").trim(), lines: [] }; }
    else if (cur) cur.lines.push(l);
  });
  if (cur) sections.push(cur);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {sections.map((s, i) => (
        <div key={i}>
          <SectionLabel>{s.heading}</SectionLabel>
          {s.lines.map((l, j) => {
            const clean = l.replace(/\*\*/g, "").trim();
            if (!clean) return null;
            if (clean.startsWith("- ")) return (
              <div key={j} style={{ display: "flex", gap: 8, fontSize: 13, color: C.text, lineHeight: 1.65, marginBottom: 5 }}>
                <span style={{ color: C.text2, flexShrink: 0, marginTop: 1 }}>•</span><span>{clean.slice(2)}</span>
              </div>
            );
            return <p key={j} style={{ fontSize: 13, color: C.text2, lineHeight: 1.7, margin: "0 0 4px" }}>{clean}</p>;
          })}
        </div>
      ))}
    </div>
  );
}

/* ── Sidebar nav item ── */
function NavItem({ icon, label, active, onClick, badge }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 12px 8px 14px", width: "100%", border: "none", cursor: "pointer",
      background: active ? C.activeNav : "transparent",
      borderLeft: active ? `3px solid ${C.blue}` : "3px solid transparent",
      borderRadius: active ? "0 8px 8px 0" : "0 8px 8px 0",
      color: active ? C.blue : C.text2,
      fontFamily: "Inter, sans-serif", fontSize: 13,
      fontWeight: active ? 600 : 400,
      transition: "all .15s", textAlign: "left",
    }}>
      <span style={{ fontSize: 15, lineHeight: 1 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge && <span style={{ fontSize: 10, background: C.blue2, color: "#fff", padding: "1px 7px", borderRadius: 99, fontWeight: 600 }}>{badge}</span>}
    </button>
  );
}

/* ══════════════════════════════════════════════════════
   MAIN APP
══════════════════════════════════════════════════════ */
export default function App() {
  const [tab, setTab] = useState("analyze");
  const [rightPanel, setRightPanel] = useState("resume");
  const [file, setFile] = useState(null);
  const [job, setJob] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const [explanation, setExplanation] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [score, setScore] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [matchedSkills, setMatchedSkills] = useState([]);
  const [missingSkills, setMissingSkills] = useState([]);
  const [sectionsFound, setSectionsFound] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [coverLetter, setCoverLetter] = useState("");
  const [clLoading, setClLoading] = useState(false);
  const [clError, setClError] = useState("");

  const [editorText, setEditorText] = useState("");
  const [rewriting, setRewriting] = useState(false);
  const [rwError, setRwError] = useState("");

  const [history, setHistory] = useState(getHistory());
  const [exporting, setExporting] = useState(false);

  const hasResult = !!explanation;

  useEffect(() => { if (resumeText) setEditorText(resumeText); }, [resumeText]);

  const handleFile = f => {
    if (f?.type === "application/pdf") { setFile(f); setError(""); }
    else setError("Please upload a PDF file.");
  };

  const analyze = async () => {
    if (!file) return setError("Upload a resume PDF.");
    if (!job.trim()) return setError("Paste a job description.");
    setError(""); setExplanation(""); setCoverLetter(""); setScore(null); setBreakdown(null);
    setMatchedSkills([]); setMissingSkills([]); setSectionsFound([]);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("resume", file);
      fd.append("job", job);
      const res = await fetch(`${API}/upload-resume-v2`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || data.error) return setError(data.error || data.detail || "Analysis failed.");
      setExplanation(data.explanation);
      setResumeText(data.resume_text || "");
      setScore(data.score);
      setBreakdown(data.score_breakdown || null);
      setMatchedSkills(data.matched_skills || []);
      setMissingSkills(data.missing_skills || []);
      setSectionsFound(data.resume_sections_found || []);
      saveHistory({ score: data.score, job: job.slice(0, 80), explanation: data.explanation, resume_text: data.resume_text, breakdown: data.score_breakdown, matched_skills: data.matched_skills, missing_skills: data.missing_skills });
      setHistory(getHistory());
      setRightPanel("resume");
    } catch { setError("Could not reach the server."); }
    finally { setLoading(false); }
  };

  const generateCL = async () => {
    if (!resumeText || !job) return setClError("Run analysis first.");
    setClError(""); setClLoading(true);
    try {
      const res = await fetch(`${API}/cover-letter`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resume_text: resumeText, job }) });
      const data = await res.json();
      if (!res.ok || data.error) return setClError(data.error || "Failed.");
      setCoverLetter(data.cover_letter);
    } catch { setClError("Could not reach the server."); }
    finally { setClLoading(false); }
  };

  const rewrite = async () => {
    if (!editorText || !job) return setRwError("Run analysis first.");
    setRwError(""); setRewriting(true);
    try {
      const res = await fetch(`${API}/rewrite-resume`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resume_text: editorText, job }) });
      const data = await res.json();
      if (!res.ok || data.error) return setRwError(data.error || "Failed.");
      setEditorText(data.rewritten);
    } catch { setRwError("Could not reach the server."); }
    finally { setRewriting(false); }
  };

  const exportPDF = async () => {
    setExporting(true);
    try {
      const res = await fetch(`${API}/export-pdf`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ analysis: explanation, cover_letter: coverLetter, score }) });
      if (!res.ok) { alert("Export failed."); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement("a"), { href: url, download: "careerpilot_report.pdf" }).click();
      URL.revokeObjectURL(url);
    } catch { alert("Could not reach the server."); }
    finally { setExporting(false); }
  };

  /* shared input style */
  const inputStyle = {
    width: "100%", background: C.white, border: `1px solid ${C.border}`,
    borderRadius: 8, color: C.text, fontFamily: "Inter, sans-serif",
    fontSize: 13, lineHeight: 1.6, padding: "10px 12px",
    resize: "vertical", outline: "none", boxSizing: "border-box",
    transition: "border-color .15s",
  };

  const primaryButton = (disabled) => ({
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    padding: "10px 20px", fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600,
    border: "none", borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer",
    background: disabled ? "#E2E8F0" : C.blue,
    color: disabled ? C.text2 : "#fff",
    transition: "background .15s, transform .1s",
    opacity: disabled ? 0.7 : 1,
  });

  const ghostButton = (disabled) => ({
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "8px 14px", fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 500,
    border: `1px solid ${C.border}`, borderRadius: 8,
    cursor: disabled ? "not-allowed" : "pointer",
    background: C.white, color: disabled ? C.text2 : C.text,
    transition: "background .15s", opacity: disabled ? 0.6 : 1,
  });

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; background: ${C.bg}; color: ${C.text}; min-height: 100vh; -webkit-font-smoothing: antialiased; }
        #root { min-width: 100%; border: none; }
        textarea:focus, input:focus { border-color: ${C.blue2} !important; outline: none; box-shadow: 0 0 0 3px rgba(62,99,221,.1); }
        textarea::placeholder, input::placeholder { color: #CBD5E1; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .fade { animation: fadeIn .25s ease forwards; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 10px; }
        .primary-btn:hover:not(:disabled) { background: #1E2E78 !important; }
        .ghost-btn:hover:not(:disabled) { background: ${C.bg} !important; }
        .nav-item:hover { background: #F8FAFC !important; }
        .history-row:hover { background: #F8FAFC !important; }
      `}</style>

      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>

        {/* ══ SIDEBAR ══ */}
        <aside style={{ width: 220, flexShrink: 0, background: C.white, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Logo */}
          <div style={{ padding: "20px 20px 16px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: C.blue, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" /></svg>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, letterSpacing: "-0.2px" }}>CareerPilot</div>
                <div style={{ fontSize: 10, color: C.text2, fontWeight: 400 }}>Resume Screener</div>
              </div>
            </div>
          </div>

          {/* Score panel — visible after analysis */}
          {score !== null && (
            <div style={{ padding: "20px 16px", borderBottom: `1px solid ${C.border}` }} className="fade">
              <ScoreGauge score={score} />
              {breakdown && (
                <div style={{ marginTop: 18 }}>
                  <SectionLabel>Score Breakdown</SectionLabel>
                  <ProgressBar label="Text Similarity" value={breakdown.tfidf_similarity} />
                  <ProgressBar label="Skill Match" value={breakdown.skill_match} />
                  <ProgressBar label="Experience Signal" value={breakdown.experience_signal} />
                  <ProgressBar label="Completeness" value={breakdown.section_completeness} />
                </div>
              )}
            </div>
          )}

          {/* Nav */}
          <nav style={{ padding: "12px 8px", flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#CBD5E1", textTransform: "uppercase", letterSpacing: "0.08em", padding: "4px 14px 8px" }}>Tools</div>
            <NavItem icon="📄" label="Analyze" active={tab === "analyze"} onClick={() => setTab("analyze")} />
            <NavItem icon="✏️" label="Resume Editor" active={tab === "editor"} onClick={() => setTab("editor")} />
            <NavItem icon="✉️" label="Cover Letter" active={tab === "cover"} onClick={() => setTab("cover")} />
            <NavItem icon="📈" label="History" active={tab === "history"} onClick={() => setTab("history")} badge={history.length || null} />
          </nav>

          {/* Export */}
          {hasResult && (
            <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}` }}>
              <button className="ghost-btn" onClick={exportPDF} disabled={exporting} style={ghostButton(exporting)}>
                {exporting ? <Spinner size={13} color={C.text2} /> : (
                  <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                )}
                Export PDF
              </button>
            </div>
          )}
        </aside>

        {/* ══ MAIN AREA ══ */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

          {/* Top bar */}
          <div style={{ height: 52, background: C.white, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", padding: "0 24px", gap: 12, flexShrink: 0 }}>
            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
              <span style={{ fontSize: 12, color: C.text2 }}>CareerPilot</span>
              <span style={{ color: C.border, fontSize: 14 }}>/</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                {tab === "analyze" && "Analyze Resume"}
                {tab === "editor" && "Resume Editor"}
                {tab === "cover" && "Cover Letter"}
                {tab === "history" && "History"}
              </span>
              {hasResult && tab === "analyze" && (
                <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, background: "#F0FDF4", color: C.success, border: "1px solid #BBF7D0", padding: "2px 9px", borderRadius: 99 }}>
                  Analysis complete
                </span>
              )}
            </div>

            {/* Panel toggle — only on analyze with result */}
            {tab === "analyze" && hasResult && (
              <div style={{ display: "flex", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 3, gap: 2 }}>
                {[["resume", "Resume"], ["analysis", "AI Analysis"]].map(([p, lbl]) => (
                  <button key={p} onClick={() => setRightPanel(p)} style={{
                    padding: "4px 12px", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 500,
                    background: rightPanel === p ? C.white : "transparent",
                    color: rightPanel === p ? C.text : C.text2,
                    boxShadow: rightPanel === p ? "0 1px 4px rgba(0,0,0,.08)" : "none",
                    cursor: "pointer", fontFamily: "Inter, sans-serif", transition: "all .15s",
                  }}>{lbl}</button>
                ))}
              </div>
            )}
          </div>

          {/* Page body */}
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

            {/* ══ ANALYZE TAB ══ */}
            {tab === "analyze" && (
              <>
                {/* Left: inputs */}
                <div style={{
                  width: hasResult ? 360 : 500,
                  flexShrink: 0,
                  borderRight: `1px solid ${C.border}`,
                  overflowY: "auto",
                  padding: 24,
                  display: "flex",
                  flexDirection: "column",
                  gap: 18,
                  margin: hasResult ? "0" : "0 auto",
                  background: hasResult ? C.bg : C.bg,
                }}>

                  {/* Upload card */}
                  <div style={{ ...card, padding: 20 }}>
                    <SectionLabel>Resume PDF</SectionLabel>
                    <div
                      onClick={() => fileRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
                      style={{
                        border: `1.5px dashed ${dragOver ? C.blue2 : file ? C.success : C.border}`,
                        borderRadius: 10, padding: "22px 16px", textAlign: "center",
                        cursor: "pointer", background: dragOver ? "#EEF2FF" : C.white,
                        transition: "border-color .15s, background .15s",
                      }}>
                      {file ? (
                        <div>
                          <div style={{ fontSize: 22, marginBottom: 6 }}>✅</div>
                          <div style={{ fontSize: 12, color: C.success, fontWeight: 500 }}>{file.name}</div>
                          <div style={{ fontSize: 11, color: C.text2, marginTop: 3 }}>Click to replace</div>
                        </div>
                      ) : (
                        <div>
                          <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke={C.border} strokeWidth="1.5" style={{ display: "block", margin: "0 auto 8px" }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                          <div style={{ fontSize: 13, color: C.text2 }}>Drop PDF here or <span style={{ color: C.blue2, fontWeight: 500 }}>browse</span></div>
                        </div>
                      )}
                    </div>
                    <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
                  </div>

                  {/* Job description card */}
                  <div style={{ ...card, padding: 20 }}>
                    <SectionLabel>Job Description</SectionLabel>
                    <textarea rows={10} placeholder="Paste the full job listing here…" value={job} onChange={e => setJob(e.target.value)} style={inputStyle} />
                  </div>

                  <button className="primary-btn" onClick={analyze} disabled={!file || !job.trim() || loading} style={{ ...primaryButton(!file || !job.trim() || loading), width: "100%", padding: "12px 20px" }}>
                    {loading ? <><Spinner />Analyzing…</> : "Analyze Resume"}
                  </button>

                  {error && (
                    <div style={{ padding: "11px 14px", background: "#FEF2F2", border: `1px solid #FECACA`, borderRadius: 8, color: C.error, fontSize: 13 }}>
                      {error}
                    </div>
                  )}

                  {/* Skills section */}
                  {hasResult && (
                    <div style={{ ...card, padding: 20 }} className="fade">
                      {matchedSkills.length > 0 && (
                        <div style={{ marginBottom: 14 }}>
                          <SectionLabel>Matched Skills</SectionLabel>
                          <div>{matchedSkills.map((s, i) => <Chip key={i} label={s} kind="matched" />)}</div>
                        </div>
                      )}
                      {missingSkills.length > 0 && (
                        <div style={{ marginBottom: 14 }}>
                          <SectionLabel>Missing Skills</SectionLabel>
                          <div>{missingSkills.map((s, i) => <Chip key={i} label={s} kind="missing" />)}</div>
                        </div>
                      )}
                      {sectionsFound.length > 0 && (
                        <div>
                          <SectionLabel>Sections Detected</SectionLabel>
                          <div>{sectionsFound.map((s, i) => <Chip key={i} label={s} kind="neutral" />)}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Right: resume / analysis */}
                {hasResult && (
                  <div style={{ flex: 1, overflowY: "auto", padding: 28, minWidth: 0, background: C.bg }} className="fade">

                    {rightPanel === "resume" && (
                      <div style={{ maxWidth: 700 }}>
                        <div style={{ display: "flex", alignItems: "center", marginBottom: 16, gap: 10 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Resume Preview</div>
                            <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>
                              <span style={{ background: "#DCFCE7", color: "#15803D", borderRadius: 3, padding: "1px 5px", fontSize: 11, fontWeight: 500 }}>Green</span> = matched &nbsp;
                              <span style={{ background: "#FEE2E2", color: "#B91C1C", borderRadius: 3, padding: "1px 5px", fontSize: 11, fontWeight: 500, textDecoration: "underline dotted" }}>Red</span> = missing
                            </div>
                          </div>
                          <CopyBtn text={resumeText} />
                        </div>
                        <div style={{ ...card, padding: "32px 36px" }}>
                          <ResumeDoc text={resumeText} matchedSkills={matchedSkills} missingSkills={missingSkills} />
                        </div>
                      </div>
                    )}

                    {rightPanel === "analysis" && (
                      <div style={{ maxWidth: 700 }}>
                        <div style={{ display: "flex", alignItems: "center", marginBottom: 16, gap: 10 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, flex: 1 }}>AI Explanation & Suggestions</div>
                          <CopyBtn text={explanation} />
                        </div>
                        <div style={{ ...card, padding: "28px 32px" }}>
                          <AIExplanation text={explanation} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ══ EDITOR TAB ══ */}
            {tab === "editor" && (
              <div style={{ flex: 1, padding: 28, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }} className="fade">
                <div style={{ padding: "11px 16px", background: "#EEF2FF", border: `1px solid #C7D2FE`, borderRadius: 8, fontSize: 13, color: C.blue2 }}>
                  Run an analysis first to load your resume. Then use AI Rewrite to tailor it to the job.
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <CopyBtn text={editorText} />
                  <button className="ghost-btn" onClick={rewrite} disabled={!editorText || !job || rewriting} style={ghostButton(!editorText || !job || rewriting)}>
                    {rewriting ? <><Spinner size={13} color={C.text2} />Rewriting…</> : "✨ AI Rewrite"}
                  </button>
                </div>
                <div style={{ ...card, flex: 1, padding: 20 }}>
                  <textarea
                    rows={28}
                    placeholder="Resume text loads here after analysis. You can also paste manually."
                    value={editorText}
                    onChange={e => setEditorText(e.target.value)}
                    style={{ ...inputStyle, fontFamily: "ui-monospace, 'Cascadia Code', monospace", fontSize: 12, minHeight: 480 }}
                  />
                </div>
                {rwError && <div style={{ padding: "10px 14px", background: "#FEF2F2", border: `1px solid #FECACA`, borderRadius: 8, color: C.error, fontSize: 13 }}>{rwError}</div>}
              </div>
            )}

            {/* ══ COVER LETTER TAB ══ */}
            {tab === "cover" && (
              <div style={{ flex: 1, padding: 28, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, maxWidth: 760 }} className="fade">
                <div style={{ padding: "11px 16px", background: "#EEF2FF", border: `1px solid #C7D2FE`, borderRadius: 8, fontSize: 13, color: C.blue2 }}>
                  Run an analysis first, then generate a tailored cover letter in one click.
                </div>
                <div>
                  <button className="primary-btn" onClick={generateCL} disabled={!resumeText || !job || clLoading} style={{ ...primaryButton(!resumeText || !job || clLoading) }}>
                    {clLoading ? <><Spinner />Generating…</> : "Generate Cover Letter"}
                  </button>
                </div>
                {clError && <div style={{ padding: "10px 14px", background: "#FEF2F2", border: `1px solid #FECACA`, borderRadius: 8, color: C.error, fontSize: 13 }}>{clError}</div>}

                {coverLetter ? (
                  <div style={{ ...card, padding: "28px 32px" }} className="fade">
                    <div style={{ display: "flex", alignItems: "center", marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1 }}>Cover Letter</span>
                      <CopyBtn text={coverLetter} />
                    </div>
                    <div style={{ whiteSpace: "pre-wrap", fontSize: 14, color: C.text, lineHeight: 1.85, fontFamily: "'Georgia', serif" }}>{coverLetter}</div>
                  </div>
                ) : !clLoading && (
                  <div style={{ textAlign: "center", padding: "60px 0", color: "#CBD5E1", fontSize: 13 }}>
                    Your cover letter will appear here
                  </div>
                )}
              </div>
            )}

            {/* ══ HISTORY TAB ══ */}
            {tab === "history" && (
              <div style={{ flex: 1, padding: 28, overflowY: "auto" }} className="fade">
                {history.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "80px 0", color: "#CBD5E1", fontSize: 13 }}>
                    No history yet. Run your first analysis to see it here.
                  </div>
                ) : (
                  <>
                    {/* Sparkline chart */}
                    <div style={{ ...card, padding: "20px 24px", marginBottom: 24 }}>
                      <SectionLabel>Score History</SectionLabel>
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 72 }}>
                        {[...history].reverse().slice(-12).map((h, i) => {
                          const pct = h.score || 0;
                          const color = pct >= 75 ? C.success : pct >= 50 ? C.warning : C.error;
                          return (
                            <div key={i} title={`Score: ${pct} — ${h.date}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                              <span style={{ fontSize: 10, color: C.text2, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{pct}</span>
                              <div style={{ width: "100%", background: "#F1F5F9", borderRadius: 4, height: 52, display: "flex", alignItems: "flex-end", overflow: "hidden" }}>
                                <div style={{ width: "100%", height: `${pct}%`, background: color, opacity: 0.85, borderRadius: "3px 3px 0 0", transition: "height .6s ease" }} />
                              </div>
                              <span style={{ fontSize: 9, color: "#CBD5E1" }}>{h.date?.split("/").slice(0, 2).join("/")}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* History list */}
                    <div style={{ ...card, overflow: "hidden" }}>
                      {history.map((h, idx) => {
                        const color = (h.score || 0) >= 75 ? C.success : (h.score || 0) >= 50 ? C.warning : C.error;
                        return (
                          <div key={h.id} className="history-row"
                            style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 20px", borderBottom: idx < history.length - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer", transition: "background .15s" }}
                            onClick={() => {
                              setExplanation(h.explanation || ""); setResumeText(h.resume_text || "");
                              setScore(h.score); setBreakdown(h.breakdown || null);
                              setMatchedSkills(h.matched_skills || []); setMissingSkills(h.missing_skills || []);
                              setJob(h.job || ""); setTab("analyze");
                            }}>
                            <div style={{ width: 44, height: 44, borderRadius: 10, background: color + "18", border: `1.5px solid ${color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                              {h.score ?? "—"}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 500, color: C.text, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{h.job || "Untitled"}</div>
                              <div style={{ fontSize: 11, color: C.text2, marginTop: 2 }}>{h.date}</div>
                            </div>
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke={C.border} strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                          </div>
                        );
                      })}
                    </div>

                    <button className="ghost-btn" onClick={() => { localStorage.removeItem("cp_history"); setHistory([]); }}
                      style={{ ...ghostButton(false), marginTop: 16, fontSize: 12, color: C.error, borderColor: "#FECACA" }}>
                      Clear History
                    </button>
                  </>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}