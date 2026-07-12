#!/usr/bin/env node
// v0.6 quality slice — source-page scorer with optional LLM-as-judge overlay.
//
// Companion to scripts/quality-score.mjs (which scores concepts and syntheses).
// This scorer's scope is wiki/sources/*.md filtered to `kind: paper` only —
// other source kinds (reports, videos, articles) drop out, by design.
//
// Two phases:
//
//   1) MECHANICAL FLOOR (always runs) — structural lint per quality-rubric.md
//      dimensions D1-D6. Each dim caps at 2 (level-3 requires judgment).
//      Notes flag missing sections, thin word counts, missing literal phrases.
//
//   2) LLM-AS-JUDGE OVERLAY (when --judge passed) — invokes headless Claude
//      Code (`claude -p ...`) with the rubric + page body + floor as guard
//      rails. Returns per-dim judgment scores 0-3 plus reasoning. Soft-floor
//      rule: judgment may go below floor only with an explicit reason
//      (per quality-rubric.md: "never overridden silently").
//
// JSONL log shape (logs/quality-source-pages.jsonl):
//   - Floor-only run (no --judge):
//       { kind: "mechanical-floor", scores: <floor>, total: <floor_total>,
//         band: <by floor>, notes: <floor_notes>, ... }
//   - Floor + judgment run:
//       { kind: "mechanical-floor + llm-judgment",
//         floor, floor_total, floor_notes,
//         judgment, judgment_reasoning, judgment_total, judgment_summary,
//         judgment_warnings, judge_model,
//         scores, total, band, notes  ← point at JUDGMENT for tooling compat
//       }
//
// Important: judgment scores never write back to source pages or frontmatter.
// Every re-run starts from a clean slate — the wiki page is the only input,
// the JSONL log is the only output.
//
// Usage:
//   node scripts/quality-source-page.mjs                     # floor only, all papers
//   node scripts/quality-source-page.mjs --page <slug>       # one page
//   node scripts/quality-source-page.mjs --judge             # floor + LLM judge, all papers
//   node scripts/quality-source-page.mjs --judge --page <s>  # one page with judge

import { readFileSync, appendFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { spawn } from "node:child_process"
import { join, basename, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import matter from "gray-matter"
import { stripQualityReview, readCanonicalRubricVersion, RUBRIC_PATH } from "./_lib/source-page.mjs"
import { runLLMJudge } from "./_lib/llm-judge.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, "..")
const NO_LOG = process.argv.includes("--no-log")
const NO_HTML = process.argv.includes("--no-html")
const JUDGE = process.argv.includes("--judge")
const pageArgIdx = process.argv.indexOf("--page")
const PAGE_ARG = pageArgIdx >= 0 ? process.argv[pageArgIdx + 1] : null

const TARGET_DIR = "wiki/sources"
const LOG_DIR = join(REPO_ROOT, "logs")
const LOG_FILE = join(LOG_DIR, "quality-source-pages.jsonl")
const RUBRIC_VERSION = await readCanonicalRubricVersion()

// Only `kind: paper` pages are subject to this rubric. Other kinds (reports,
// videos, articles) drop out — the Keshav 3-pass + IMRaD rubric does not
// fit them. See plan: "Only the papers need scoring."
const SCORED_KIND = "paper"

function walk(dir) {
  const out = []
  try {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) out.push(...walk(p))
      else if (name.endsWith(".md")) out.push(p)
    }
  } catch {}
  return out
}

