---
name: neighbour-source-scan
description: Use when ingesting any new source into the wiki, right after assigning W&W `dynamic_capabilities:` tags and before updating concept/entity pages — i.e. step 5 of the Ingest checklist in CLAUDE.md. Also trigger when adding typed `relationships:` to an existing source page, or whenever the user notices a thematic neighbour was missed (the canonical symptom: *"Did you find any relations to source X?"*).
---

# Neighbour-source scan

The disciplined query that turns the wiki's existing W&W tagging and concept-page citations into a *thematic adjacency index* and uses it to surface cross-source typed `relationships:` edges that would otherwise be missed.

## When to use

- You've just written the body of a new source page and are about to file its `relationships:` frontmatter block.
- You're updating an existing source's `relationships:` and want to make sure no obvious neighbours are missing.
- The user asks *"are there any relations to [X]?"* — that's the diagnostic symptom for an omission that already slipped through.

When **not** to use:

- The new source genuinely sits outside the wiki's existing thematic clusters (e.g. pure LLM-internals papers, model-quantization mechanics). Skipping is fine; *not every source has neighbours*. Confirm by noting in the source page that no neighbours surfaced.
- The new source is itself a **synthesis** or **thread** page — those are *meant* to span multiple sources; cross-source linking is built into their structure, not added as a separate scan.

## The procedure

