// v0.6 LLM-as-judge — headless Claude invocation for source-page quality scoring.
//
// Companion to scripts/quality-source-page.mjs. The mechanical floor scorer
// detects structural compliance (sections present, mentions, phrases); this
// module asks an LLM to overlay substantive judgment per the rubric anchors.
//
// Contract:
//   - The LLM gets the full rubric + page body (with §Quality review stripped)
//     + the mechanical floor as guardrails.
//   - The LLM returns a JSON object with per-dimension scores + reasoning.
//   - Soft-floor rule: a judgment score below the floor for a dimension is
//     allowed ONLY if the LLM provides `below_floor_reason` for that dim
//     (per quality-rubric.md: "never overridden silently"). Logged as a
//     warning; never silently accepted.
//   - Invocation: `claude -p "<prompt>" --output-format text --max-turns 1`.
//     Run from the repo root; inherits the user's CLI auth.
//
// Public API:
//   runLLMJudge({ rubricBody, pageBody, floor, denominator, slug }) -> {
//     judgment: { D1: 3, D2: 3, ..., D6: 3 | null },
//     judgment_reasoning: { D1: "...", ... },
//     judgment_total: 0.93,
//     summary: "...",
//     warnings: [ "D3 below floor: ..." ],
//     judge_model: "claude-cli",
//     raw: "<full LLM response>"
//   }
//
// Throws on: claude binary missing, non-zero exit, JSON parse failure,
// schema validation failure (missing required dims, scores out of 0-3,
// below-floor without reason).

import { spawn } from "node:child_process"

const DIMS = ["D1", "D2", "D3", "D4", "D5", "D6"]
const JUDGE_MODEL_TAG = "claude-cli"

/**
 * Build the prompt sent to the LLM. Kept in one place so the prompt is
 * legible and testable independent of the spawn machinery.
 */
export function buildJudgePrompt({ rubricBody, pageBody, floor, slug, depthClaim }) {
  const floorLines = DIMS.map((d) => `${d}=${floor[d] === null ? "null" : floor[d]}`).join(" ")
  const floorNotesBlock = (floor.notes || []).length > 0
    ? `\nFloor notes (issues the mechanical scorer flagged):\n${(floor.notes || []).map((n) => `- ${n}`).join("\n")}`
    : ""

  return `You are a quality reviewer scoring a wiki source page against a six-dimension rubric. The wiki ingests scientific papers via Keshav's three-pass method into structured markdown pages. Your job is to read the page body and grade it against the rubric anchors.

Return JSON only — no markdown code fences, no preamble, no explanation outside the JSON object.

# RUBRIC (verbatim from quality-rubric.md)

${rubricBody}

# PAGE BEING SCORED

Slug: ${slug}
Depth claim (from frontmatter): ${depthClaim || "(none)"}

## Body (frontmatter stripped; §Quality review stripped if it was present)

${pageBody}

# MECHANICAL FLOOR (lower bound for each dimension)

${floorLines}
${floorNotesBlock}

The floor is the LOWER BOUND from a structural lint pass. Your judgment scores should be >= the floor for each dimension. If you genuinely need to score below the floor for any dimension (e.g. the section exists structurally but is boilerplate), you MUST include a "below_floor_reason" string for that dimension explaining why. Per the rubric: the floor is never overridden silently.

# RESPONSE SCHEMA

Return exactly one JSON object matching this shape:

{
  "judgment": {
    "D1": {"score": 0|1|2|3, "reasoning": "1-2 sentences"},
    "D2": {"score": 0|1|2|3, "reasoning": "..."},
    "D3": {"score": 0|1|2|3, "reasoning": "..."},
    "D4": {"score": 0|1|2|3, "reasoning": "..."},
    "D5": null | {"score": 0|1|2|3, "reasoning": "..."},
    "D6": null | {"score": 0|1|2|3, "reasoning": "..."}
  },
  "summary": "1-3 sentences overall — what the page does well, what needs work"
}

Optional per-dimension field: "below_floor_reason" (string) — REQUIRED if score < floor for that dim.

# RULES

1. D5 must be null if the floor shows D5=null (the page is not Pass 3 depth).
2. D6 must be null if the floor shows D6=null (the page has no appendix material).
3. Score 3 requires substantive evidence per the rubric anchors — be strict; don't award 3 by default.
4. The reasoning string should cite specific page content (e.g. "Table 4 reproduced with all 26 rows" or "limitations section is boilerplate, no paper-specific items").
5. **D3 = 3 specifically:** rubric v1.3 allows full reproduction *either* inline OR by wikilink to a \`type: artifact\` / \`type: concept\` page. When the source page's \`## Distinctive artifacts\` section consists of catalogue entries each pointing to a wikilink like \`[[hajek-2024-bertopic-risk-categories]]\` or \`[[sme-distress-predictor-variables]]\` (with a brief type/location/summary), that **satisfies D3 = 3** for the artifacts so linked. You do not see the artifact pages themselves — trust the catalogue structure when each load-bearing artifact has a wikilink. D3 = 2 (not 3) applies only when artifacts are named but neither reproduced inline nor linked out.
6. JSON only. No markdown code fences. No commentary before or after the JSON.`
}