// Split body into sections keyed by H2 heading. Returns { heading: bodyText }.
function splitSections(body) {
  const sections = {}
  const headerRe = /^(## .+)$/gm
  const matches = [...body.matchAll(headerRe)]
  for (let i = 0; i < matches.length; i++) {
    const heading = matches[i][1].trim()
    const start = matches[i].index + matches[i][0].length
    const end = i + 1 < matches.length ? matches[i + 1].index : body.length
    sections[heading] = body.slice(start, end)
  }
  return sections
}

function wordCount(s) {
  return s.split(/\s+/).filter((w) => w.length > 0).length
}

function findSection(sections, patterns) {
  for (const heading of Object.keys(sections)) {
    const h = heading.toLowerCase()
    if (patterns.some((p) => h.includes(p.toLowerCase()))) {
      return sections[heading]
    }
  }
  return null
}

function scoreD1(sections) {
  const notes = []
  let score = 0
  const hasTLDR = findSection(sections, ["tl;dr", "tldr"]) !== null
  const hasContext = findSection(sections, ["context", "why"]) !== null
  if (hasTLDR) score++
  else notes.push("no ## TL;DR section")
  if (hasContext) score++
  else notes.push("no ## Context (WHY) section")
  return { score: Math.min(2, score), notes, ceiling: 2 }
}

function scoreD2(sections) {
  const notes = []
  const why = findSection(sections, ["why", "context"])
  const how = findSection(sections, ["how", "methods"])
  const what = findSection(sections, ["what", "results"])
  const sowhat = findSection(sections, ["so what", "discussion", "significance"])

  const present = [why, how, what, sowhat].filter((s) => s !== null).length
  if (present === 0) {
    notes.push("no IMRaD sections detected")
    return { score: 0, notes, ceiling: 2 }
  }
  if (present < 4) {
    const missing = []
    if (!why) missing.push("WHY/Context")
    if (!how) missing.push("HOW/Methods")
    if (!what) missing.push("WHAT/Results")
    if (!sowhat) missing.push("SO-WHAT/Discussion")
    notes.push(`missing IMRaD sections: ${missing.join(", ")}`)
    return { score: 1, notes, ceiling: 2 }
  }
  const wcs = { why: wordCount(why), how: wordCount(how), what: wordCount(what), sowhat: wordCount(sowhat) }
  const thin = Object.entries(wcs).filter(([_, n]) => n < 100)
  if (thin.length > 0) {
    notes.push(`thin sections (<100 words): ${thin.map(([k, n]) => `${k}=${n}`).join(", ")}`)
    return { score: 1, notes, ceiling: 2 }
  }
  return { score: 2, notes, ceiling: 2 }
}

function scoreD3(body, sections) {
  const notes = []
  const figureMatches = [...body.matchAll(/\b(?:Figure|Fig\.?)\s+\d+/gi)]
  const tableMatches = [...body.matchAll(/\bTable\s+\d+/g)]
  const hasArtifactsSection = findSection(sections, ["distinctive artifacts", "distinctive artefacts"]) !== null

  const totalMentions = figureMatches.length + tableMatches.length

  let score
  if (totalMentions === 0 && !hasArtifactsSection) {
    score = 0
    notes.push("no Figure/Table mentions; no ## Distinctive artifacts section")
  } else if (!hasArtifactsSection) {
    score = 1
    notes.push(
      `${figureMatches.length} figure mention(s), ${tableMatches.length} table mention(s); no ## Distinctive artifacts section`,
    )
  } else if (totalMentions > 0 && hasArtifactsSection) {
    score = 2
  } else {
    score = 1
    notes.push("## Distinctive artifacts section exists but no Figure/Table mentions")
  }
  return { score, notes, ceiling: 2 }
}

function scoreD4(body) {
  const notes = []
  // Accept either word order: "Limitations the authors acknowledge" OR
  // "Limitations acknowledged by (the) authors" — both surface across the
  // corpus and the rubric language does not enforce one.
  const hasAck =
    /limitations the authors? acknowledge/i.test(body) ||
    /limitations? acknowledged by (the )?authors?/i.test(body)
  const hasNotFlagged = /limitations? not flagged/i.test(body)
  let score = 0
  if (hasAck) score++
  else notes.push("no \"Limitations the authors acknowledge\" / \"Limitations acknowledged by authors\" phrase")
  if (hasNotFlagged) score++
  else notes.push("no \"Limitations not flagged\" phrase")
  return { score, notes, ceiling: 2 }
}

function scoreD5(fm, body) {
  const length = String(fm.length || "")
  if (!/pass\s*3/i.test(length)) {
    return { score: null, notes: [], ceiling: null }
  }
  const notes = []
  const markers = [
    { pat: /implicit assumption/i, label: "implicit-assumptions" },
    { pat: /missing citation/i, label: "missing-citations" },
    { pat: /(strong|weak) points?/i, label: "strong/weak-points" },
    { pat: /(technique|methodolog\w+) issue/i, label: "technique-issues" },
  ]
  const hits = markers.filter((m) => m.pat.test(body))
  const score = Math.min(2, hits.length)
  if (hits.length === 0) {
    notes.push("Pass 3 claimed but no Pass-3 marker phrases detected")
  } else {
    notes.push(`Pass-3 markers detected: ${hits.map((h) => h.label).join(", ")}`)
  }
  return { score, notes, ceiling: 2 }
}

function scoreD6(fm, body, sections) {
  const notes = []
  const length = String(fm.length || "")
  const appendixSection = findSection(sections, ["appendix content"])

  // Body-without-meta: strip §Quality review before scanning source content,
  // so meta-content rubric notes don't trip the appendix-mention detector.
  const bodyForMentionDetection = stripQualityReview(body)

  const appendixMentionRe = /\bappendix\b|\bsupplementary material\b|\bonline appendix\b|\bweb appendix\b/i
  const hasMentionInBody = appendixMentionRe.test(bodyForMentionDetection)
  const hasMentionInLength = appendixMentionRe.test(length)
  const hasAnyMention = hasMentionInBody || hasMentionInLength

  if (appendixSection !== null) {
    const promotionRe = /\*\*Reproduction:\*\*[^|\n]*\[\[[^\]]+\]\]/
    const hasPromotion = promotionRe.test(appendixSection)
    if (hasPromotion) {
      notes.push("## Appendix content present with concept-page promotion (D6=3 candidate; needs judgment)")
    } else {
      notes.push("## Appendix content present (D6=2 floor; D6=3 needs concept-page promotion)")
    }
    return { score: 2, notes, ceiling: 2 }
  }

  if (!hasAnyMention) {
    return { score: null, notes: [], ceiling: null }
  }

  const caveatRe = /not transcribed|not opened|not in scope|not yet|deferred|skipped|referenced but/i
  const hasCaveat = caveatRe.test(body) || caveatRe.test(length)

  if (hasCaveat) {
    notes.push("appendix mentioned + caveat present; no ## Appendix content section → D6=1 (acknowledged but deferred)")
    return { score: 1, notes, ceiling: 2 }
  }

  notes.push("appendix mentioned without caveat; no ## Appendix content section → D6=0 (silent omission)")
  return { score: 0, notes, ceiling: 2 }
}