Two query paths. Run **both** — the second catches sources that predate W&W tagging (GH #4 carry-over of pre-2026-05-14 source pages).

### Path A — W&W cell overlap

For each cell in the new source's `dynamic_capabilities:` block, query the corpus:

```bash
# Replace <cell> with each one of yours, e.g. digital-sensing/digital-scouting
grep -l "<cell>" wiki/sources/*.md
```

Or in one go across all of your source's cells:

```bash
# From the repo root, with your cells listed
for cell in digital-sensing/digital-scouting digital-seizing/balancing-digital-portfolios contextual/external-triggers; do
  echo "=== $cell ==="
  grep -l "$cell" wiki/sources/*.md
done
```

Sources sharing **≥1 cell** are candidates. Sources sharing **≥2 cells** are very-strong candidates — the more cells overlap, the more likely a typed `supports` / `contradicts` / `supersedes` edge exists.

### Path B — Shared concept-page citations (fallback)

For each concept page you intend to touch in step 6 of the Ingest checklist (the next step), query who else cites it:

```bash
# Replace <concept-slug> with the concept's slug, e.g. strategic-foresight
grep -l "\\[\\[<concept-slug>" wiki/sources/*.md
grep -l "\\[\\[concepts/<concept-slug>" wiki/sources/*.md
```

This catches the case where two sources operate on the same concept-page but were tagged with different W&W cells — or, more importantly, where a neighbour source predates W&W tagging entirely and carries no `dynamic_capabilities:` block at all. **This fallback is load-bearing for backwards-compatibility** with the ~62 pre-GH #4 source pages.

### Decide the edge type

For each candidate, pick from the closed vocabulary:

| Type | Use when |
|---|---|
| `supports` | Both sources address the same phenomenon from compatible angles; one's claim reinforces the other's |
| `contradicts` | Findings or framings conflict — **always pair with `via:`** describing what the disagreement turns on |
| `supersedes` | New source replaces a prior claim wholesale — pair with `status: stale` + `superseded_by:` on the retired source per [§Supersession protocol](../../../CLAUDE.md#supersession-protocol) |

If no defensible type fits, **skip the candidate** — not every co-occurrence is a relationship. A *"both sources mention AI"* overlap isn't a relationship; a *"both sources address the same convergence pattern from different vantages"* overlap is.

### Surface ≥3 candidates in your response

If the scan yields **3 or more** candidate neighbours, surface the candidate list in the user-facing response **before** committing the source page. This is the accountability mechanism — the user sees the candidates and either approves the selection or flags missed ones. Hidden scans tend to omit; visible ones don't.

A surfacing template:

```markdown
**Neighbour-source scan results:**

- Cell `digital-sensing/digital-scouting` overlaps with: [[source-A]], [[source-B]]
- Cell `digital-seizing/balancing-digital-portfolios` overlaps with: [[source-C]]
- Concept-page `strategic-foresight` is also cited by: [[source-D]]

**Proposed edges from the new source:**
- `supports → source-A` (via: …)
- `supports → source-D` (via: …)
- Skipping source-B and source-C — no defensible edge (overlap is incidental).
```

## Worked example — the MGI ↔ FTSG bridge

Background: on 2026-05-15 the MGI *Race takes off in the next big arenas of competition* report was ingested. The new source carried five W&W cells: `digital-sensing/digital-scouting`, `digital-sensing/digital-scenario-planning`, `digital-seizing/balancing-digital-portfolios`, `digital-seizing/strategic-agility`, `contextual/external-triggers`.

**Path A** (cell overlap) would query each cell. But FTSG Convergence Outlook 2026 — the obvious thematic neighbour, in the wiki since 28 April 2026 — **predates W&W tagging** and carries no `dynamic_capabilities:` block. Path A misses it.

**Path B** (concept-page citations) saves it: the MGI ingest was about to touch `[[strategic-foresight]]`, and FTSG already cites that concept. Grep finds FTSG immediately.

The proper typed edges that should have been filed at ingest time:

```yaml
# In the MGI source page frontmatter
relationships:
  - type: supports
    target: 2026-04-28-ftsg-convergence-outlook-2026
    via: "MGI's outcome lens validates FTSG's process lens — the three-ingredient arena-creation potion is a subset of FTSG's seven enabling conditions; the nine-omniscaler thesis is the empirical operationalisation of FTSG's third rule ('convergences redistribute power and value')"
```

The MGI ingest **skipped this scan**. The user noticed the omission with the diagnostic question *"Did you find any relations to the convergence 2026 report?"*. The skill is the codified version of doing the scan upfront so the user never needs to ask.

## Common mistakes

| Mistake | Fix |
|---|---|
| Only running Path A, not Path B | Always run both. Path A is fast but blind to pre-GH #4 sources |
| Treating *"both mention AI"* as a relationship | Skip it. The closed vocabulary is `supports` / `contradicts` / `supersedes` / etc. — *"both touch the topic"* isn't an edge |
| Filing one-way edges silently | Surface the candidate list when ≥3. Visible scans don't omit; hidden ones do |
| Adding the edge to frontmatter without body-wikilink | Every typed `relationships:` entry needs a body `[[wikilink]]` with at least one sentence of context, per [§Body-wikilink rule](../../../CLAUDE.md#body-wikilink-rule-load-bearing) |
| Reverse-linking from every neighbour | Reverse-linking is *encouraged but not required* — `scripts/graph-export.mjs` computes inverses. Skip the reverse-link if it would just duplicate the typed edge |
| Forcing a `contradicts` without `via:` | `contradicts` is meaningless without naming *what* the disagreement turns on. If you can't write the `via:` clause, the edge probably isn't `contradicts` |
| Running the scan after committing the ingest | The scan is step 5 of the Ingest checklist, before the index/log updates. Catching omissions in commit-review is more painful than catching them in the scan |

## Red flags — STOP and run the scan

- "This source is obviously isolated, no neighbours" — verify with the grep first, not the intuition
- "I already updated the concept pages, the scan can wait" — the scan informs *which* concept-page sections need updating
- "The user didn't ask for cross-source links" — the scan is non-optional per CLAUDE.md step 5
- "The neighbour-source list is too long, I'll abbreviate" — surface all candidates ≥3, even if most get skipped with reason

## Related skills and references

- [`CLAUDE.md`](../../../CLAUDE.md) §Ingest step 5 (the schema contract this skill operationalises)
- [`CLAUDE.md`](../../../CLAUDE.md) §Source-to-source relationships (vocabulary guidance)
- [`CLAUDE.md`](../../../CLAUDE.md) §Dynamic-capabilities tagging — "Tags as discovery index" paragraph (the affordance)
- [`scripts/lint-page.mjs`](../../../scripts/lint-page.mjs) — current lint enforces W&W tagging + body-wikilink rules but does **not yet** enforce neighbour-scan completeness. A future rule could flag *"source X shares ≥2 W&W cells with source Y but neither carries a typed relationship"*; until then this skill is the discipline
