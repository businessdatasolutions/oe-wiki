#!/usr/bin/env node
// Read-only walker over pages with `type: bedrijfscase-bron`.
//
// Enforces the source/analysis split from LRD §6.1: a bedrijfscase-bron page
// supplies raw material (facts with citations) for students to reason over. The
// analysis itself — answering the two kernvragen (§2.5) and the Lean 4.0
// critical-lens question (§6.9) — is student work on their own team-case page
// (FR-01, FR-15).
//
// Why this is enforced in code and not just prose: LRD §6.9 requires the
// Socratic tutor to cite these pages "zonder ooit zelf te verklappen welk
// antwoord 'goed' is". A page that states the answer defeats that guarantee no
// matter how careful the tutor's prompt is. The rule lived only in prose until
// a build agent modelled the wrong shape across all five case pages.
//
// Scope note: only `type: bedrijfscase-bron` is checked. Week-landing pages
// (wiki/weeks/) legitimately *pose* the kernvragen, and the ai-wiki contentmap
// pages legitimately map content onto leeruitkomsten. Those are navigation, not
// answers, and must keep their wording.
//
// Never edits files. Run from repo root with: node scripts/lint-source-neutrality.mjs

import { readdir, readFile } from "node:fs/promises"
import { join, relative, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import matter from "gray-matter"

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const TARGETS = ["wiki/sources"]
const GUARDED_TYPE = "bedrijfscase-bron"

// Each rule reports the first capture group (or the whole match) so the output
// names the offending phrase rather than just a line number.
const RULES = [
  {
    id: "answer-section",
    pattern: /^#+\s*Toepassing op de kernvragen.*$/gim,
    explain:
      "answers the §2.5 kernvragen; that is team-case work (FR-01), not source material",
  },
  {
    id: "kernvragen-mention",
    pattern: /\bkernvrag\w*/gi,
    explain: "refers to the §2.5 kernvragen; a source page should not frame the answer",
  },
  {
    id: "learning-outcome",
    pattern: /\b(leeruitkomst\w*|LO\s*\d+)/gi,
    explain: "names the learning outcome being assessed; that tells the student what scores",
  },
  {
    id: "gate-reference",
    pattern: /\bGate\s*\d+/gi,
    explain: "ties the case to a specific gate; the tutor must not have the answer pre-staged",
  },
]

async function listMarkdown(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .filter((e) => !e.isDirectory() && e.name.endsWith(".md"))
    .map((e) => join(dir, e.name))
}

// Matches are found against the frontmatter-stripped body, but reported against
// the file so `path:line` lands where a reader expects it.
function bodyLineOffset(raw, content) {
  const start = raw.lastIndexOf(content)
  if (start <= 0) return 0
  return raw.slice(0, start).split("\n").length - 1
}

function lineOf(body, index, offset) {
  return body.slice(0, index).split("\n").length + offset
}

const violations = []
let checked = 0

for (const target of TARGETS) {
  for (const file of await listMarkdown(join(REPO_ROOT, target))) {
    const raw = await readFile(file, "utf8")
    const { data, content } = matter(raw)
    if (data.type !== GUARDED_TYPE) continue

    checked++
    const rel = relative(REPO_ROOT, file)
    const offset = bodyLineOffset(raw, content)

    for (const rule of RULES) {
      // Frontmatter is excluded from the scan on purpose — `description:` may
      // legitimately summarise the case.
      for (const match of content.matchAll(rule.pattern)) {
        violations.push({
          rel,
          line: lineOf(content, match.index, offset),
          rule: rule.id,
          found: match[0].trim(),
          explain: rule.explain,
        })
      }
    }
  }
}

console.log(`Source neutrality — ${checked} page(s) of type: ${GUARDED_TYPE}`)
console.log("------------------------")

if (violations.length === 0) {
  console.log("  no violations")
  process.exit(0)
}

const byFile = new Map()
for (const v of violations) {
  if (!byFile.has(v.rel)) byFile.set(v.rel, [])
  byFile.get(v.rel).push(v)
}

for (const [rel, items] of byFile) {
  console.log(`\n  ${rel}  (${items.length})`)
  for (const v of items) {
    console.log(`    ${rel}:${v.line}  [${v.rule}]  "${v.found}"`)
    console.log(`      → ${v.explain}`)
  }
}

console.log(
  `\n${violations.length} violation(s) across ${byFile.size} page(s).`,
)
console.log(
  "A bedrijfscase-bron page carries facts and citations; the analysis belongs to the team-case page (LRD §6.1, §6.9).",
)
process.exit(1)