function scoreFloor(file) {
  const raw = readFileSync(file, 'utf8')
  const parsed = matter(raw)
  const fm = parsed.data
  const body = parsed.content
  const sections = splitSections(body)

  const d1 = scoreD1(sections)
  const d2 = scoreD2(sections)
  const d3 = scoreD3(body, sections)
  const d4 = scoreD4(body)
  const d5 = scoreD5(fm, body)
  const d6 = scoreD6(fm, body, sections)

  const isPass3 = d5.score !== null
  const appendixApplies = d6.score !== null
  const denominator = 12 + (isPass3 ? 3 : 0) + (appendixApplies ? 3 : 0)
  const sum =
    d1.score + d2.score + d3.score + d4.score +
    (isPass3 ? d5.score : 0) +
    (appendixApplies ? d6.score : 0)
  const total = Math.round((sum / denominator) * 100) / 100

  const notes = []
  for (const [k, r] of [["D1", d1], ["D2", d2], ["D3", d3], ["D4", d4], ["D5", d5], ["D6", d6]]) {
    for (const n of r.notes) notes.push(`${k}: ${n}`)
  }

  const depthClaim = typeof fm.length === "string" ? fm.length : null

  return {
    file,
    slug: basename(file, ".md"),
    fm,
    body,
    depthClaim,
    isPass3,
    appendixApplies,
    denominator,
    floor: { D1: d1.score, D2: d2.score, D3: d3.score, D4: d4.score, D5: d5.score, D6: d6.score },
    floor_total: total,
    floor_notes: notes,
  }
}