/**
 * Strip markdown fences and extract the JSON object from the LLM's response.
 * The model usually returns clean JSON when asked, but occasionally wraps in
 * \`\`\`json fences or adds a leading "Here is the JSON:" preamble.
 */
function extractJSON(text) {
  let s = text.trim()
  // Strip leading/trailing markdown code fences
  if (s.startsWith("```")) {
    const lines = s.split("\n")
    if (lines[0].startsWith("```")) lines.shift()
    if (lines.length > 0 && lines[lines.length - 1].startsWith("```")) lines.pop()
    s = lines.join("\n").trim()
  }
  // Find the outermost JSON object
  const start = s.indexOf("{")
  const end = s.lastIndexOf("}")
  if (start < 0 || end <= start) {
    throw new Error("No JSON object found in LLM response")
  }
  const slice = s.slice(start, end + 1)
  try {
    return JSON.parse(slice)
  } catch (err) {
    throw new Error(`JSON parse failed: ${err.message}\n--- extracted slice ---\n${slice.slice(0, 500)}…`)
  }
}

/**
 * Validate the LLM response shape and the soft-floor rule. Returns warnings
 * (non-fatal: below-floor with explanation), throws on hard errors (schema
 * violations, below-floor without explanation).
 */
function validateJudgment(parsed, floor) {
  const warnings = []
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Response is not an object")
  }
  if (!parsed.judgment || typeof parsed.judgment !== "object") {
    throw new Error("Response missing `judgment` object")
  }
  for (const dim of DIMS) {
    const j = parsed.judgment[dim]
    const f = floor[dim]
    // null handling: must agree with floor
    if (f === null) {
      if (j !== null && j !== undefined) {
        throw new Error(`${dim}: floor is null (N/A) but judgment is non-null — must agree`)
      }
      continue
    }
    if (j === null || j === undefined) {
      throw new Error(`${dim}: floor is ${f} but judgment is null — must be a {score, reasoning} object`)
    }
    if (typeof j !== "object") {
      throw new Error(`${dim}: judgment must be a {score, reasoning} object, got ${typeof j}`)
    }
    if (typeof j.score !== "number" || !Number.isInteger(j.score) || j.score < 0 || j.score > 3) {
      throw new Error(`${dim}: score must be an integer 0-3, got ${JSON.stringify(j.score)}`)
    }
    if (typeof j.reasoning !== "string" || j.reasoning.trim().length === 0) {
      throw new Error(`${dim}: reasoning must be a non-empty string`)
    }
    // Soft-floor: below-floor requires explicit reason
    if (j.score < f) {
      if (typeof j.below_floor_reason !== "string" || j.below_floor_reason.trim().length === 0) {
        throw new Error(`${dim}: judgment ${j.score} below floor ${f} but no below_floor_reason provided`)
      }
      warnings.push(`${dim} below floor (${j.score} < ${f}): ${j.below_floor_reason}`)
    }
  }
  if (typeof parsed.summary !== "string" || parsed.summary.trim().length === 0) {
    throw new Error("Response missing or empty `summary` field")
  }
  return warnings
}

