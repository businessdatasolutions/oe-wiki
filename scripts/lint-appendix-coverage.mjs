#!/usr/bin/env node
// Read-only walker over wiki/sources/*.md.
//
// Checks the v0.5+ appendix-coverage contract from CLAUDE.md §Appendix content
// extraction and the D6 dimension in
// .claude/skills/scientific-papers-processing/quality-rubric.md.
//
// Reports per-source verdicts:
//   PASS   — source has no appendix material (no D6) OR has a proper
//            ## Appendix content section with at least one well-formed entry.
//   WARN   — appendix is mentioned but the source page does not carry a
//            ## Appendix content section. Distinguishes:
//              * D6=0 (silent omission: no caveat)
//              * D6=1 (acknowledged but deferred: caveat present)
//            Both are below the D6 floor (2) and should be addressed
//            opportunistically per CLAUDE.md §Appendix content extraction.
//   FAIL   — ## Appendix content section exists but is malformed:
//            no ### Appendix entries; entries missing **Type:**, **Location:**,
//            or **Reproduction:** lines; **Reproduction:** wikilinks to
//            concept pages that don't exist in wiki/concepts/.
//
// Output:
//   Per-source verdict line, then a summary table grouped by verdict.
//
// Never edits files. Run from repo root with:
//   node scripts/lint-appendix-coverage.mjs
//
// Exits 1 when any WARN or FAIL findings; 0 when all PASS — usable as a
// CI / pre-commit check or periodic corpus-health sweep. Per CLAUDE.md
// §Hooks, NOT wired into PostToolUse — a corpus-wide walk on every edit
// would thrash. Invoke manually after each ingest batch.

import { readdir, readFile } from "node:fs/promises"
import { join, dirname, basename, relative } from "node:path"
import { fileURLToPath } from "node:url"
import matter from "gray-matter"
import { stripQualityReview } from "./_lib/source-page.mjs"

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const SOURCES_DIR = join(REPO_ROOT, "wiki/sources")
const CONCEPTS_DIR = join(REPO_ROOT, "wiki/concepts")

const APPENDIX_MENTION_RE = /\bappendix\b|\bsupplementary material\b|\bonline appendix\b|\bweb appendix\b/i
const CAVEAT_RE = /not transcribed|not opened|not in scope|not yet|deferred|skipped|referenced but/i
const APPENDIX_SECTION_RE = /^## Appendix content\s*$/m
const APPENDIX_ENTRY_RE = /^### Appendix\b/m

async function listMarkdown(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    const files = []
    for (const entry of entries) {
      if (entry.isDirectory()) continue
      if (!entry.name.endsWith(".md")) continue
      files.push(join(dir, entry.name))
    }
    return files
  } catch {
    return []
  }
}

async function loadConceptSlugs() {
  const files = await listMarkdown(CONCEPTS_DIR)
  return new Set(files.map((f) => basename(f, ".md")))
}

// Extract the body of ## Appendix content (up to the next ## heading or EOF).
function extractAppendixSection(body) {
  const headerMatch = body.match(APPENDIX_SECTION_RE)
  if (!headerMatch) return null
  const start = headerMatch.index + headerMatch[0].length
  const rest = body.slice(start)
  const nextHeader = rest.match(/^## /m)
  return nextHeader ? rest.slice(0, nextHeader.index) : rest
}

// Split appendix section into individual entries (### Appendix ... blocks).
function splitAppendixEntries(sectionBody) {
  const entries = []
  const headerRe = /^### Appendix[^\n]*$/gm
  const matches = [...sectionBody.matchAll(headerRe)]
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index
    const end = i + 1 < matches.length ? matches[i + 1].index : sectionBody.length
    entries.push({ heading: matches[i][0].trim(), body: sectionBody.slice(start, end) })
  }
  return entries
}

// Pull the slug from a [[wikilink]] inside a **Reproduction:** line.
function extractReproductionConceptSlugs(entryBody) {
  const reproLine = entryBody.match(/^\*\*Reproduction:\*\*[^\n]*/m)
  if (!reproLine) return []
  const wikilinks = [...reproLine[0].matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)]
  return wikilinks.map((m) => m[1].trim())
}

function checkEntry(entry) {
  const issues = []
  const required = ["**Type:**", "**Location:**", "**Reproduction:**"]
  for (const field of required) {
    if (!entry.body.includes(field)) issues.push(`missing ${field} in '${entry.heading}'`)
  }
  return issues
}