function bandFor(total) {
  if (total >= 0.85) return "ceiling"
  if (total >= 0.65) return "workable"
  return "below-floor"
}

// Build the JSONL entry for one page. Shape depends on whether judgment ran.
function buildLogEntry({ result, judgeResult, runMeta }) {
  // Always-present primary fields:
  const base = {
    ...runMeta,
    slug: result.slug,
    path: result.file.slice(REPO_ROOT.length + 1),
    depth_claim: result.depthClaim,
    is_pass3: result.isPass3,
    denominator: result.denominator,
  }

  if (!judgeResult) {
    // Floor-only entry — schema unchanged from pre-v0.6.
    const total = result.floor_total
    return {
      ...base,
      kind: "mechanical-floor",
      scores: result.floor,
      total,
      band: bandFor(total),
      notes: result.floor_notes,
    }
  }

  // Floor + judgment entry. Tooling-compat fields (scores/total/band/notes)
  // point at judgment so existing readers automatically see the higher signal.
  const total = judgeResult.judgment_total
  const combinedNotes = [
    ...result.floor_notes.map((n) => `floor: ${n}`),
    ...judgeResult.warnings.map((w) => `judgment: ${w}`),
  ]
  return {
    ...base,
    kind: "mechanical-floor + llm-judgment",
    floor: result.floor,
    floor_total: result.floor_total,
    floor_notes: result.floor_notes,
    judgment: judgeResult.judgment,
    judgment_reasoning: judgeResult.judgment_reasoning,
    judgment_total: judgeResult.judgment_total,
    judgment_summary: judgeResult.summary,
    judgment_warnings: judgeResult.warnings,
    judge_model: judgeResult.judge_model,
    // Backward-compatible aliases:
    scores: judgeResult.judgment,
    total,
    band: bandFor(total),
    notes: combinedNotes,
  }
}

// ----- Main -----

const sourcesDir = join(REPO_ROOT, TARGET_DIR)
const allFiles = walk(sourcesDir)

// Two filter stages: PAGE_ARG narrows to one slug; kind=paper drops non-papers.
const pageFiltered = allFiles.filter((f) => !PAGE_ARG || f.includes(PAGE_ARG))
const candidates = []
let skippedNonPaper = 0
for (const f of pageFiltered) {
  const raw = readFileSync(f, "utf8")
  const fm = matter(raw).data
  if (fm.kind === SCORED_KIND) candidates.push(f)
  else skippedNonPaper++
}

console.log(
  `quality-source-page.mjs — scoring ${candidates.length} ${SCORED_KIND} page(s)` +
    (skippedNonPaper > 0 ? ` (skipped ${skippedNonPaper} non-${SCORED_KIND} source(s))` : "") +
    (JUDGE ? " · LLM-as-judge enabled" : " · floor only"),
)
console.log("")

if (candidates.length === 0) {
  console.log("Nothing to score.")
  process.exit(0)
}

// Load rubric body once (judgment phase needs it). Strip frontmatter.
let rubricBody = ""
if (JUDGE) {
  const rubricRaw = await readFile(RUBRIC_PATH, "utf8")
  rubricBody = matter(rubricRaw).content
}

const results = []
for (const file of candidates) {
  const result = scoreFloor(file)
  let judgeResult = null
  if (JUDGE) {
    const rel = result.file.slice(REPO_ROOT.length + 1)
    process.stdout.write(`[judge] ${result.slug} … `)
    try {
      const bodyForJudge = stripQualityReview(result.body)
      judgeResult = await runLLMJudge({
        rubricBody,
        pageBody: bodyForJudge,
        floor: { ...result.floor, notes: result.floor_notes },
        denominator: result.denominator,
        slug: result.slug,
        depthClaim: result.depthClaim,
      })
      console.log(`ok (judgment_total=${judgeResult.judgment_total.toFixed(2)}, floor=${result.floor_total.toFixed(2)})`)
      if (judgeResult.warnings.length > 0) {
        for (const w of judgeResult.warnings) console.log(`   ⚠ ${w}`)
      }
    } catch (err) {
      console.log(`FAILED: ${err.message}`)
      console.log(`   (page ${rel} logged with floor only)`)
      judgeResult = null
    }
  }
  results.push({ result, judgeResult })
}

