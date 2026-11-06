# BrandProof by Innovexa

Brand governance with receipts: review content before it goes live.

## What works in Round 2
- Rule-based checker: tone, terminology, unsupported claims, missing alt text (every finding cites a guideline or approved fact)
- Claim Ledger: approved facts with expiry dates; wrong or expired facts are flagged
- One-click "Accept fix" or "Dismiss" (a person always decides)
- Optional AI rewrite (Gemini) that keeps the creator's intent
- Review queue: send for review, comments, approve / request changes, revision history, resubmit
- Demo roles: Creator, Reviewer, Admin (role switcher)
- Guideline insights dashboard: repeated mistakes and possibly unclear rules

## Not built yet (Round 3 plan)
- Real database and real login with role-based access (data is saved in the browser for now)
- Image analysis (palette, contrast), PDF / DOCX upload
- Privacy masking before AI calls

## Tech
Next.js 14 (React), browser storage for Round 2, Gemini API (optional), deployed on Vercel.

## Setup
1. Upload all files to a GitHub repository (package.json must be at the top level).
2. Vercel: import the repo. Optional: add GEMINI_API_KEY (see ENV_EXAMPLE.txt). Deploy.