/**
 * Compute the judgment total using the same denominator the mechanical scorer
 * used. Sums non-null judgment dim scores and divides by denominator.
 */
function computeJudgmentTotal(judgment, denominator) {
  let sum = 0
  for (const dim of DIMS) {
    const j = judgment[dim]
    if (j !== null && j !== undefined) sum += j.score
  }
  return Math.round((sum / denominator) * 100) / 100
}

/**
 * Reduce the judgment object to plain {D1: score, ...} and a parallel
 * reasoning map for ergonomic logging.
 */
function flattenJudgment(judgment) {
  const scores = {}
  const reasoning = {}
  for (const dim of DIMS) {
    const j = judgment[dim]
    if (j === null || j === undefined) {
      scores[dim] = null
      reasoning[dim] = null
    } else {
      scores[dim] = j.score
      reasoning[dim] = j.reasoning + (j.below_floor_reason ? ` [below_floor_reason: ${j.below_floor_reason}]` : "")
    }
  }
  return { scores, reasoning }
}

/**
 * Spawn `claude -p` and capture stdout. Returns the raw text response.
 * Throws on non-zero exit or missing binary.
 */
function spawnClaude(prompt, { timeout = 300_000, model = null } = {}) {
  return new Promise((resolve, reject) => {
    const args = ["-p", prompt, "--output-format", "text", "--max-turns", "1"]
    if (model) args.push("--model", model)
    const child = spawn("claude", args, { stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    const to = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error(`claude -p timed out after ${timeout / 1000}s`))
    }, timeout)
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.on("error", (err) => {
      clearTimeout(to)
      if (err.code === "ENOENT") {
        reject(new Error("`claude` CLI not found in PATH. Install Claude Code or add it to PATH."))
      } else {
        reject(err)
      }
    })
    child.on("close", (code) => {
      clearTimeout(to)
      if (code !== 0) {
        reject(new Error(`claude -p exited ${code}\nstderr: ${stderr.slice(0, 500)}`))
      } else {
        resolve(stdout)
      }
    })
  })
}

/**
 * Public entry point — run the LLM judge against one source page.
 *
 * `floor` shape: { D1, D2, D3, D4, D5, D6, notes? } — same shape the
 * scorer produces, with null for N/A dimensions.
 *
 * Retry: one attempt at the original prompt, one retry on parse/validation
 * failure with a sharpened reminder. Beyond that, throw.
 */
export async function runLLMJudge({ rubricBody, pageBody, floor, denominator, slug, depthClaim, model = null, timeout = 300_000 }) {
  const basePrompt = buildJudgePrompt({ rubricBody, pageBody, floor, slug, depthClaim })
  const retryPrompt = basePrompt + `

# RETRY REMINDER

A previous attempt failed JSON parsing. **Critical:** return ONLY a valid JSON object. Use double-quoted strings everywhere — no single quotes for property names or values. Escape any double quotes inside reasoning text with backslash (\\"). Escape newlines inside strings with \\n. No trailing commas. No markdown code fences. The response must parse cleanly with JSON.parse().`

  let lastError = null
  for (const [attempt, prompt] of [[1, basePrompt], [2, retryPrompt]]) {
    try {
      const raw = await spawnClaude(prompt, { timeout, model })
      const parsed = extractJSON(raw)
      const warnings = validateJudgment(parsed, floor)
      const { scores, reasoning } = flattenJudgment(parsed.judgment)
      const judgment_total = computeJudgmentTotal(parsed.judgment, denominator)
      return {
        judgment: scores,
        judgment_reasoning: reasoning,
        judgment_total,
        summary: parsed.summary,
        warnings: attempt === 2 ? [...warnings, "(judge succeeded on retry after parse/validation failure)"] : warnings,
        judge_model: JUDGE_MODEL_TAG + (model ? `/${model}` : ""),
        raw,
      }
    } catch (err) {
      lastError = err
      // Only retry on parse/validation errors — spawn/timeout errors are not
      // worth a second LLM call (they'll fail the same way).
      const msg = String(err.message || err)
      if (!/JSON parse|Response missing|score must|reasoning must|below floor|floor is/.test(msg)) {
        throw err
      }
    }
  }
  throw lastError
}