// Print summary table
results.sort((a, b) => (a.result.floor_total - b.result.floor_total))
console.log("")
console.log("total | D1 D2 D3 D4 D5 D6 | /denom | path")
console.log("------+-------------------+--------+-----")
for (const { result, judgeResult } of results) {
  const rel = result.file.slice(REPO_ROOT.length + 1)
  const display = judgeResult ? judgeResult.judgment : result.floor
  const total = judgeResult ? judgeResult.judgment_total : result.floor_total
  const cell = (v) => String(v === null ? "—" : v).padStart(2)
  const suffix = judgeResult ? " [J]" : ""
  console.log(
    `${total.toFixed(2)}  | ${cell(display.D1)} ${cell(display.D2)} ${cell(display.D3)} ${cell(display.D4)} ${cell(display.D5)} ${cell(display.D6)}  | /${String(result.denominator).padStart(2)}    | ${rel}${suffix}`,
  )
}

const dist = { ge85: 0, mid: 0, lt65: 0 }
for (const { result, judgeResult } of results) {
  const total = judgeResult ? judgeResult.judgment_total : result.floor_total
  if (total >= 0.85) dist.ge85++
  else if (total >= 0.65) dist.mid++
  else dist.lt65++
}
console.log(`\nDistribution: ≥0.85 = ${dist.ge85}, 0.65–0.85 = ${dist.mid}, <0.65 = ${dist.lt65}`)
if (JUDGE) {
  const judgedCount = results.filter((r) => r.judgeResult).length
  console.log(`Judgment: ran on ${judgedCount}/${results.length} page(s); [J] marks judgment rows above`)
}

// Append JSONL
const runMeta = {
  ts: new Date().toISOString(),
  rubric_version: RUBRIC_VERSION,
  scope: PAGE_ARG ? `page:${PAGE_ARG}` : "all",
  judge_requested: JUDGE,
}

let logWriteResult = { wrote: 0, skipped: NO_LOG }
if (!NO_LOG) {
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true })
    const lines = results.map(({ result, judgeResult }) =>
      JSON.stringify(buildLogEntry({ result, judgeResult, runMeta })),
    )
    appendFileSync(LOG_FILE, lines.join("\n") + "\n")
    logWriteResult = { wrote: lines.length, path: LOG_FILE }
    console.log(`\n[log] Appended ${lines.length} entr${lines.length === 1 ? "y" : "ies"} to ${LOG_FILE.slice(REPO_ROOT.length + 1)}`)
  } catch (err) {
    console.warn(`\n[log] could not write ${LOG_FILE}: ${err.message}`)
  }
} else {
  console.log("\n[log] --no-log passed; eval log not updated.")
}

// Print useful trend command
if (logWriteResult.wrote > 0) {
  console.log(`      View trends: node scripts/quality-log-summary.mjs [--page <slug>] [--latest N]`)
}

// Auto-chain HTML regen when entries were appended (unless --no-html).
if (logWriteResult.wrote > 0 && !NO_HTML) {
  console.log("\n[chain] Regenerating logs/quality-report.html …")
  const child = spawn("node", [join(__dirname, "quality-log-html.mjs")], { stdio: "inherit" })
  await new Promise((resolveChain) => {
    child.on("close", (code) => {
      if (code !== 0) console.warn(`[chain] quality-log-html.mjs exited ${code}`)
      resolveChain()
    })
    child.on("error", (err) => {
      console.warn(`[chain] failed to spawn quality-log-html.mjs: ${err.message}`)
      resolveChain()
    })
  })
}

if (!JUDGE) {
  console.log(
    "\nReminder: this run computed the MECHANICAL FLOOR only. To overlay LLM judgment scores, re-run with --judge.",
  )
}
