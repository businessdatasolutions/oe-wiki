#!/usr/bin/env node
// Fired on PostToolUse hook (configured in .claude/settings.json) for Edit
// and Write tool calls whose target path is under wiki/. Validates the v0.2
// lifecycle contract and the v0.3 body-wikilink rule on the file that was
// just edited. Outputs warnings to stderr; never blocks (always exits 0).
//
// Hook input (stdin, JSON):
//   { "tool_name": "Edit" | "Write",
//     "tool_input": { "file_path": "/abs/path/to/file.md", ... } }
//
// Read-only against wiki content. Per CLAUDE.md §Hooks, hooks must not edit
// any wiki/**/*.md page; this script reads the edited file, surfaces issues
// for Claude/the user to address, and exits.

import { readFile } from "node:fs/promises"
import { resolve, relative, basename, sep } from "node:path"
import matter from "gray-matter"

const REPO_ROOT = resolve(new URL(".", import.meta.url).pathname, "..")
const WIKI_PREFIX = `wiki${sep}`
const LIFECYCLE_TYPES = new Set(["concept", "entity", "synthesis"])

// Read JSON input from stdin (hook payload). If we can't parse it, skip the
// lint silently rather than blocking the tool call.
async function readStdin() {
  let raw = ""
  for await (const chunk of process.stdin) raw += chunk
  return raw.trim()
}

let payload = null
try {
  const raw = await readStdin()
  if (raw) payload = JSON.parse(raw)
} catch {
  // Malformed payload — exit silently so we never block tool calls on hook bugs
  process.exit(0)
}

const filePath = payload?.tool_input?.file_path
if (typeof filePath !== "string" || !filePath.endsWith(".md")) process.exit(0)

const absPath = resolve(filePath)
const rel = relative(REPO_ROOT, absPath)
if (!rel.startsWith(WIKI_PREFIX)) process.exit(0)
// Skip the catalog files — they have a different shape from page files.
if (rel === `wiki${sep}index.md` || rel === `wiki${sep}log.md`) process.exit(0)

let raw
try {
  raw = await readFile(absPath, "utf8")
} catch {
  // File doesn't exist (e.g. an Edit that's about to fail) — let the tool's
  // own error handle it.
  process.exit(0)
}

let parsed
try {
  parsed = matter(raw)
} catch (e) {
  process.stderr.write(`lint-page: ${rel}: frontmatter parse error: ${e.message}\n`)
  process.exit(0)
}

const fm = parsed.data ?? {}
const body = parsed.content ?? ""
const warnings = []

// 1. Frontmatter contract (v0.2 §Lifecycle): concepts/entities/syntheses must
//    carry confidence, last_confirmed, source_count.
if (typeof fm.type === "string" && LIFECYCLE_TYPES.has(fm.type)) {
  if (typeof fm.confidence !== "number") warnings.push("missing `confidence` (v0.2 §Lifecycle)")
  if (typeof fm.last_confirmed !== "string")
    warnings.push("missing `last_confirmed` (v0.2 §Lifecycle)")
  if (typeof fm.source_count !== "number")
    warnings.push("missing `source_count` (v0.2 §Lifecycle)")
}

// 2. Confidence range
if (typeof fm.confidence === "number") {
  if (fm.confidence < 0 || fm.confidence > 1) {
    warnings.push(`confidence ${fm.confidence} outside [0, 1]`)
  } else if (fm.confidence === 0) {
    warnings.push("confidence is 0 (v0.2 §Lifecycle: never use 0 as a default; pick a defensible value)")
  }
}

// 3. Confidence vs source_count consistency (v0.2 §Lifecycle Confidence rules):
//    0.70 baseline + 0.05 per additional source + 0.05 peer-reviewed bonus,
//    cap 0.95. The defensible generous max simplifies to
//      min(0.95, 0.70 + 0.05 * source_count)
//    We warn when declared confidence exceeds this max (small tolerance avoids
//    floating-point quirks). We do NOT warn on values BELOW the range — being
//    more conservative than the math is legitimate (unflagged contradictions,
//    judgment-call dampening, vendor-/anecdotal-source cap at 0.75 applied
//    without explicit frontmatter flag). Inspired by Mysore 2026's "Context
//    Debt" vocabulary — the lint that names claims-beyond-evidence.
if (
  typeof fm.confidence === "number" &&
  typeof fm.source_count === "number" &&
  fm.source_count > 0
) {
  const defensibleMax = Math.min(0.95, 0.70 + 0.05 * fm.source_count)
  const TOLERANCE = 0.01
  if (fm.confidence > defensibleMax + TOLERANCE) {
    warnings.push(
      `confidence ${fm.confidence} > defensible max ${defensibleMax.toFixed(2)} for source_count ${fm.source_count} (v0.2 §Lifecycle Confidence rules: 0.70 baseline + 0.05 per additional source + 0.05 peer-reviewed bonus, cap 0.95). Either add a source or lower confidence. Note: vendor-/anecdotal sources are capped at 0.75 regardless of count.`,
    )
  }
}

// 4. last_confirmed must be an ISO date string (v0.2 used quoted YAML strings)
if (fm.last_confirmed !== undefined && typeof fm.last_confirmed !== "string") {
  warnings.push(
    "last_confirmed must be a quoted YAML string like \"2026-05-05\", not a bare date (gray-matter parses bare dates as Date objects)",
  )
}

