import { useState, useRef, useEffect } from "react";

const API = "http://127.0.0.1:5000";

// ── helpers ──────────────────────────────────────────────────────────────────
function extractScore(text) {
  const m = text?.match(/Score:\s*(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function saveHistory(entry) {
  const prev = JSON.parse(localStorage.getItem("cp_history") || "[]");
  prev.unshift({ ...entry, id: Date.now(), date: new Date().toLocaleDateString() });
  localStorage.setItem("cp_history", JSON.stringify(prev.slice(0, 20)));
}

function getHistory() {
  return JSON.parse(localStorage.getItem("cp_history") || "[]");
}

// ── tiny components ───────────────────────────────────────────────────────────
function Spinner({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20"
      style={{ animation: "spin 0.75s linear infinite", flexShrink: 0 }}>
      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeDasharray="40" strokeDashoffset="15" strokeLinecap="round" />
    </svg>
  );
}

function ScoreRing({ score }) {
  const r = 54, circ = 2 * Math.PI * r;
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  const label = score >= 75 ? "Strong" : score >= 50 ? "Fair" : "Weak";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={r} fill="none" stroke="#1f2230" strokeWidth="10" />
        <circle cx="65" cy="65" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={circ}
          strokeDashoffset={circ - (circ * score) / 100}
          strokeLinecap="round"
          transform="rotate(-90 65 65)"
          style={{ transition: "stroke-dashoffset 1.2s ease" }}
        />
        <text x="65" y="60" textAnchor="middle" fill={color}
          fontSize="26" fontWeight="700" fontFamily="Sora, sans-serif">{score}</text>
        <text x="65" y="78" textAnchor="middle" fill="#6b7280"
          fontSize="11" fontFamily="Sora, sans-serif">/ 100</text>
      </svg>
      <span style={{ fontSize: 12, color, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label} Match</span>
    </div>
  );
}

function Tag({ children, color = "#6366f1" }) {
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 100,
      fontSize: 12, fontWeight: 500, color,
      background: color + "22", border: `1px solid ${color}44`,
      margin: "2px 3px"
    }}>{children}</span>
  );
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{ background: "#1f2230", border: "none", color: copied ? "#22c55e" : "#9ca3af", fontSize: 12, padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "Sora, sans-serif", transition: "color 0.2s" }}>
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

