#!/usr/bin/env node
// Read-only walker over wiki/sources/*.md.
//
// Surfaces *rubric-version drift* — source pages whose `## Quality review`
// block declares an older `| Rubric version | X.Y |` than the canonical
// version in the rubric's YAML frontmatter
// (`.claude/skills/scientific-papers-processing/quality-rubric.md`).
//
// When a rubric bumps (e.g. 1.0 → 1.1 adds D6), this script tells you which
// pages still carry the old rubric and therefore lack the new dimensions in
// their Quality Review block. The fix is editorial (add the new row with a
// judgment value) — this lint just makes the gap visible.
//
// Output: per-source verdict line, summary, plus a one-line action hint.
// Exits non-zero when any drift is detected — usable as a CI check or as a
// follow-on to the rubric.md PostToolUse hook chain.
//
// Run from repo root with:
//   node scripts/lint-rubric-version-drift.mjs

import { readdir, readFile } from "node:fs/promises"
import { join, dirname, relative } from "node:path"
import { fileURLToPath } from "node:url"
import {
  readCanonicalRubricVersion,
  extractPageRubricVersion,
} from "./_lib/source-page.mjs"

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const SOURCES_DIR = join(REPO_ROOT, "wiki/sources")

async function listMarkdown(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries
      .filter((e) => !e.isDirectory() && e.name.endsWith(".md"))
      .map((e) => join(dir, e.name))
  } catch {
    return []
  }
}

const canonical = await readCanonicalRubricVersion()
if (canonical === "unknown") {
  console.error(
    "[error] Could not read rubric_version from quality-rubric.md frontmatter.",
  )
  process.exit(2)
}

const sourceFiles = await listMarkdown(SOURCES_DIR)
const results = []
for (const file of sourceFiles) {
  const raw = await readFile(file, "utf8")
  // Strip frontmatter manually (don't pull gray-matter just for this — keep deps lean)
  const body = raw.startsWith("---\n")
    ? raw.slice(raw.indexOf("\n---\n", 4) + 5)
    : raw
  const pageVersion = extractPageRubricVersion(body)
  if (pageVersion === null) {
    results.push({
      file,
      verdict: "MISSING",
      pageVersion: null,
      reason: "no `| Rubric version | X.Y |` row found in ## Quality review block",
    })
    continue
  }
  if (pageVersion === canonical) {
    results.push({ file, verdict: "PASS", pageVersion, reason: "" })
  } else {
    results.push({
      file,
      verdict: "DRIFT",
      pageVersion,
      reason: `page at v${pageVersion}, canonical is v${canonical}`,
    })
  }
}

// Sort: DRIFT > MISSING > PASS, then by path
const verdictOrder = { DRIFT: 0, MISSING: 1, PASS: 2 }
results.sort((a, b) => {
  const v = verdictOrder[a.verdict] - verdictOrder[b.verdict]
  if (v !== 0) return v
  return a.file.localeCompare(b.file)
})

console.log(
  `lint-rubric-version-drift.mjs — canonical rubric v${canonical}; scanned ${results.length} source page(s)`,
)
console.log()
console.log("verdict | page v | path | reason")
console.log("--------+--------+------+-------")
for (const r of results) {
  const rel = relative(REPO_ROOT, r.file)
  const pv = r.pageVersion === null ? "—" : r.pageVersion
  console.log(`${r.verdict.padEnd(7)} | ${pv.padEnd(6)} | ${rel} | ${r.reason}`)
}

const counts = { PASS: 0, DRIFT: 0, MISSING: 0 }
for (const r of results) counts[r.verdict]++
console.log()
console.log(
  `Summary: PASS = ${counts.PASS}, DRIFT = ${counts.DRIFT}, MISSING = ${counts.MISSING}`,
)

const hasFindings = counts.DRIFT > 0 || counts.MISSING > 0
if (hasFindings) {
  console.log()
  console.log(
    "Action: open the listed pages and update their ## Quality review block to v" +
      canonical +
      " — add rows for any new dimensions per quality-rubric.md anchors. " +
      "After editing, run `node scripts/quality-source-page.mjs --write` to refresh mechanical floors.",
  )
}

process.exit(hasFindings ? 1 : 0)