// 5. v0.3 body-wikilink rule: every relationship target must appear as a body
//    wikilink. Match `[[target]]` or `[[target|...]]` or `[[folder/target]]`
//    and `[[folder/target|...]]`. Compare on simplified slug (basename only,
//    spaces normalized to dashes).
if (Array.isArray(fm.relationships) && fm.relationships.length > 0) {
  const wikilinkRe = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g
  const presentSlugs = new Set()
  for (const m of body.matchAll(wikilinkRe)) {
    const linkTarget = m[1].trim()
    presentSlugs.add(linkTarget)
    presentSlugs.add(linkTarget.split("/").pop())
    presentSlugs.add(linkTarget.replace(/\s+/g, "-"))
  }
  for (const rel of fm.relationships) {
    if (!rel || typeof rel.target !== "string") continue
    const target = rel.target.trim()
    const targetBasename = target.split("/").pop()
    const targetNormalized = target.replace(/\s+/g, "-")
    const found =
      presentSlugs.has(target) ||
      presentSlugs.has(targetBasename) ||
      presentSlugs.has(targetNormalized)
    if (!found) {
      warnings.push(
        `relationships.${rel.type ?? "?"} target \`${target}\` has no matching [[wikilink]] in body (v0.3 §Graph body-wikilink rule)`,
      )
    }
  }
}

// 6. Closed relationship vocabulary (v0.3 §Graph)
const RELATIONSHIP_VOCAB = new Set([
  "supports",
  "contradicts",
  "caused",
  "fixed",
  "supersedes",
  "uses",
  "depends-on",
  "part-of",
  "instance-of",
  "authored-by",
  "published-by",
  "employs",
])
if (Array.isArray(fm.relationships)) {
  for (const r of fm.relationships) {
    if (!r || typeof r.type !== "string") continue
    if (!RELATIONSHIP_VOCAB.has(r.type)) {
      warnings.push(
        `relationships type \`${r.type}\` is outside the closed vocabulary (v0.3 §Graph)`,
      )
    }
  }
}

// 7. Stale-page protocol (v0.2 §Lifecycle): a page with `status: stale` must
//    have `superseded_by`.
if (typeof fm.status === "string" && fm.status.toLowerCase() === "stale") {
  if (!fm.superseded_by) {
    warnings.push(
      "status: stale but no `superseded_by` set (v0.2 §Lifecycle supersession protocol)",
    )
  }
}

// 8. Dynamic-capabilities tagging (CLAUDE.md §Dynamic-capabilities tagging):
//    closed vocabulary of W&W process-model cells; body twin rule. Single
//    source of truth for the vocabulary lives on
//    wiki/concepts/warner-wager-process-model.md — keep this Set in sync.
const DYNAMIC_CAPABILITIES_VOCAB = new Set([
  "digital-sensing/digital-scouting",
  "digital-sensing/digital-scenario-planning",
  "digital-sensing/digital-mindset-crafting",
  "digital-seizing/rapid-prototyping",
  "digital-seizing/balancing-digital-portfolios",
  "digital-seizing/strategic-agility",
  "digital-transforming/navigating-innovation-ecosystems",
  "digital-transforming/redesigning-internal-structures",
  "digital-transforming/improving-digital-maturity",
  "strategic-renewal/business-model",
  "strategic-renewal/collaborative-approach",
  "strategic-renewal/organizational-culture",
  "contextual/external-triggers",
  "contextual/internal-enablers",
  "contextual/internal-barriers",
])

if (Array.isArray(fm.dynamic_capabilities)) {
  const bodyLower = body.toLowerCase()
  for (const tag of fm.dynamic_capabilities) {
    if (typeof tag !== "string") continue
    const slug = tag.trim()
    if (!DYNAMIC_CAPABILITIES_VOCAB.has(slug)) {
      warnings.push(
        `dynamic_capabilities entry \`${slug}\` is outside the closed vocabulary (see wiki/concepts/warner-wager-process-model.md for the 15-cell vocabulary; CLAUDE.md §Dynamic-capabilities tagging)`,
      )
      continue
    }
    // Body-twin rule: the slug, or its trailing element, must appear in body
    // prose. Word-boundary match avoids `business-model` falsely matching
    // `business-modeling`.
    const trailing = slug.split("/").pop()
    const wbRe = (s) =>
      new RegExp(`(?<![A-Za-z0-9_-])${s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}(?![A-Za-z0-9_-])`, "i")
    const found = wbRe(slug).test(bodyLower) || wbRe(trailing).test(bodyLower)
    if (!found) {
      warnings.push(
        `dynamic_capabilities \`${slug}\` has no body mention (CLAUDE.md §Dynamic-capabilities tagging body-twin rule — every tag needs at least one sentence of body prose naming the cell or its trailing element)`,
      )
    }
  }
}

// 9. Roles vocabulary (CLAUDE.md §Dynamic-capabilities tagging):
//    On source pages, `roles:` is a list of slugs from the closed vocabulary.
//    On entity pages, `roles:` (if present) is a free-text job-title field —
//    skip vocabulary validation there.
const ROLES_VOCAB = new Set([
  "ceo",
  "coo",
  "cfo",
  "cso",
  "cdo",
  "cto",
  "cio",
  "chro",
  "cmo",
  "product-manager",
  "tech-lead",
  "rd-director",
  "innovation-lab-lead",
  "transformation-lead",
  "strategy-consultant",
])

if (fm.type === "source" && Array.isArray(fm.roles)) {
  for (const role of fm.roles) {
    if (typeof role !== "string") continue
    const slug = role.trim()
    if (!ROLES_VOCAB.has(slug)) {
      warnings.push(
        `roles entry \`${slug}\` is outside the closed vocabulary (15 slugs; see wiki/concepts/warner-wager-process-model.md §Roles vocabulary)`,
      )
    }
  }
}

if (warnings.length > 0) {
  process.stderr.write(`lint-page: ${rel}\n`)
  for (const w of warnings) process.stderr.write(`  - ${w}\n`)
}

process.exit(0)