// ── result renderer ───────────────────────────────────────────────────────────
function ResultRenderer({ text }) {
  if (!text) return null;
  const sections = [];
  let current = null;

  text.split("\n").forEach(line => {
    if (line.startsWith("## ")) {
      if (current) sections.push(current);
      current = { heading: line.replace("## ", "").trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  });
  if (current) sections.push(current);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {sections.map((s, i) => {
        const isKeywords = s.heading.toLowerCase().includes("keyword");
        const keywords = isKeywords
          ? s.lines.join(" ").split(",").map(k => k.trim()).filter(Boolean)
          : [];

        return (
          <div key={i}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#6366f1", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid #1f2230" }}>
              {s.heading}
            </div>
            {isKeywords ? (
              <div>{keywords.map((k, j) => <Tag key={j}>{k}</Tag>)}</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {s.lines.map((line, j) => {
                  const clean = line.replace(/\*\*/g, "").trim();
                  if (!clean) return null;
                  if (clean.startsWith("- ")) {
                    const txt = clean.slice(2);
                    const isGood = s.heading.toLowerCase().includes("match");
                    const isBad = s.heading.toLowerCase().includes("missing");
                    const dot = isGood ? "✅" : isBad ? "❌" : "•";
                    return <div key={j} style={{ display: "flex", gap: 8, fontSize: 14, color: "#d1d5db", lineHeight: 1.6 }}><span>{dot}</span><span>{txt}</span></div>;
                  }
                  if (/^\d+\. /.test(clean)) {
                    return <div key={j} style={{ fontSize: 14, color: "#d1d5db", lineHeight: 1.6 }}>{clean}</div>;
                  }
                  if (clean.startsWith("Score:")) {
                    return null; // rendered via ScoreRing
                  }
                  return <p key={j} style={{ fontSize: 14, color: "#9ca3af", lineHeight: 1.7, margin: 0 }}>{clean}</p>;
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── tabs ──────────────────────────────────────────────────────────────────────
function Tab({ label, active, onClick, badge }) {
  return (
    <button onClick={onClick} style={{
      background: "none", border: "none", cursor: "pointer",
      padding: "10px 18px", fontSize: 13, fontWeight: 500,
      color: active ? "#a5b4fc" : "#4b5563",
      borderBottom: active ? "2px solid #6366f1" : "2px solid transparent",
      fontFamily: "Sora, sans-serif", transition: "color 0.2s",
      display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap"
    }}>
      {label}
      {badge && <span style={{ background: "#6366f1", color: "#fff", fontSize: 10, padding: "1px 6px", borderRadius: 100 }}>{badge}</span>}
    </button>
  );
}

// ── main app ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("analyze");
  const [file, setFile] = useState(null);
  const [job, setJob] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // analysis state
  const [result, setResult] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [score, setScore] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // cover letter
  const [coverLetter, setCoverLetter] = useState("");
  const [clLoading, setClLoading] = useState(false);
  const [clError, setClError] = useState("");

  // resume editor
  const [editorText, setEditorText] = useState("");
  const [rewriting, setRewriting] = useState(false);
  const [rwError, setRwError] = useState("");

  // history
  const [history, setHistory] = useState(getHistory());
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (resumeText) setEditorText(resumeText);
  }, [resumeText]);

  const handleFile = (f) => {
    if (f?.type === "application/pdf") { setFile(f); setError(""); }
    else setError("Please upload a PDF file.");
  };

  // ── analyze ──
  const analyze = async () => {
    if (!file) return setError("Please upload a resume PDF.");
    if (!job.trim()) return setError("Please paste a job description.");
    setError(""); setResult(""); setCoverLetter(""); setScore(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("resume", file);
      fd.append("job", job);
      const res = await fetch(`${API}/upload-resume`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || data.error) return setError(data.error || "Analysis failed.");
      setResult(data.result);
      setResumeText(data.resume_text || "");
      const s = extractScore(data.result);
      setScore(s);
      const entry = { score: s, job: job.slice(0, 60), result: data.result, resume_text: data.resume_text };
      saveHistory(entry);
      setHistory(getHistory());
    } catch { setError("Cannot connect to server. Is Flask running?"); }
    finally { setLoading(false); }
  };

  // ── cover letter ──
  const generateCoverLetter = async () => {
    if (!resumeText || !job) return setClError("Run analysis first.");
    setClError(""); setClLoading(true);
    try {
      const res = await fetch(`${API}/cover-letter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume_text: resumeText, job }),
      });
      const data = await res.json();
      if (!res.ok || data.error) return setClError(data.error || "Failed.");
      setCoverLetter(data.cover_letter);
    } catch { setClError("Cannot connect to server."); }
    finally { setClLoading(false); }
  };

  // ── rewrite ──
  const rewriteResume = async () => {
    if (!editorText || !job) return setRwError("Run analysis first so we have your resume text.");
    setRwError(""); setRewriting(true);
    try {
      const res = await fetch(`${API}/rewrite-resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume_text: editorText, job }),
      });
      const data = await res.json();
      if (!res.ok || data.error) return setRwError(data.error || "Failed.");
      setEditorText(data.rewritten);
    } catch { setRwError("Cannot connect to server."); }
    finally { setRewriting(false); }
  };

  // ── export PDF ──
  const exportPDF = async () => {
    setExporting(true);
    try {
      const res = await fetch(`${API}/export-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis: result, cover_letter: coverLetter, score }),
      });
      if (!res.ok) return alert("Export failed.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "careerpilot_report.pdf"; a.click();
      URL.revokeObjectURL(url);
    } catch { alert("Cannot connect to server."); }
    finally { setExporting(false); }
  };

  const hasResult = !!result;

  // ── styles ──
  const S = {
    app: { maxWidth: 860, margin: "0 auto", padding: "48px 24px 80px", width: "100%", fontFamily: "Sora, sans-serif" },
    card: { background: "#13151c", border: "1px solid #1f2230", borderRadius: 16, padding: 20 },
    label: { fontSize: 11, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "#4b5563", display: "flex", alignItems: "center", gap: 6, marginBottom: 10 },
    dot: { width: 6, height: 6, borderRadius: "50%", background: "#6366f1" },
    textarea: { width: "100%", background: "#0d0f14", border: "1.5px solid #1f2230", borderRadius: 12, color: "#e2e4eb", fontFamily: "Sora, sans-serif", fontSize: 13, lineHeight: 1.6, padding: 14, resize: "vertical", outline: "none", boxSizing: "border-box" },
    btn: (disabled, variant = "primary") => ({
      padding: "13px 22px", borderRadius: 12, border: "none", cursor: disabled ? "not-allowed" : "pointer",
      fontFamily: "Sora, sans-serif", fontSize: 14, fontWeight: 600,
      display: "inline-flex", alignItems: "center", gap: 8, transition: "opacity 0.2s",
      opacity: disabled ? 0.4 : 1,
      background: variant === "primary" ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : variant === "ghost" ? "#1f2230" : "#1f2230",
      color: variant === "primary" ? "#fff" : "#9ca3af",
    }),
    sectionHead: { fontSize: 11, fontWeight: 600, color: "#6366f1", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid #1f2230" },
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Sora', sans-serif; background: #0d0f14; color: #e2e4eb; min-height: 100vh; }
        #root { min-width: 100%; max-width: 100%; border: none; }
        textarea:focus { border-color: #6366f1 !important; outline: none; }
        textarea::placeholder { color: #2d3040; }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .fade-in { animation: fadeIn 0.4s ease forwards; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #13151c; } ::-webkit-scrollbar-thumb { background: #2a2d3e; border-radius: 3px; }
      `}</style>

      <div style={S.app}>

        {/* ── header ── */}
        <div style={{ textAlign: "center", marginBottom: 44 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 100, padding: "6px 16px", fontSize: 11, fontWeight: 500, color: "#a5b4fc", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 18 }}>
            ✦ AI-Powered
          </div>
          <h1 style={{ fontSize: "clamp(32px,5vw,52px)", fontWeight: 600, letterSpacing: "-1.5px", color: "#f0f2ff", lineHeight: 1.1, marginBottom: 10 }}>
            Career<span style={{ background: "linear-gradient(135deg,#818cf8,#c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Pilot</span>
          </h1>
          <p style={{ fontSize: 15, color: "#4b5563", fontWeight: 300 }}>Drop your resume. Paste a job. Land the interview.</p>
        </div>

        {/* ── tab bar ── */}
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #1f2230", marginBottom: 28, overflowX: "auto" }}>
          <Tab label="📄 Analyze" active={tab === "analyze"} onClick={() => setTab("analyze")} />
          <Tab label="✏️ Resume Editor" active={tab === "editor"} onClick={() => setTab("editor")} />
          <Tab label="✉️ Cover Letter" active={tab === "cover"} onClick={() => setTab("cover")} />
          <Tab label="📈 History" active={tab === "history"} onClick={() => setTab("history")} badge={history.length || null} />
        </div>

        {/* ══ ANALYZE TAB ══ */}
        {tab === "analyze" && (
          <div className="fade-in">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              {/* upload */}
              <div style={S.card}>
                <div style={S.label}><span style={S.dot} />Resume PDF</div>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
                  style={{ border: `1.5px dashed ${dragOver ? "#6366f1" : "#2a2d3e"}`, borderRadius: 12, padding: "28px 20px", textAlign: "center", cursor: "pointer", background: dragOver ? "rgba(99,102,241,0.05)" : "#0d0f14", transition: "all 0.2s" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
                  {file
                    ? <span style={{ fontSize: 13, color: "#a5b4fc", fontFamily: "DM Mono, monospace" }}>✓ {file.name}</span>
                    : <span style={{ fontSize: 13, color: "#374151" }}>Drop PDF here or click to browse</span>}
                </div>
                <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
              </div>

              {/* job description */}
              <div style={S.card}>
                <div style={S.label}><span style={S.dot} />Job Description</div>
                <textarea rows="7" placeholder="Paste the full job description here…" value={job} onChange={e => setJob(e.target.value)} style={S.textarea} />
              </div>
            </div>

            <button onClick={analyze} disabled={!file || !job.trim() || loading}
              style={{ ...S.btn(!file || !job.trim() || loading), width: "100%", justifyContent: "center", padding: 16, fontSize: 15, borderRadius: 14 }}>
              {loading ? <><Spinner /> Analyzing…</> : "✦ Analyze My Resume"}
            </button>

            {error && <div style={{ marginTop: 16, padding: "14px 18px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, color: "#f87171", fontSize: 14 }}>{error}</div>}

            {/* result */}
            {hasResult && (
              <div className="fade-in" style={{ marginTop: 24, ...S.card }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid #1f2230" }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: "#9ca3af", flex: 1 }}>📊 Analysis Complete</span>
                  {score !== null && <ScoreRing score={score} />}
                  <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                    <CopyBtn text={result} />
                    <button onClick={exportPDF} disabled={exporting} style={S.btn(exporting, "ghost")}>
                      {exporting ? <Spinner size={14} /> : "⬇ Export PDF"}
                    </button>
                  </div>
                </div>
                <div style={{ maxHeight: 520, overflowY: "auto", paddingRight: 4 }}>
                  <ResultRenderer text={result} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ EDITOR TAB ══ */}
        {tab === "editor" && (
          <div className="fade-in">
            <div style={{ marginBottom: 16, padding: "14px 18px", background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 12, fontSize: 13, color: "#818cf8" }}>
              💡 Run an analysis first to auto-load your resume text, then click <strong>AI Rewrite</strong> to optimize it for the job.
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={S.label}><span style={S.dot} />Resume Text Editor</div>
              <div style={{ display: "flex", gap: 8 }}>
                <CopyBtn text={editorText} />
                <button onClick={rewriteResume} disabled={!editorText || !job || rewriting} style={S.btn(!editorText || !job || rewriting)}>
                  {rewriting ? <><Spinner size={14} /> Rewriting…</> : "✨ AI Rewrite for This Job"}
                </button>
              </div>
            </div>
            <textarea
              rows="28"
              placeholder="Your resume text will appear here after analysis. You can also paste it manually."
              value={editorText}
              onChange={e => setEditorText(e.target.value)}
              style={{ ...S.textarea, minHeight: 500, fontFamily: "DM Mono, monospace", fontSize: 12 }}
            />
            {rwError && <div style={{ marginTop: 12, color: "#f87171", fontSize: 13 }}>{rwError}</div>}
            <p style={{ marginTop: 10, fontSize: 12, color: "#374151" }}>Tip: After AI rewrite, copy this text and use it to update your original resume document.</p>
          </div>
        )}

        {/* ══ COVER LETTER TAB ══ */}
        {tab === "cover" && (
          <div className="fade-in">
            <div style={{ marginBottom: 16, padding: "14px 18px", background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 12, fontSize: 13, color: "#818cf8" }}>
              💡 Run an analysis first, then generate a tailored cover letter in one click.
            </div>
            <button onClick={generateCoverLetter} disabled={!resumeText || !job || clLoading}
              style={{ ...S.btn(!resumeText || !job || clLoading), marginBottom: 20 }}>
              {clLoading ? <><Spinner size={14} /> Generating…</> : "✉️ Generate Cover Letter"}
            </button>
            {clError && <div style={{ marginBottom: 12, color: "#f87171", fontSize: 13 }}>{clError}</div>}
            {coverLetter && (
              <div className="fade-in" style={S.card}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #1f2230" }}>
                  <span style={{ fontSize: 13, color: "#9ca3af", flex: 1 }}>✉️ Your Cover Letter</span>
                  <CopyBtn text={coverLetter} />
                </div>
                <div style={{ whiteSpace: "pre-wrap", fontSize: 14, color: "#d1d5db", lineHeight: 1.8 }}>{coverLetter}</div>
              </div>
            )}
            {!coverLetter && !clLoading && (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#2a2d3e", fontSize: 14 }}>
                Your cover letter will appear here
              </div>
            )}
          </div>
        )}

        {/* ══ HISTORY TAB ══ */}
        {tab === "history" && (
          <div className="fade-in">
            {history.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 0", color: "#2a2d3e", fontSize: 14 }}>
                No history yet. Run your first analysis to see it here.
              </div>
            ) : (
              <>
                {/* score chart */}
                <div style={{ ...S.card, marginBottom: 20 }}>
                  <div style={S.sectionHead}>Score History</div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 100, padding: "8px 0" }}>
                    {[...history].reverse().slice(-10).map((h, i) => {
                      const pct = (h.score || 0);
                      const color = pct >= 75 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444";
                      return (
                        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                          <span style={{ fontSize: 10, color, fontWeight: 600 }}>{pct}</span>
                          <div style={{ width: "100%", background: color + "33", borderRadius: 4, height: `${pct}%`, minHeight: 4, transition: "height 0.8s ease", position: "relative" }}>
                            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: color, borderRadius: 4, height: `${pct}%` }} />
                          </div>
                          <span style={{ fontSize: 9, color: "#374151", textAlign: "center", maxWidth: 40, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{h.date}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* history list */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {history.map((h, i) => {
                    const color = (h.score || 0) >= 75 ? "#22c55e" : (h.score || 0) >= 50 ? "#f59e0b" : "#ef4444";
                    return (
                      <div key={h.id} style={{ ...S.card, display: "flex", alignItems: "center", gap: 16, cursor: "pointer" }}
                        onClick={() => { setResult(h.result || ""); setResumeText(h.resume_text || ""); setScore(h.score); setJob(h.job || ""); setTab("analyze"); }}>
                        <div style={{ width: 48, height: 48, borderRadius: "50%", background: color + "22", border: `2px solid ${color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color, flexShrink: 0 }}>
                          {h.score || "?"}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: "#e2e4eb", fontWeight: 500, marginBottom: 2, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{h.job || "No job title"}</div>
                          <div style={{ fontSize: 11, color: "#374151" }}>{h.date}</div>
                        </div>
                        <span style={{ fontSize: 12, color: "#4b5563" }}>View →</span>
                      </div>
                    );
                  })}
                </div>

                <button onClick={() => { localStorage.removeItem("cp_history"); setHistory([]); }}
                  style={{ ...S.btn(false, "ghost"), marginTop: 20, fontSize: 12 }}>
                  Clear History
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