async function checkSource(file, conceptSlugs) {
  const raw = await readFile(file, "utf8")
  const parsed = matter(raw)
  const fm = parsed.data
  const body = parsed.content
  const length = String(fm.length || "")

  // Strip ## Quality review before scanning source content. (Shared helper;
  // see scripts/_lib/source-page.mjs for why this matters.)
  const bodyForDetection = stripQualityReview(body)

  const hasMentionBody = APPENDIX_MENTION_RE.test(bodyForDetection)
  const hasMentionLength = APPENDIX_MENTION_RE.test(length)
  const hasAnyMention = hasMentionBody || hasMentionLength

  const appendixSection = extractAppendixSection(body)
  const hasCaveat = CAVEAT_RE.test(bodyForDetection) || CAVEAT_RE.test(length)

  // Case A: no appendix material referenced anywhere AND no section → PASS (N/A)
  if (!hasAnyMention && !appendixSection) {
    return { file, verdict: "PASS", reason: "no appendix material; D6 = N/A", issues: [] }
  }

  // Case B: section present — validate structure
  if (appendixSection) {
    const entries = splitAppendixEntries(appendixSection)
    if (entries.length === 0) {
      return {
        file,
        verdict: "FAIL",
        reason: "## Appendix content section exists but no ### Appendix entries",
        issues: [],
      }
    }
    const allIssues = []
    for (const entry of entries) {
      allIssues.push(...checkEntry(entry))
    }
    // Concept-page link validation
    const referencedSlugs = entries.flatMap((e) => extractReproductionConceptSlugs(e.body))
    const brokenLinks = referencedSlugs.filter((slug) => !conceptSlugs.has(slug))
    for (const slug of brokenLinks) {
      allIssues.push(`broken concept-page wikilink in **Reproduction:**: [[${slug}]] not found in wiki/concepts/`)
    }
    if (allIssues.length > 0) {
      return {
        file,
        verdict: "FAIL",
        reason: `${entries.length} ### Appendix entries; ${allIssues.length} structural issue(s)`,
        issues: allIssues,
      }
    }
    return {
      file,
      verdict: "PASS",
      reason: `${entries.length} ### Appendix ${entries.length === 1 ? "entry" : "entries"}, all well-formed`,
      issues: [],
    }
  }

  // Case C: appendix mentioned, no section → WARN (D6=0 or D6=1)
  return {
    file,
    verdict: "WARN",
    reason: hasCaveat
      ? "appendix mentioned with caveat but no ## Appendix content section (D6 = 1, below floor)"
      : "appendix mentioned without caveat and no ## Appendix content section (D6 = 0, silent omission)",
    issues: [],
  }
}

const sourceFiles = await listMarkdown(SOURCES_DIR)
const conceptSlugs = await loadConceptSlugs()
const results = []
for (const file of sourceFiles) {
  results.push(await checkSource(file, conceptSlugs))
}

// Sort: FAIL > WARN > PASS, then by file path
const verdictOrder = { FAIL: 0, WARN: 1, PASS: 2 }
results.sort((a, b) => {
  const v = verdictOrder[a.verdict] - verdictOrder[b.verdict]
  if (v !== 0) return v
  return a.file.localeCompare(b.file)
})

console.log(`lint-appendix-coverage.mjs — scanned ${results.length} source page(s)`)
console.log()
console.log("verdict | path | reason")
console.log("--------+------+-------")
for (const r of results) {
  const rel = relative(REPO_ROOT, r.file)
  console.log(`${r.verdict.padEnd(7)} | ${rel} | ${r.reason}`)
  for (const issue of r.issues) {
    console.log(`        |   └─ ${issue}`)
  }
}

const counts = { PASS: 0, WARN: 0, FAIL: 0 }
for (const r of results) counts[r.verdict]++
console.log()
console.log(`Summary: PASS = ${counts.PASS}, WARN = ${counts.WARN}, FAIL = ${counts.FAIL}`)

const hasFindings = counts.WARN > 0 || counts.FAIL > 0
if (hasFindings) {
  console.log()
  console.log(
    "Reminder: WARN/FAIL pages should be addressed opportunistically per CLAUDE.md §Appendix content extraction. " +
      "Backfill is not bulk-mandatory — re-open pages during related ingests or queries.",
  )
}

process.exit(hasFindings ? 1 : 0)
