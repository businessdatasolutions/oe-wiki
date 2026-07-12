#!/usr/bin/env node
// Batch OKF-conformance lint over the whole wiki/ tree (recursive).
//
// Reuses the pattern from scripts/lint-page.mjs (the PostToolUse hook, which
// only ever checks a single just-edited file passed via a stdin JSON
// payload): this script discovers every page under wiki/ (excluding the
// reserved index.md / log.md filenames per SPEC.md §3.1), and for each one
// (a) checks OKF v0.1 §9 conformance directly -- a parseable YAML frontmatter
// block with a non-empty `type` field -- and (b) re-invokes the real
// scripts/lint-page.mjs against that file via the same stdin contract the
// PostToolUse hook uses, so the v0.2/v0.3 lifecycle/relationship/body-wikilink
// checks run identically to how they run on every interactive edit. Nothing
// here duplicates lint-page.mjs's rule logic -- it is the single source of
// truth for those rules; this script only adds the "walk everything, check
// OKF §9, exit non-zero on failure" batch/CI layer lint-page.mjs intentionally
// doesn't have (it never blocks, by design, since it's a hook).
//
// Written for Main Task 1 (buildplan.md Test Gate — Task 1): "een OKF-
// lintscript (hergebruik het patroon uit scripts/lint-page.mjs, AC-09) draait
// over alle pagina's uit 1.2–1.5 en meldt nul fouten (elke pagina heeft
// niet-lege type)." Scoped to the whole wiki/ tree (a superset of 1.2-1.5,
// also covering the 1.6 week-landing pages) since running the same check on
// more pages is strictly safer than the letter of the requirement.
//
// Exit code: 1 if any OKF §9 violation is found (missing/empty `type` or
// unparseable frontmatter); 0 otherwise. lint-page.mjs warnings are printed
// for human visibility but do NOT affect the exit code, matching that
// script's own "reports, never blocks" design (its findings are advisory
// lifecycle/style guidance, not the OKF conformance floor this script polices).
//
// Run from repo root with: node scripts/lint-wiki-batch.mjs

import { readdir, readFile } from "node:fs/promises"
import { join, relative, dirname, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import matter from "gray-matter"

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const WIKI_DIR = join(REPO_ROOT, "wiki")
const RESERVED = new Set(["index.md", "log.md"])
const LINT_PAGE_SCRIPT = join(REPO_ROOT, "scripts", "lint-page.mjs")

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walk(full)))
      continue
    }
    if (!entry.name.endsWith(".md")) continue
    if (RESERVED.has(entry.name)) continue
    files.push(full)
  }
  return files
}

function runLintPage(absPath) {
  const payload = JSON.stringify({
    tool_name: "Edit",
    tool_input: { file_path: absPath },
  })
  const result = spawnSync(process.execPath, [LINT_PAGE_SCRIPT], {
    input: payload,
    encoding: "utf8",
  })
  return (result.stderr ?? "").trim()
}

const files = (await walk(WIKI_DIR)).sort()

let okfErrors = 0
let lintPageWarningFiles = 0
const errorDetails = []
const warningDetails = []

for (const file of files) {
  const rel = relative(REPO_ROOT, file)
  let raw
  try {
    raw = await readFile(file, "utf8")
  } catch (e) {
    okfErrors++
    errorDetails.push(`${rel}: cannot read file (${e.message})`)
    continue
  }

  let parsed
  try {
    parsed = matter(raw)
  } catch (e) {
    okfErrors++
    errorDetails.push(`${rel}: frontmatter parse error (${e.message}) — OKF §9.1 violation`)
    continue
  }

  const type = parsed.data?.type
  if (typeof type !== "string" || type.trim() === "") {
    okfErrors++
    errorDetails.push(`${rel}: missing or empty \`type\` — OKF §9.2 violation`)
  }

  const warnings = runLintPage(file)
  if (warnings) {
    lintPageWarningFiles++
    warningDetails.push(warnings)
  }
}

console.log(`OKF batch lint — scanned ${files.length} pages under wiki/ (excluding index.md/log.md)`)
console.log("------------------------------------------------------------------")
console.log(`OKF §9 conformance errors: ${okfErrors}`)
for (const d of errorDetails) console.log(`  - ${d}`)
console.log()
console.log(`lint-page.mjs advisory warnings on ${lintPageWarningFiles} file(s) (non-blocking, informational):`)
for (const d of warningDetails) console.log(d)

if (okfErrors > 0) {
  console.log()
  console.log(`FAIL: ${okfErrors} OKF §9 conformance error(s).`)
  process.exit(1)
}

console.log()
console.log(`PASS: 0 OKF §9 conformance errors across ${files.length} pages.`)
process.exit(0)
