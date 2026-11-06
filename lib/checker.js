// BrandProof rule engine: every finding must cite a guideline or an approved fact.
// Runs in the browser, no AI needed. Fully explainable.

function splitSentences(text) {
  const out = [];
  const re = /[^.!?\n]+[.!?]*/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[0].trim().length > 0) out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

function keywordList(claim) {
  return (claim.keywords || "")
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
}

function fmtNumber(n) {
  return Number(n).toLocaleString("en-US");
}

export function runChecks({ text, includeImage, altText, rules, claims, today }) {
  const findings = [];
  const verified = [];
  const now = today ? new Date(today) : new Date();
  const sentences = splitSentences(text || "");
  const allKeywords = (claims || []).flatMap((c) => keywordList(c));

  // 1) Guideline rules (tone, terminology, unsupported claims)
  for (const rule of rules || []) {
    let re;
    try {
      const flags = (rule.flags || "gi").includes("g") ? rule.flags || "gi" : (rule.flags || "i") + "g";
      re = new RegExp(rule.pattern, flags);
    } catch (e) {
      continue; // ignore a broken pattern instead of crashing
    }
    let m;
    while ((m = re.exec(text || "")) !== null) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      const snippet = m[0];
      if (rule.kind === "claim") {
        // A claim is fine if the Claim Ledger covers it (handled in step 2).
        const covered = allKeywords.some((k) => snippet.toLowerCase().includes(k));
        if (covered) continue;
      }
      findings.push({
        id: rule.code + ":" + m.index,
        ruleCode: rule.code,
        ruleTitle: rule.title,
        kind: rule.kind,
        severity: rule.severity || "medium",
        snippet,
        start: m.index,
        end: m.index + snippet.length,
        why: rule.why,
        source: rule.source_text ? "Guideline " + rule.code + ": " + rule.source_text : "Guideline " + rule.code,
        suggestion: rule.suggestion === null || rule.suggestion === undefined ? null : rule.suggestion,
        hint: rule.fix_hint || null,
      });
    }
  }

  // 2) Claim Ledger: compare facts with approved facts and expiry dates
  for (const claim of claims || []) {
    const kws = keywordList(claim);
    for (const sent of sentences) {
      const sl = sent.text.toLowerCase();
      const kw = kws.find((k) => sl.includes(k));
      if (!kw) continue;
      const kwPos = sent.start + sl.indexOf(kw);
      const expired = claim.expires_on && new Date(claim.expires_on) < now;
      let mismatch = false;
      let confirmed = true;

      if (claim.approved_number !== null && claim.approved_number !== undefined && claim.approved_number !== "") {
        const approved = Number(claim.approved_number);
        const numRe = /(?<![#\w])\$?\s?\d[\d,]*(?:\.\d+)?(?:\s*(?:\/|per\s+)\s*(?:month|mo|year|yr))?/gi;
        const nums = [];
        let nm;
        while ((nm = numRe.exec(sent.text)) !== null) {
          const val = Number(nm[0].replace(/[^0-9.]/g, ""));
          nums.push({ token: nm[0], val, idx: nm.index });
        }
        if (nums.length === 0) confirmed = false; // keyword seen but no number to verify
        if (nums.length > 0 && !nums.some((n) => n.val === approved)) {
          mismatch = true;
          const wrong = nums[0];
          const startPos = sent.start + wrong.idx;
          let suggestion;
          if (/^\s*\$/.test(wrong.token) && /^\$/.test(claim.approved_text || "")) suggestion = claim.approved_text;
          else suggestion = fmtNumber(approved);
          findings.push({
            id: claim.code + ":" + startPos,
            ruleCode: claim.code,
            ruleTitle: "Outdated or incorrect fact",
            kind: "claim",
            severity: "high",
            snippet: wrong.token,
            start: startPos,
            end: startPos + wrong.token.length,
            why: "Content says " + wrong.token.trim() + " but the approved fact for \"" + claim.topic + "\" is " + claim.approved_text + ".",
            source: "Claim Ledger " + claim.code + ": " + claim.approved_text + " (" + claim.source + ")",
            suggestion,
            hint: null,
          });
        }
      }

      if (expired) {
        findings.push({
          id: claim.code + ":exp:" + kwPos,
          ruleCode: claim.code,
          ruleTitle: "Approved fact has expired",
          kind: "claim",
          severity: "high",
          snippet: sent.text.substr(sl.indexOf(kw), kw.length),
          start: kwPos,
          end: kwPos + kw.length,
          why: "The ledger entry for \"" + claim.topic + "\" expired on " + claim.expires_on + ", so it must be re-verified before publishing.",
          source: "Claim Ledger " + claim.code + ": " + claim.approved_text + " (" + claim.source + ")",
          suggestion: null,
          hint: "Re-verify this fact, update its expiry date in the Brand Kit, or remove it.",
        });
      } else if (!mismatch && confirmed && !verified.find((v) => v.code === claim.code)) {
        verified.push({ code: claim.code, topic: claim.topic, approved_text: claim.approved_text, source: claim.source });
      }
    }
  }

  // 3) Accessibility
  if (includeImage && !(altText || "").trim()) {
    findings.push({
      id: "A11Y-1.1:img",
      ruleCode: "A11Y-1.1",
      ruleTitle: "Image has no alt text",
      kind: "accessibility",
      severity: "medium",
      snippet: "[image]",
      start: -1,
      end: -1,
      why: "People using screen readers cannot understand an image without a text description.",
      source: "WCAG 1.1.1 Non-text Content",
      suggestion: null,
      hint: "Write a short description of the image in the alt text box.",
    });
  }

  findings.sort((a, b) => a.start - b.start);
  return { findings, verified };
}

export function applyFix(text, finding) {
  if (finding.suggestion === null || finding.suggestion === undefined || finding.start < 0) return text;
  return text.slice(0, finding.start) + finding.suggestion + text.slice(finding.end);
}
