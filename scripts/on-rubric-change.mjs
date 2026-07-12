#!/usr/bin/env node
// PostToolUse hook wrapper. Fires on every Edit|Write tool call (per
// .claude/settings.json matcher), but acts only when the touched file is the
// canonical quality rubric. For any other file, exits silently.
//
// When the rubric changes:
//   1. Re-score every paper source page (`quality-source-page.mjs`), which
//      appends a fresh JSONL entry per page (floor only — judgment never
//      runs from a hook to avoid surprise LLM calls). The scorer's own
//      auto-chain then regenerates `logs/quality-report.html`.
//   2. Run the drift lint (`lint-rubric-version-drift.mjs`) to surface
//      source pages whose body still references an old rubric version.
//      The fix is editorial; the lint just makes it visible.
//
// Per CLAUDE.md §Hooks: this hook only writes to
//   - `logs/*` (gitignored derived artifacts),
//   - stderr/stdout.
// As of v0.6 the scorer no longer touches source-page frontmatter or body
// content — judgment scores live only in the JSONL log.
//
// Hook payload (stdin, JSON):
//   { "tool_name": "Edit" | "Write",
//     "tool_input": { "file_path": "/abs/path/to/file.md", ... } }

import { spawn } from "node:child_process"
import { dirname, resolve, relative } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, "..")
const RUBRIC_REL = ".claude/skills/scientific-papers-processing/quality-rubric.md"
const RUBRIC_ABS = resolve(REPO_ROOT, RUBRIC_REL)

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
  // Malformed payload — exit silently so hook bugs never block tool calls.
  process.exit(0)
}

const filePath = payload?.tool_input?.file_path
if (typeof filePath !== "string") process.exit(0)

const absPath = resolve(filePath)
if (absPath !== RUBRIC_ABS) process.exit(0)

// We're editing the canonical rubric. Fire the chain.
console.error(`[on-rubric-change] rubric edited (${RUBRIC_REL}); re-scoring sources …`)

function run(script, args = []) {
  return new Promise((resolveRun) => {
    const child = spawn("node", [resolve(__dirname, script), ...args], {
      stdio: "inherit",
    })
    child.on("close", (code) => resolveRun(code ?? 0))
    child.on("error", (err) => {
      console.error(`[on-rubric-change] failed to spawn ${script}: ${err.message}`)
      resolveRun(1)
    })
  })
}

// quality-source-page.mjs triggers its own HTML auto-chain at end,
// so we don't need to spawn quality-log-html.mjs separately.
const scoreCode = await run("quality-source-page.mjs")

// The v0.5 `lint-rubric-version-drift.mjs` chained here is obsolete in v0.6
// — source pages no longer carry an in-body `## Quality review` block whose
// rubric version could drift. The lint script is left in place but no longer
// auto-fires on rubric edits.

// Hooks must not block the tool call — always exit 0 regardless of child codes.
// We surface non-zero codes via stderr so the user can spot them.
if (scoreCode !== 0) {
  console.error(`[on-rubric-change] quality-source-page.mjs exited ${scoreCode}`)
}

process.exit(0)
