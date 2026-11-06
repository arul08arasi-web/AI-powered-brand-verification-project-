"use client";

import { useEffect, useMemo, useState } from "react";
import * as store from "../lib/store";
import { runChecks, applyFix } from "../lib/checker";

const ROLES = ["Creator", "Reviewer", "Admin"];
const SAMPLE =
  "Meet the all-new Pro plan.\nWe are the world's #1 CRM, now just $19/month for every team. Trusted by 10,000 customers. ISO 27001 certified.\nGrab it NOW!!!";

function fmtDate(d) {
  try { return new Date(d).toLocaleString(); } catch (e) { return ""; }
}

function Highlighted({ text, findings }) {
  const spans = findings.filter((f) => f.start >= 0).sort((a, b) => a.start - b.start);
  const parts = [];
  let pos = 0;
  spans.forEach((f, i) => {
    if (f.start < pos) return;
    if (f.start > pos) parts.push(<span key={"t" + i}>{text.slice(pos, f.start)}</span>);
    parts.push(<span key={"h" + i} className="snip">{text.slice(f.start, f.end)}</span>);
    pos = f.end;
  });
  if (pos < text.length) parts.push(<span key="end">{text.slice(pos)}</span>);
  return <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 14 }}>{parts}</div>;
}

export default function Home() {
  const [role, setRole] = useState("Creator");
  const [tab, setTab] = useState("check");
  const [rules, setRules] = useState([]);
  const [claims, setClaims] = useState([]);
  const [subs, setSubs] = useState([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [text, setText] = useState(SAMPLE);
  const [includeImage, setIncludeImage] = useState(true);
  const [altText, setAltText] = useState("");
  const [dismissed, setDismissed] = useState([]);
  const [log, setLog] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [ai, setAi] = useState({ loading: false, text: "", error: "", model: "" });

  const [openId, setOpenId] = useState(null);
  const [activity, setActivity] = useState([]);
  const [comment, setComment] = useState("");

  const [newFact, setNewFact] = useState({ topic: "", keywords: "", approved_text: "", approved_number: "", source: "", expires_on: "" });

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("bp_role") : null;
    if (saved && ROLES.includes(saved)) setRole(saved);
    loadAll();
  }, []);

  function chooseRole(r) {
    setRole(r);
    try { window.localStorage.setItem("bp_role", r); } catch (e) {}
  }

  function flash(m) {
    setMsg(m);
    setTimeout(() => setMsg(""), 4000);
  }

  function loadAll() {
    store.seedIfNeeded();
    setRules(store.getRules());
    setClaims(store.getClaims());
    setSubs(store.getSubs());
    setLoading(false);
  }

  // ---------- CHECK ----------
  const result = useMemo(
    () => runChecks({ text, includeImage, altText, rules, claims, today: new Date().toISOString().slice(0, 10) }),
    [text, includeImage, altText, rules, claims]
  );
  const findings = result.findings.filter((f) => !dismissed.includes(f.ruleCode + "|" + f.snippet));
  const openCount = findings.length;

  function dismiss(f) {
    setDismissed([...dismissed, f.ruleCode + "|" + f.snippet]);
    setLog([...log, { ruleCode: f.ruleCode, ruleTitle: f.ruleTitle, kind: f.kind, severity: f.severity, snippet: f.snippet, status: "dismissed" }]);
  }
  function fix(f) {
    setText(applyFix(text, f));
    setLog([...log, { ruleCode: f.ruleCode, ruleTitle: f.ruleTitle, kind: f.kind, severity: f.severity, snippet: f.snippet, status: "fixed" }]);
  }

  async function aiRewrite() {
    setAi({ loading: true, text: "", error: "", model: "" });
    try {
      const res = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: text,
          issues: findings.map((f) => f.ruleTitle + ": \"" + f.snippet + "\" - " + f.why),
          facts: claims.map((c) => c.topic + ": " + c.approved_text),
        }),
      });
      const data = await res.json();
      if (data.rewrite) setAi({ loading: false, text: data.rewrite, error: "", model: data.model });
      else setAi({ loading: false, text: "", error: data.error || "No answer.", model: "" });
    } catch (e) {
      setAi({ loading: false, text: "", error: "Could not reach the AI service.", model: "" });
    }
  }

  function resetForm() {
    setTitle(""); setText(""); setIncludeImage(false); setAltText(""); setDismissed([]); setLog([]); setEditingId(null);
    setAi({ loading: false, text: "", error: "", model: "" });
  }

  function submitForReview() {
    if (!title.trim() || !text.trim()) return flash("Please add a title and the content first.");
    const findingsToSave = [
      ...log,
      ...findings.map((f) => ({ ruleCode: f.ruleCode, ruleTitle: f.ruleTitle, kind: f.kind, severity: f.severity, snippet: f.snippet, status: "open" })),
    ];
    const author = role + " (demo)";
    const row = { title: title.trim(), author, content: text, include_image: includeImage, alt_text: altText, findings: findingsToSave, status: "pending" };
    let id = editingId;
    if (editingId) {
      store.updateSub(editingId, row);
      store.addActivity({ submission_id: editingId, actor: author, role, action: "resubmitted", note: "Updated version sent for review", snapshot: text });
    } else {
      const created = store.insertSub(row);
      id = created.id;
      store.addActivity({ submission_id: id, actor: author, role, action: "submitted", note: "Sent for review with " + findingsToSave.filter((x) => x.status === "open").length + " open issue(s)", snapshot: text });
    }
    flash("Sent to the reviewer.");
    resetForm();
    loadAll();
    setTab("submissions");
    setOpenId(id);
    loadActivity(id);
  }

  // ---------- SUBMISSIONS ----------
  function loadActivity(id) {
    setActivity(store.getActivity(id));
  }
  function toggle(id) {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    setComment("");
    loadActivity(id);
  }
  function decide(sub, action) {
    if (action === "changes_requested" && !comment.trim()) return flash("Please write a comment explaining what to change.");
    const status = action === "approved" ? "approved" : "changes_requested";
    const author = role + " (demo)";
    store.updateSub(sub.id, { status });
    store.addActivity({ submission_id: sub.id, actor: author, role, action, note: comment.trim() || null });
    setComment("");
    loadAll();
    loadActivity(sub.id);
    flash(action === "approved" ? "Approved." : "Changes requested.");
  }
  function addComment(sub) {
    if (!comment.trim()) return;
    store.addActivity({ submission_id: sub.id, actor: role + " (demo)", role, action: "comment", note: comment.trim() });
    setComment("");
    loadActivity(sub.id);
  }
  function editAgain(sub) {
    setTitle(sub.title); setText(sub.content); setIncludeImage(!!sub.include_image); setAltText(sub.alt_text || "");
    setDismissed([]); setLog([]); setEditingId(sub.id); setTab("check");
  }

  // ---------- BRAND KIT ----------
  function addFact() {
    const f = newFact;
    if (!f.topic || !f.keywords || !f.approved_text || !f.source) return flash("Fill topic, keywords, approved text and source.");
    const nums = claims.map((c) => parseInt((c.code || "").replace(/\D/g, ""), 10) || 0);
    const code = "C-" + String(Math.max(0, ...nums) + 1).padStart(3, "0");
    store.insertClaim({
      code, topic: f.topic, keywords: f.keywords.toLowerCase(), approved_text: f.approved_text,
      approved_number: f.approved_number === "" ? null : Number(f.approved_number), source: f.source, expires_on: f.expires_on || null,
    });
    setNewFact({ topic: "", keywords: "", approved_text: "", approved_number: "", source: "", expires_on: "" });
    flash("Approved fact added.");
    loadAll();
  }
  function renewClaim(c) {
    const d = new Date(); d.setFullYear(d.getFullYear() + 1);
    store.updateClaim(c.id, { expires_on: d.toISOString().slice(0, 10) });
    flash(c.code + " re-verified for one year.");
    loadAll();
  }
  function seedDemo() {
    store.resetAll();
    loadAll();
    flash("Demo data reset.");
  }

  // ---------- DASHBOARD ----------
  const dash = useMemo(() => {
    const byRule = {};
    let total = 0, approved = 0;
    subs.forEach((s) => {
      if (s.status === "approved") approved++;
      (s.findings || []).forEach((f) => {
        total++;
        const k = f.ruleCode;
        if (!byRule[k]) byRule[k] = { code: k, title: f.ruleTitle, n: 0, dismissed: 0, fixed: 0 };
        byRule[k].n++;
        if (f.status === "dismissed") byRule[k].dismissed++;
        if (f.status === "fixed") byRule[k].fixed++;
      });
    });
    const list = Object.values(byRule).sort((a, b) => b.n - a.n);
    const insights = [];
    list.forEach((r) => {
      if (r.n >= 3) insights.push("Repeated mistake: \"" + r.title + "\" (" + r.code + ") was flagged " + r.n + " times. Add a clear example to the guideline.");
      if (r.n >= 2 && r.dismissed / r.n >= 0.5) insights.push("Possibly unclear rule: \"" + r.title + "\" (" + r.code + ") was dismissed " + r.dismissed + " of " + r.n + " times. Check if the wording is too strict or confusing.");
    });
    return { list, total, approved, insights };
  }, [subs]);

  const maxN = dash.list.length ? dash.list[0].n : 1;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <header>
        <div>
          <h1>BrandProof</h1>
          <small>Brand governance with receipts | Team Innovexa</small>
        </div>
        <div className="roles">
          Demo role:
          {ROLES.map((r) => (
            <button key={r} className={role === r ? "on" : ""} onClick={() => chooseRole(r)}>{r}</button>
          ))}
        </div>
      </header>
      <nav>
        {[["check", "Check content"], ["submissions", "Review queue"], ["kit", "Brand Kit"], ["dashboard", "Guideline insights"]].map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>
      <main>
        {msg && <div className="warn">{msg}</div>}
        <div className="note" style={{ marginBottom: 10 }}>
          Demo data is saved in this browser. AI disclosure: checks are rule-based and always cite a guideline or approved fact. AI is used only for the optional rewrite button, and nothing is changed without a person clicking.
        </div>

        {/* ---------------- CHECK ---------------- */}
        {tab === "check" && (
          <div className="grid2">
            <div className="card">
              <h2>{editingId ? "Edit and resubmit" : "Your content"}</h2>
              <label>Title</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Pro plan launch post" />
              <label>Post text</label>
              <textarea value={text} onChange={(e) => setText(e.target.value)} />
              <label><input type="checkbox" checked={includeImage} onChange={(e) => setIncludeImage(e.target.checked)} /> This post includes an image</label>
              {includeImage && (
                <>
                  <label>Image alt text (description)</label>
                  <input type="text" value={altText} onChange={(e) => setAltText(e.target.value)} placeholder="Describe the image for screen-reader users" />
                </>
              )}
              <div>
                <button className="btn alt" onClick={aiRewrite} disabled={ai.loading || !text.trim()}>{ai.loading ? "Asking AI..." : "AI rewrite (optional)"}</button>
                <button className="btn green" onClick={submitForReview} disabled={!text.trim()}>{editingId ? "Resubmit for review" : "Send for review"}</button>
                <button className="btn gray" onClick={resetForm}>Clear</button>
              </div>
              {openCount > 0 && <p className="note">{openCount} open issue(s) will be shown to the reviewer.</p>}
              {ai.error && <div className="warn" style={{ marginTop: 10 }}>{ai.error}</div>}
              {ai.text && (
                <div className="ai">
                  <b>AI-assisted rewrite ({ai.model}). Review before using:</b>
                  {"\n\n" + ai.text}
                  <div><button className="btn" onClick={() => { setText(ai.text); setAi({ ...ai, text: "" }); }}>Use this rewrite</button></div>
                </div>
              )}
              <h2 style={{ marginTop: 16 }}>Preview with issues highlighted</h2>
              <Highlighted text={text} findings={findings} />
            </div>

            <div>
              <div className="card">
                <h2>Findings ({findings.length})</h2>
                {findings.length === 0 && <div className="ok">No open issues. Everything checked against the Brand Kit.</div>}
                {findings.map((f) => (
                  <div key={f.id} className={"finding " + f.severity}>
                    <h3>
                      {f.ruleTitle}
                      <span className={"chip " + f.severity}>{f.severity}</span>
                      <span className="chip kind">{f.kind}</span>
                    </h3>
                    <p>Found: <span className="snip">{f.snippet}</span></p>
                    <p>Why: {f.why}</p>
                    <p className="src">Source: {f.source}</p>
                    {f.suggestion !== null && f.suggestion !== undefined && f.start >= 0 && (
                      <p className="fix">Suggested fix: replace with "{f.suggestion}"</p>
                    )}
                    {f.hint && <p className="fix">{f.hint}</p>}
                    <div>
                      {f.suggestion !== null && f.suggestion !== undefined && f.start >= 0 && (
                        <button className="btn green" onClick={() => fix(f)}>Accept fix</button>
                      )}
                      <button className="btn gray" onClick={() => dismiss(f)}>Dismiss</button>
                    </div>
                  </div>
                ))}
              </div>
              {result.verified.length > 0 && (
                <div className="card">
                  <h2>Verified against the Claim Ledger</h2>
                  {result.verified.map((v) => (
                    <div className="ok" key={v.code}>OK {v.code}: {v.approved_text} ({v.topic}). Source: {v.source}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---------------- REVIEW QUEUE ---------------- */}
        {tab === "submissions" && (
          <div>
            {loading && <p>Loading...</p>}
            {!loading && subs.length === 0 && <div className="card">Nothing submitted yet. Check some content and click "Send for review".</div>}
            {subs.map((s) => {
              const fl = s.findings || [];
              const cnt = (st) => fl.filter((x) => x.status === st).length;
              return (
                <div className="card" key={s.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <div>
                      <b>{s.title}</b> <span className={"chip " + s.status}>{s.status.replace("_", " ")}</span>
                      <div className="note">{s.author} | {fmtDate(s.updated_at || s.created_at)} | issues: {cnt("open")} open, {cnt("fixed")} fixed, {cnt("dismissed")} dismissed</div>
                    </div>
                    <div><button className="btn alt" onClick={() => toggle(s.id)}>{openId === s.id ? "Close" : "Open"}</button></div>
                  </div>
                  {openId === s.id && (
                    <div style={{ marginTop: 10 }}>
                      <div className="ai" style={{ background: "#fafafa", borderColor: "#e5e7eb" }}>{s.content}</div>
                      {s.include_image && <p className="note">Image alt text: {s.alt_text ? s.alt_text : "(missing)"}</p>}
                      <h2 style={{ marginTop: 12 }}>Issues found</h2>
                      {fl.length === 0 && <p className="note">None.</p>}
                      {fl.map((f, i) => (
                        <div key={i} className="log">{f.ruleCode}: {f.ruleTitle} ("{f.snippet}") <b>[{f.status}]</b></div>
                      ))}
                      <h2 style={{ marginTop: 12 }}>History and comments</h2>
                      {activity.map((a) => (
                        <div key={a.id} className="log">
                          <b>{a.action.replace("_", " ")}</b> by {a.actor} | {fmtDate(a.created_at)}
                          {a.note ? <div>{a.note}</div> : null}
                        </div>
                      ))}
                      <label>Comment</label>
                      <input type="text" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment" />
                      <div>
                        <button className="btn gray" onClick={() => addComment(s)}>Add comment</button>
                        {role === "Reviewer" && (
                          <>
                            <button className="btn green" onClick={() => decide(s, "approved")}>Approve</button>
                            <button className="btn red" onClick={() => decide(s, "changes_requested")}>Request changes</button>
                          </>
                        )}
                        {role === "Creator" && s.status === "changes_requested" && (
                          <button className="btn" onClick={() => editAgain(s)}>Edit and resubmit</button>
                        )}
                      </div>
                      {role !== "Reviewer" && <p className="note">Switch the demo role to "Reviewer" (top right) to approve or request changes.</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ---------------- BRAND KIT ---------------- */}
        {tab === "kit" && (
          <div>
            <div className="card">
              <h2>Claim Ledger (approved facts)</h2>
              <p className="note">Every claim in a post is matched against these facts. Expired facts must be re-verified.</p>
              <table>
                <thead><tr><th>Code</th><th>Topic</th><th>Approved fact</th><th>Source</th><th>Expires</th><th></th></tr></thead>
                <tbody>
                  {claims.map((c) => {
                    const expired = c.expires_on && c.expires_on < today;
                    return (
                      <tr key={c.id}>
                        <td>{c.code}</td><td>{c.topic}</td><td>{c.approved_text}</td><td>{c.source}</td>
                        <td>{c.expires_on} {expired ? <span className="chip high">expired</span> : <span className="chip approved">valid</span>}</td>
                        <td>{role === "Admin" && <button className="btn gray" onClick={() => renewClaim(c)}>Re-verify</button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {role === "Admin" ? (
                <>
                  <h2 style={{ marginTop: 16 }}>Add an approved fact</h2>
                  <div className="grid2">
                    <div><label>Topic</label><input type="text" value={newFact.topic} onChange={(e) => setNewFact({ ...newFact, topic: e.target.value })} placeholder="e.g. Uptime" /></div>
                    <div><label>Words that trigger this fact (comma separated)</label><input type="text" value={newFact.keywords} onChange={(e) => setNewFact({ ...newFact, keywords: e.target.value })} placeholder="uptime,available" /></div>
                    <div><label>Approved text</label><input type="text" value={newFact.approved_text} onChange={(e) => setNewFact({ ...newFact, approved_text: e.target.value })} placeholder="99.9% uptime" /></div>
                    <div><label>Approved number (optional)</label><input type="number" value={newFact.approved_number} onChange={(e) => setNewFact({ ...newFact, approved_number: e.target.value })} placeholder="99.9" /></div>
                    <div><label>Source</label><input type="text" value={newFact.source} onChange={(e) => setNewFact({ ...newFact, source: e.target.value })} placeholder="Status report Oct 2026" /></div>
                    <div><label>Expires on</label><input type="date" value={newFact.expires_on} onChange={(e) => setNewFact({ ...newFact, expires_on: e.target.value })} /></div>
                  </div>
                  <button className="btn" onClick={addFact}>Add fact</button>
                </>
              ) : (
                <p className="note">Switch the demo role to "Admin" to add or re-verify facts.</p>
              )}
            </div>
            <div className="card">
              <h2>Brand guidelines (rules)</h2>
              <table>
                <thead><tr><th>Code</th><th>Rule</th><th>Type</th><th>Severity</th><th>Guideline text</th></tr></thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id}><td>{r.code}</td><td>{r.title}</td><td>{r.kind}</td><td><span className={"chip " + r.severity}>{r.severity}</span></td><td>{r.source_text}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ---------------- DASHBOARD ---------------- */}
        {tab === "dashboard" && (
          <div>
            <div className="stats" style={{ marginBottom: 14 }}>
              <div className="stat"><b>{subs.length}</b>Submissions</div>
              <div className="stat"><b>{dash.total}</b>Issues caught</div>
              <div className="stat"><b>{dash.approved}</b>Approved</div>
              <div className="stat"><b>{dash.list.length}</b>Different rules triggered</div>
            </div>
            <div className="card">
              <h2>Most repeated mistakes</h2>
              {dash.list.length === 0 && <p className="note">No data yet. Submit content for review{role === "Admin" ? ", or reset the demo data below." : "."}</p>}
              {dash.list.map((r) => (
                <div className="barrow" key={r.code}>
                  <div>{r.code} {r.title}</div>
                  <div><div className="bar" style={{ width: Math.max(4, (r.n / maxN) * 100) + "%" }} /></div>
                  <div>{r.n}</div>
                </div>
              ))}
              {role === "Admin" && <button className="btn alt" onClick={seedDemo}>Reset demo data</button>}
            </div>
            <div className="card">
              <h2>Guideline health insights</h2>
              {dash.insights.length === 0 && <p className="note">No problems found yet. Insights appear when a rule keeps being broken or often dismissed.</p>}
              {dash.insights.map((t, i) => <div className="insight" key={i}>{t}</div>)}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
