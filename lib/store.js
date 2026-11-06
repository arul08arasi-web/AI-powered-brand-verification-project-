// Simple browser storage (localStorage) so the app needs no database for Round 2.
// Round 3 plan: replace this file with a real database (Supabase) and real login.

const K = { rules: "bp_rules", claims: "bp_claims", subs: "bp_subs", act: "bp_activity", seeded: "bp_seeded_v1" };

function read(key, fallback) {
  try {
    const v = window.localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) {
    return fallback;
  }
}
function write(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString();
}

const RULES = [
  { code: "BV-2.1", title: "Urgency pressure", kind: "tone", pattern: "grab it now|hurry|don'?t miss out|act fast|last chance|limited time only", flags: "gi", severity: "medium",
    why: "Pressure language conflicts with a calm, confident brand voice.", source_text: "Brand Voice 2.1: confident, calm, no hype.", suggestion: "Available today", fix_hint: null },
  { code: "BV-2.2", title: "Shouting punctuation", kind: "tone", pattern: "!{2,}", flags: "g", severity: "medium",
    why: "Repeated exclamation marks read as shouting.", source_text: "Brand Voice 2.2: at most one exclamation mark.", suggestion: ".", fix_hint: null },
  { code: "BV-2.3", title: "Hype words", kind: "tone", pattern: "revolutionary|game-?changing|cutting-edge|next-?gen|world-?class", flags: "gi", severity: "low",
    why: "Hype words sound promotional and are hard to prove.", source_text: "Brand Voice 2.3: prefer plain, specific words.", suggestion: "modern", fix_hint: null },
  { code: "BV-3.1", title: "Off-brand term: cheap", kind: "terminology", pattern: "\\bcheap\\b", flags: "gi", severity: "medium",
    why: "Our approved word is \"affordable\".", source_text: "Terminology 3.1: say \"affordable\", not \"cheap\".", suggestion: "affordable", fix_hint: null },
  { code: "BV-3.2", title: "Off-brand term: guys", kind: "terminology", pattern: "\\bguys\\b", flags: "gi", severity: "low",
    why: "We use inclusive address.", source_text: "Terminology 3.2: say \"everyone\" or \"team\".", suggestion: "everyone", fix_hint: null },
  { code: "BV-4.1", title: "Unsupported superlative claim", kind: "claim",
    pattern: "(?:the\\s+)?world['’]s\\s+(?:#\\s?1|number\\s+one|best|first|leading)(?:\\s+\\w+)?|best\\s+in\\s+(?:the\\s+)?world|\\bfastest\\b|\\bcheapest\\b|\\bguaranteed\\b|100%\\s+(?:safe|secure|accurate)",
    flags: "gi", severity: "high", why: "This claim has no approved evidence in the Claim Ledger.", source_text: "Claims 4.1: superlatives need proof.", suggestion: null,
    fix_hint: "Remove the claim, or add evidence to the Claim Ledger." },
  { code: "BV-4.2", title: "Unsupported numeric claim", kind: "claim", pattern: "\\d[\\d,]*\\+?\\s+(?:customers|users|teams|companies|clients)", flags: "gi", severity: "high",
    why: "This number is not backed by an approved fact.", source_text: "Claims 4.2: numbers need a source.", suggestion: null,
    fix_hint: "Add a verified entry to the Claim Ledger, or remove the number." },
  { code: "BV-4.3", title: "Unsupported percentage claim", kind: "claim", pattern: "\\b\\d+(?:\\.\\d+)?\\s?%", flags: "gi", severity: "high",
    why: "This percentage is not backed by an approved fact.", source_text: "Claims 4.3: percentages need a source.", suggestion: null,
    fix_hint: "Add a verified entry to the Claim Ledger, or remove the percentage." },
];

const CLAIMS = [
  { code: "C-001", topic: "Pro plan price", keywords: "pro plan,/month,per month", approved_text: "$24/month", approved_number: 24, source: "Pricing sheet (Oct 2026)", expires_on: "2027-03-31" },
  { code: "C-002", topic: "Free trial length", keywords: "free trial", approved_text: "14 days", approved_number: 14, source: "Product page", expires_on: "2027-06-30" },
  { code: "C-003", topic: "Security certification", keywords: "iso 27001", approved_text: "ISO 27001 certified", approved_number: null, source: "Audit report 2025", expires_on: "2026-10-01" },
  { code: "C-004", topic: "Customer count", keywords: "customers", approved_text: "2,000+ customers", approved_number: 2000, source: "CRM export (Sep 2026)", expires_on: "2026-12-31" },
];

