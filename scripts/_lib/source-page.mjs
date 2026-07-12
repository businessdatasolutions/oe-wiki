// Shared helpers for source-page scoring scripts.
//
// One place to encode shape rules that >1 script reads, so a bug fix lands
// in one location. Imported by:
//   - scripts/quality-source-page.mjs (mechanical floor scorer)
//   - scripts/lint-appendix-coverage.mjs (D6 coverage lint)
//   - scripts/lint-rubric-version-drift.mjs (rubric-version drift lint)
//
// Add helpers here rather than re-implementing across scripts.

import { readFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import matter from "gray-matter"

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
export const RUBRIC_PATH = join(
  REPO_ROOT,
  ".claude/skills/scientific-papers-processing/quality-rubric.md",
)

/**
 * Strip the ## Quality review section from a source page's body before
 * running source-content detection (appendix mentions, caveats, etc.).
 *
 * Why: §Quality review is wiki *meta*-content (rubric scoring rows whose
 * notes legitimately use words like "appendix", "deferred", "not transcribed"
 * in the D6 row). Including it in source-content scans creates self-fulfilling
 * bugs — e.g. writing "D6: n/a — no appendix" makes the scorer claim the
 * page has an appendix.
 *
 * Convention: ## Quality review is the LAST H2 on a source page. We cut
 * everything from that heading onward.
 */
export function stripQualityReview(body) {
  const idx = body.search(/^## Quality review\b/m)
  return idx >= 0 ? body.slice(0, idx) : body
}

/**
 * Read the canonical rubric version from the rubric.md YAML frontmatter.
 * Returns a string like "1.1". Falls back to "unknown" if parsing fails
 * (callers should treat that as a soft signal, not crash).
 */
export async function readCanonicalRubricVersion() {
  try {
    const raw = await readFile(RUBRIC_PATH, "utf8")
    const fm = matter(raw).data
    if (typeof fm.rubric_version === "string") return fm.rubric_version
    if (typeof fm.version === "string") return fm.version
    return "unknown"
  } catch {
    return "unknown"
  }
}

/**
 * Extract the per-source-page rubric version from its ## Quality review block.
 * Matches the convention `| Rubric version | X.Y |` (with optional trailing
 * text like "(adds D6)"). Returns the X.Y string or null if not found.
 */
export function extractPageRubricVersion(body) {
  // Look only inside the Quality review block to avoid false matches elsewhere
  const idx = body.search(/^## Quality review\b/m)
  if (idx < 0) return null
  const block = body.slice(idx)
  const m = block.match(/^\|\s*Rubric version\s*\|\s*([0-9]+\.[0-9]+)\b/m)
  return m ? m[1] : null
}