function demoData() {
  const f = (ruleCode, ruleTitle, kind, severity, snippet, status) => ({ ruleCode, ruleTitle, kind, severity, snippet, status });
  const subs = [
    { id: "demo1", title: "Launch post", author: "Agency A (demo)", status: "approved", created_at: daysAgo(6), updated_at: daysAgo(5),
      content: "Meet the all-new Pro plan. Built for growing teams. Available today.", include_image: false, alt_text: "",
      findings: [f("BV-4.1", "Unsupported superlative claim", "claim", "high", "the world's #1 CRM", "fixed"), f("BV-2.1", "Urgency pressure", "tone", "medium", "Grab it NOW", "fixed")] },
    { id: "demo2", title: "Pricing email", author: "Agency A (demo)", status: "approved", created_at: daysAgo(5), updated_at: daysAgo(4),
      content: "The Pro plan is $24/month for every team.", include_image: false, alt_text: "",
      findings: [f("C-001", "Outdated or incorrect fact", "claim", "high", "$19/month", "fixed"), f("BV-4.1", "Unsupported superlative claim", "claim", "high", "fastest", "fixed")] },
    { id: "demo3", title: "Webinar banner", author: "Intern (demo)", status: "pending", created_at: daysAgo(3), updated_at: daysAgo(3),
      content: "Join our webinar this Friday!!", include_image: true, alt_text: "",
      findings: [f("BV-2.2", "Shouting punctuation", "tone", "medium", "!!", "dismissed"), f("A11Y-1.1", "Image has no alt text", "accessibility", "medium", "[image]", "open")] },
    { id: "demo4", title: "Case study", author: "Agency B (demo)", status: "changes_requested", created_at: daysAgo(2), updated_at: daysAgo(1),
      content: "We are the best in the world and 90% of clients agree.", include_image: false, alt_text: "",
      findings: [f("BV-4.1", "Unsupported superlative claim", "claim", "high", "best in the world", "open"), f("BV-4.3", "Unsupported percentage claim", "claim", "high", "90%", "open")] },
    { id: "demo5", title: "Blog intro", author: "Intern (demo)", status: "approved", created_at: daysAgo(1), updated_at: daysAgo(1),
      content: "Our cutting-edge, revolutionary tool is here.", include_image: false, alt_text: "",
      findings: [f("BV-2.3", "Hype words", "tone", "low", "cutting-edge", "dismissed"), f("BV-2.3", "Hype words", "tone", "low", "revolutionary", "dismissed"), f("BV-2.3", "Hype words", "tone", "low", "next-gen", "fixed")] },
  ];
  const act = [
    { id: uid(), submission_id: "demo1", actor: "Agency A (demo)", role: "Creator", action: "submitted", note: "Sent for review with 0 open issue(s)", snapshot: null, created_at: daysAgo(6) },
    { id: uid(), submission_id: "demo1", actor: "Reviewer (demo)", role: "Reviewer", action: "approved", note: "Looks good.", snapshot: null, created_at: daysAgo(5) },
    { id: uid(), submission_id: "demo4", actor: "Agency B (demo)", role: "Creator", action: "submitted", note: "Sent for review with 2 open issue(s)", snapshot: null, created_at: daysAgo(2) },
    { id: uid(), submission_id: "demo4", actor: "Reviewer (demo)", role: "Reviewer", action: "changes_requested", note: "Please remove the superlative and source the 90% figure.", snapshot: null, created_at: daysAgo(1) },
  ];
  return { subs, act };
}

export function seedIfNeeded() {
  if (read(K.seeded, false)) return;
  resetAll();
}

export function resetAll() {
  const d = demoData();
  write(K.rules, RULES.map((r) => ({ ...r, id: r.code })));
  write(K.claims, CLAIMS.map((c) => ({ ...c, id: c.code })));
  write(K.subs, d.subs);
  write(K.act, d.act);
  write(K.seeded, true);
}

export const getRules = () => read(K.rules, []);
export const getClaims = () => read(K.claims, []);
export const getSubs = () => read(K.subs, []).slice().sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
export const getActivity = (id) => read(K.act, []).filter((a) => a.submission_id === id).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

export function insertSub(row) {
  const now = new Date().toISOString();
  const rec = { ...row, id: uid(), created_at: now, updated_at: now };
  write(K.subs, [...read(K.subs, []), rec]);
  return rec;
}
export function updateSub(id, patch) {
  const now = new Date().toISOString();
  write(K.subs, read(K.subs, []).map((s) => (s.id === id ? { ...s, ...patch, updated_at: now } : s)));
}
export function addActivity(row) {
  write(K.act, [...read(K.act, []), { ...row, id: uid(), created_at: new Date().toISOString() }]);
}
export function insertClaim(row) {
  write(K.claims, [...read(K.claims, []), { ...row, id: uid() }]);
}
export function updateClaim(id, patch) {
  write(K.claims, read(K.claims, []).map((c) => (c.id === id ? { ...c, ...patch } : c)));
}
