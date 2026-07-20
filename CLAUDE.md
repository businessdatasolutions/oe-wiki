# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

This is **not** a software project. It is a personal **LLM wiki** repository following the pattern described in `llm-wiki.md` (Andrej Karpathy's "LLM Wiki" idea). The pattern: Claude incrementally builds and maintains a persistent, interlinked markdown knowledge base from raw sources the user curates. The wiki is a compounding artifact — knowledge is compiled once and kept current, not re-derived per query.

`llm-wiki.md` is the conceptual spec. **This CLAUDE.md is the schema layer** — the disciplined, repo-specific instantiation of that spec. Claude owns the wiki layer entirely; the user owns sourcing, exploration, and direction.

## Current state

The wiki is instantiated. As of v0.2 the repo contains:

- `raw/` — source material under `articles/`, `assets/`, `books/`, `images/`, `lectures/`, `papers/`, `reports/`, `videos/`. Immutable.
- `wiki/` — `sources/`, `entities/`, `concepts/`, `threads/`, `syntheses/` plus the catalogues `index.md` and `log.md`. Wikilinks-only cross-refs.
- Page-type frontmatter: `type: source | entity | concept | thread | synthesis | artifact`; `kind:` discriminator on entities and sources; `artifact_kind:` discriminator on artifacts.
- Log entries: `## [YYYY-MM-DD] <op> | <title>` where `<op>` ∈ `ingest | acquire | query | lint | synthesize | refactor | bulk-refactor`. (`acquire` is the v0.9 addition — used only when raw files land without same-session processing; the umbrella op for the typical case remains `ingest`.)
- Quartz publishing via `npm run build` / `npm run serve`; custom extensions in `extensions/`.
- **v0.5 is fully landed (2026-05-17).** All three slices: **retention** (`accessed_at` on concepts + entities + syntheses; §Retention decay curve as lint signal), **search** ([qmd](https://github.com/tobi/qmd) / `@tobilu/qmd` registered as a `package.json`-derived collection; BM25 + vector + query-expansion local models in `~/.cache/qmd/`), **quality** (`quality_score` + `quality_notes` on concepts and syntheses via [`scripts/quality-score.mjs`](scripts/quality-score.mjs); mechanical rubric across structure / citations / cross-consistency). Manual `accessed_at` bumps via [`scripts/bump-accessed.mjs`](scripts/bump-accessed.mjs) pending MCP integration. See [§Lifecycle](#lifecycle), [§Retention](#retention), [§Quality](#quality), [§Search](#search).
- **v0.6 LLM-as-judge slice lands (2026-05-25) for source pages.** `node scripts/quality-source-page.mjs --judge` filters to `kind: paper`, computes the mechanical floor, then invokes headless Claude Code via [`scripts/_lib/llm-judge.mjs`](scripts/_lib/llm-judge.mjs) for the substantive overlay. Scores live only in `logs/quality-source-pages.jsonl` — never in the page. Concepts/syntheses remain mechanical-only. See [§Source-page scoring (v0.6)](#source-page-scoring-v06).
- **v0.7 introduces `wiki/artifacts/`** (`type: artifact`, `artifact_kind:` discriminator) as the dedicated home for verbatim, prose-resistant, paper-tied reproductions (headline tables, named taxonomies, variable dictionaries). See [§Artifacts](#artifacts).

The full system blueprint — architecture, schema, every operation and page type, and the complete inventory of skills, scripts, and Quartz extensions — lives in [`llm-wiki.md`](llm-wiki.md). The feature stack landed across staged versions (v0.2 → v0.9), each landing schema before tooling, with bulk migrations as supervised batches.

## The three layers (architecture)

1. **Raw sources** — user-curated, immutable. Claude reads but never modifies. Source of truth.
2. **The wiki** — LLM-generated, LLM-owned markdown. Summaries, entity pages, concept pages, syntheses, an index, a log. Claude creates, updates, cross-references, and keeps consistent.
3. **The schema** — this file. The contract that turns Claude into a disciplined maintainer.

## The four operations

These replace "build / lint / test" for this repo. Apply them whenever the user invokes the corresponding intent. **Synthesize** is the v0.3 addition — see [§Synthesis](#synthesis) for the full operation. **Ingest** was split into two re-runnable phases — Acquire and Process — in v0.9; the operation count stays at four (Ingest / Query / Lint / Synthesize), but Ingest now has explicit named sub-phases. See §Acquire and §Process below.

### Ingest = Acquire + Process

A new source enters the wiki in two phases. **Acquire** lands a raw file (fetch / convert / place into a typed `raw/` subfolder) and stops. **Process** reads `raw/` and writes `wiki/`. They fail differently and run on different cadences — often in the same session, but skipping either is common (e.g. landing several PDFs today, processing over the week). See §Acquire and §Process below.

### Acquire

A new raw file lands in `raw/`. Acquire **only touches `raw/`** — the wiki source page is not written until §Process runs.

1. **Determine source type → typed `raw/` subfolder.** Organise by source *type*, not topic — different formats have different processing rules. Current typed subfolders: `articles/`, `assets/`, `books/`, `images/`, `lectures/`, `papers/`, `reports/`, `videos/`. Create new typed subfolders on the fly when a genuinely new source category appears (e.g. `raw/patents/`, `raw/interviews/`); don't ask permission for every new type.
2. **Convert before landing.** Source formats that the LLM cannot read in one pass must be converted to markdown *before* landing in `raw/`:
   - PDFs → markdown (`marker`, `pdftotext`, MarkItDown, or a Zotero markdown export) → `raw/papers/<slug>.md`. Keep the original PDF in `raw/assets/` for reference.
   - YouTube / podcast URLs → transcript markdown → `raw/videos/<slug>.md`. The [`youtube-transcript-skill`](.claude/skills/youtube-transcript-skill/SKILL.md) is the canonical acquire-time skill — auto-triggered by any YouTube URL request that mentions transcript / captions / subtitles, or invoked explicitly with `-o raw/videos/<slug>.md`.
   - `.docx` / `.epub` / `.html` → markdown (`pandoc`, `readability`).
3. **Acquire-time skill contract.** A skill that lands a raw file emits the file at `raw/<type>/<slug>.md` with a canonical YAML frontmatter as its first block. The frontmatter is the *contract* between Acquire and Process — Process reads it during pre-flight checks. The video-format contract is specified in detail at [§Pre-flight check (videos): the YAML frontmatter contract](#pre-flight-check-videos-the-yaml-frontmatter-contract); new acquire-time skills (PDF→markdown, web clipper integration, podcast transcription) follow the same pattern: produce a raw file at the canonical path with the canonical frontmatter for its type.
4. **Re-runnable.** Re-acquiring the same source from a better channel (higher-quality transcript, full text replacing a sample) **replaces the raw file**. The wiki source page is not touched until §Process re-runs. This is why Acquire is named as a distinct phase — re-acquisition without re-processing is common and benign.
5. **Log entry.** When Acquire runs without Process in the same session, log as `acquire | <slug or batch description>` (reverse-chronological, top of [`log.md`](wiki/log.md)). When Acquire and Process run together (the typical case), use `ingest | ...` as the umbrella op — no separate `acquire` entry needed.

### Process
A source in `raw/` has not yet been turned into a wiki page. (When invoked under the §Ingest umbrella, Acquire produced this file moments ago; when invoked standalone, the file has been sitting in `raw/` since an earlier session.)
0. **Verify the source's identity and completeness before reading further.** See [§Verifying sources before ingest](#verifying-sources-before-ingest) — including Check 4 (visual inventory) and Check 5 (appendix inventory).
1. **Read the source — text, visuals, *and* appendices.** Markdown conversions frequently strip or mangle images, charts, and complex tables (`pdftotext -layout` always loses images; `marker` keeps them as referenced assets but figure semantics may need recovery). For any source with substantive visuals, also read the original PDF in `raw/assets/` via the Read tool's PDF mode so figures, tables, diagrams, and embedded images enter context. See [§Visual content extraction](#visual-content-extraction) for the methodology. **Appendices are not back matter to skip** — they frequently carry the source's most actionable content (variable definitions, survey instruments, derivations, glossaries). Default to reading; only defer with explicit scoping decision documented per [§Check 5](#check-5--appendix-inventory-what-does-the-appendix-contain-and-how-should-it-be-reproduced). See [§Appendix content extraction](#appendix-content-extraction) for the routing methodology.
2. Discuss key takeaways with the user before writing (default to one source at a time, supervised — unless the user says batch). When the source has substantive visuals, name the visual count in the pre-write summary (e.g. *"~4 figures, 11 tables — I'll describe all in §Visual content"*). When the source has substantive appendices, name them too (e.g. *"Appendix table of 164 variables — I'll reproduce inline + extract to standalone concept page"*) so the user can confirm scope before commit.
3. Write a summary page in the wiki. The body must include a `## Visual content` section per [§Visual content extraction](#visual-content-extraction) — exhaustive accessibility-quality descriptions of every visual in the source, positioned between `## Results (WHAT)` and `## Distinctive artifacts`. When the source carries substantive appendix material, the body must also include a `## Appendix content` section per [§Appendix content extraction](#appendix-content-extraction), positioned between `## Visual content` and `## Distinctive artifacts`.
4. **Tag the source's `dynamic_capabilities:` frontmatter** with the Warner & Wäger microfoundation(s) / strategic-renewal outcome(s) / contextual factors it touches, per [§Dynamic-capabilities tagging](#dynamic-capabilities-tagging). Tagging is encouraged, not forced — skip when the source genuinely sits outside the W&W lens (e.g. pure LLM-internals papers).
5. **Run a neighbour-source scan.** Query `wiki/sources/` for sources that share at least one `dynamic_capabilities:` cell with the new source, **or** that already cite any of the concept pages you intend to update in step 6 (the fallback path catches pre-GH #4 sources that don't carry W&W tags yet). For each candidate, decide on a typed `relationships:` edge — typically `supports` if both sources address the same phenomenon from compatible angles, `contradicts` if findings or framings conflict (pair with `via:`), or `supersedes` if the new source replaces a prior claim wholesale (per [§Supersession protocol](#supersession-protocol)). Add the edge to the **new source's** frontmatter `relationships:` block. Reverse-linking from the neighbour is encouraged but not required — the graph export computes inverses, and the body-wikilink rule applies in both directions. Skip neighbours where no defensible edge type fits — *not every co-occurrence is a relationship*. **At ≥3 candidate neighbours, surface the list in your response so the user can spot omissions before commit.** See [§Source-to-source relationships](#source-to-source-relationships) for vocabulary guidance.
6. Update **every** affected entity, concept, and topic page across the wiki — a single ingest may touch 10–15 files. On every touched concept/entity page, bump `last_confirmed` to today's date and recompute `source_count` and `confidence` per [§Lifecycle](#lifecycle).
7. Update `index.md` (catalog of pages, one-line summaries, organized by category).
8. Prepend an entry to `log.md` using the agreed prefix format — new entries go directly under the `---` separator at the top of the file (reverse-chronological convention since 2026-05-12, GH #3), so the most recent entry is the first one in the file. Use `ingest | ...` as the umbrella op regardless of whether Acquire ran in this session or a previous one — only the standalone-Acquire case (no Process) gets the separate `acquire | ...` op (see §Acquire step 5).
9. When new data contradicts an older claim, flag it explicitly in the page's `## Debates and supersession` section. If the new source supersedes an older one wholesale, set `supersedes:` on the new source page and `status: stale` + `superseded_by:` on the retired page — never delete the retired page.

### Query
The user asks a question against the wiki.
1. Read `index.md` first to locate relevant pages, then drill into them. Embedding-based RAG is unnecessary at moderate scale.
2. Synthesize an answer **with citations** (link back to wiki pages and, where relevant, raw sources).
3. Output format follows the question — markdown page, comparison table, slide deck (Marp), chart (matplotlib), canvas. Don't default to prose.
4. **File good answers back into the wiki as new pages.** Comparisons, analyses, discovered connections are valuable artifacts — they should not disappear into chat history. Update `index.md` and `log.md` accordingly.

### Lint
Periodic health check of the wiki.
- Detect contradictions between pages.
- Find stale claims superseded by newer sources.
- Flag orphan pages (no inbound links).
- Identify concepts mentioned but lacking their own page.
- Note missing cross-references and data gaps that warrant a web search or new source.
- Suggest new questions to investigate.
- Run `node scripts/lint-source-neutrality.mjs` — catches `bedrijfscase-bron` pages that have drifted into answering the students' own kernvragen (see Working principles).
Report findings; let the user decide what to act on.

## Verifying sources before ingest

Filenames lie, samples masquerade as full sources, and PDFs get truncated. **Before treating any raw source as authoritative, run these pre-flight checks. Surface mismatches to the user *before* writing wiki pages — bad source data corrupts the wiki and is hard to remove cleanly later.**

### Pre-flight check (videos): the YAML frontmatter contract

For new YouTube sources, invoke the [`youtube-transcript-skill`](.claude/skills/youtube-transcript-skill/SKILL.md) first — it produces this format directly. The skill is auto-triggered by any YouTube URL request that mentions transcript / captions / subtitles, or can be invoked explicitly with `-o raw/videos/<slug>.md` to land at the canonical path.

Video transcripts in `raw/videos/` carry their human-readable identity in YAML frontmatter at the top of the file:

```yaml
---
title: <video title>
video_id: <youtube id>
url: <source URL>
channel: <channel name>
channel_id: <youtube channel id>
channel_url: <channel URL>
publish_date: '<ISO-8601 with timezone, e.g. 2026-05-08T11:50:11-07:00'>
upload_date: '<ISO-8601 with timezone>'
category: <youtube category>
duration: '<MM:SS>'
length_seconds: <integer>
view_count: <integer>
caption_tracks:
  - language_code: <iso>
    name: <track name>
    kind: <asr | manual>
    is_translatable: <bool>
description: |
  <youtube description text, multi-line>
notes: |
  <ingest-time provenance: ASR cleanups applied, section headings inferred, etc.>
---
```

The skill emits all of the above plus optional fields (`thumbnails:`, `keywords:`, `chapters:`, `is_live:`, `is_family_safe:`, `default_language:`, `available_countries:`); they're useful but not load-bearing for pre-flight identity.

**Canonical pre-flight fields the wiki cares about:** `title`, `url`, `channel`, `publish_date`. If any of these four is missing or empty, stop and ask the user.

**Before treating the file as a source for ingest:**

1. Read the YAML frontmatter (everything between the opening and closing `---`). Extract the four canonical fields plus `description:` and `caption_tracks[].kind` (used downstream during source-page creation, see [§Source-page conventions specific to videos](#source-page-conventions-specific-to-videos)).
2. Slugify the title to a filesystem-safe form: lowercase, ASCII, words joined by `-`, drop punctuation. Example: `Rethinking Agents - Harness is All you Need` → `rethinking-agents-harness-is-all-you-need.md`.
3. The raw file should already be at `raw/videos/<slug>.md` if the skill was invoked with `-o`; otherwise rename in place (`mv raw/videos/<file>.md raw/videos/<slug>.md`; use `git mv` once the file is tracked). **The non-descriptive name does not survive into the repo's history-of-record beyond this rename commit.**
4. The source URL goes onto the wiki source page as a top-level frontmatter field: `url: "<youtube-or-other url>"` (verbatim from the raw file).
5. The wiki source page filename uses the **date component** of `publish_date:` as its prefix: `wiki/sources/<YYYY-MM-DD>-<slug>.md`. Strip any time/timezone component (`'2026-05-08T11:50:11-07:00'` → `2026-05-08`).
6. The raw `channel:` line is the canonical attribution. Use it verbatim in the source page's `author:` array as a single-element list. Presenter name (when ≠ channel) is named in body prose, never in separate frontmatter.
7. Then proceed with Checks 1–3 below (Scope / Identity / Honest scoping) adapted as: *scope* = full transcript? *identity* = does the title at top match what the transcript actually delivers? *honest scoping* = state runtime in mm:ss using `duration:` and `length_seconds:`.

**Legacy-format compatibility (transition).** Files written before 2026-05-09 may use a four-line plain-text header (`title:` / `author:` / `url:` / `date published:`) without `---` delimiters and without the rich fields. Both formats are readable; YAML is canonical for new ingests. Map legacy `author:` → new `channel:` and legacy `date published:` → new `publish_date:` mentally when reading. The two legacy raw files in this repo (Karpathy at Sequoia AI Ascent; Prompt Engineering YouTube) were backfilled to YAML on 2026-05-09.

#### Source-page conventions specific to videos

The wiki source-page schema is **unchanged**. Only the source field names from the raw file change. Use this field-mapping table when drafting a video source page:

| Raw (skill output) | Wiki source page | Transformation |
| --- | --- | --- |
| `title:` | `title:` | quote-wrap if it contains `:`; otherwise verbatim |
| `channel:` | `author:` | single-element list: `["<channel>"]` |
| `url:` | `url:` | verbatim, quoted |
| `publish_date:` | `date_published:` | strip time component → ISO date only |
| `duration:` + transcript line count | `length:` | format `"~MM:SS minutes (transcript ~N lines)"`; line count computed at ingest time |
| `caption_tracks:[].kind` | source-quality flag in body (not confidence) | `kind: asr` → "auto-generated transcript, ASR-cleaned"; `kind: manual` → "human-curated transcript". *Sources do not carry confidence per [§Lifecycle](#lifecycle); transcript provenance does not feed into confidence math.* |
| `description:` | **leading blockquote in body**, before TL;DR | renders the channel's own framing of the video before the wiki's interpretation. Mandatory for video source pages. |
| `chapters:` (if present) | optional: mirror as body section headings | not load-bearing — body structure follows the source page's own rhetorical needs |
| `keywords:` | seed for `tags:` | merge with hand-curated tags |
| `category:` | optional `tags:` entry | e.g. `Science & Technology` → `science-technology` if useful |

Fixed schema fields on the source page:

- `kind: video`
- `length: "~MM:SS minutes (transcript ~N lines)"` — duration first, line count parenthetical.
- `raw: "../../raw/videos/<slug>.md"` — points to the canonical raw file.
- `url:` is mandatory (videos are first-class web sources; the file we hold is just a transcript snapshot).
- `date_published:` taken from the raw file's `publish_date:` (legacy: `date published:`), ISO-normalised to date only.
- `author:` taken from the raw file's `channel:` (legacy: `author:`) as a single-element array.
- **No separate `channel:` field on the source page** — the convention is `author = channel` for videos. The skill's `channel_id:` and `channel_url:` are not promoted into source-page frontmatter; capture them in body if substantively useful.

**Body opening for video source pages.** The body begins with the YouTube `description:` rendered as a blockquote (after the H1, before the wiki's own framing). This makes the channel's stated framing of the video legible to readers before the wiki's interpretation overlays it.

### Check 1 — Scope: is this the whole source?

- Note the **PDF's actual page count** (the Read tool reports it; for very large PDFs the "too many pages" error message gives the count).
- For books and long reports, read the table of contents and note the **highest chapter/section page reference**.
- If the highest TOC page-reference is significantly larger than the actual PDF page count, **the file is a sample, preview, or excerpt — not the full source.** Stop and ask the user before writing wiki pages.
- **Suspect filename patterns** that warrant extra scrutiny:
  - `L-NNNNNNNN-pdf*.pdf` — OverDrive/library checkout previews.
  - `*-sample.pdf`, `*-preview.pdf`, `*-excerpt.pdf`, `*-chapter-N.pdf` — explicit excerpt names.
  - Any "book" file under ~50 pages whose TOC references chapters past page 50.
  - Generic content-management filenames with no author/title (e.g. `download.pdf`, `(1).pdf`).

### Check 2 — Identity: does the filename match the content?

- Read the cover/title page and identify the source from the **content**: authors, title, edition, year, publisher.
- If the filename doesn't match (precedent: `Mitchell and Dino - 2011 ...pdf` actually contained Dell'Acqua et al. 2026), flag the mismatch to the user.
- Convention when the mismatch is real but the user wants to keep the on-disk filename: the source page's slug is named for the actual content; the `raw:` frontmatter preserves the literal filename; note the mismatch in the source page and in the log.

### Check 3 — Honest scoping in the source page

- The `length:` frontmatter field should state **what was actually read**, not the source's nominal full length.
  - Full ingest: `"~12 pages"` (whole article).
  - Partial / front-matter ingest: `"~317 pages (read pp. 1–15: front matter, intro, framework — body chapters deferred)"`.
- The TL;DR and an explicit "What was actually ingested" section should make deferred scope visible.
- Precedents that handle this correctly: [`2026-04-28-ftsg-convergence-outlook-2026`](wiki/sources/2026-04-28-ftsg-convergence-outlook-2026.md) and [`2026-04-30-ai-index-report-2026`](wiki/sources/2026-04-30-ai-index-report-2026.md).

### Check 4 — Visual inventory: what visuals does the source carry, and did the conversion preserve them?

The first three checks ensure the *text* of the source is intact; this check ensures the *visuals* are accounted for. **Run this check on every source that is not exclusively text-based** — papers, reports, books, videos, lectures, articles with embedded media, images. Audio-only sources (podcasts) skip the check trivially.

Conversion fidelity degrades visuals in predictable patterns:

| Source type | Conversion route | What survives | What's lost |
| --- | --- | --- | --- |
| PDF (paper/report/book) | `pdftotext -layout` | Inline-text tables (mangled), prose | All images, all charts, complex tables |
| PDF (paper/report/book) | `marker` / `marker_single` | Prose, image references (`![](…)`), most tables | Figure semantics (the asset name says nothing about meaning) |
| PDF (paper/report/book) | MarkItDown / Pandoc | Prose, some tables | Most images |
| Video (lecture / talk / interview) | `youtube-transcript-skill` | Spoken text, frontmatter metadata | All visuals: slides, screen content, demos, gestures, on-screen captions |
| Article (web) | Obsidian Web Clipper / readability | Prose, often image references | Inline chart interactivity, sometimes images depending on source |
| Image (`kind: image`) | n/a — the source *is* the visual | n/a | n/a |

Run a four-part inventory before drafting the source page:

1. **Count visuals in the raw source.**
   - **For PDFs**: grep the markdown for `Figure N` / `Fig. N` / `Table N` / `Equation N` references and the corresponding visual blocks. Note the totals (e.g. *"~4 figures, 11 tables, 3 equations"*).
   - **For videos**: scan the transcript for visual cues — `[slide change]`, `as you can see`, `this chart shows`, `the screen shows`, `let me demonstrate`, `here on screen`, plus chapter markers when present. Also estimate slide count if the video is a slide-based talk (slide-changes-per-minute × duration). Note totals (e.g. *"~38 slides + 2 live demos, no auxiliary visuals"*).
   - **For articles**: count embedded images / charts / infographics in the converted markdown and at the source URL if available.
   - **For images**: there is exactly one visual — the source itself. Note its type (photo / chart / diagram / screenshot / illustration).
2. **Check the conversion's fidelity.**
   - **PDFs**: does the markdown contain `![…](…)` image references? Do tables survive as proper markdown, or as space-aligned ASCII the conversion will mangle on render?
   - **Videos**: the transcript captures *zero* visuals by construction — the youtube-transcript-skill outputs speech only. **Plan to read the original video's visual frames separately**: open the YouTube URL via web tools that return key frames, screenshot via Chrome DevTools MCP, or rely on the transcript's verbal references when frame capture isn't possible. State the chosen recovery path in the source page's `notes:` field.
   - **Articles**: are the image references resolvable? If the clipper kept relative paths to assets that didn't get downloaded, the images are effectively lost.
3. **If the conversion lost visuals, plan the recovery path during §Process step 1.**
   - **PDFs**: read the original in `raw/assets/<slug>.pdf` via the Read tool's PDF mode.
   - **Videos**: fetch keyframes / screenshots from the live YouTube URL, or describe visuals from the transcript's verbal references with the honesty caveat *"visual descriptions inferred from speaker references; no frame capture performed"*.
   - **Articles**: read the source URL directly if visuals weren't preserved in the clip.
4. **Surface the inventory to the user in the pre-write summary** so the user can confirm whether all visuals get described in `## Visual content` or only the load-bearing ones. A 40-figure book is different from a 3-figure paper; a 38-slide talk is different from a single-slide interview.

See [§Visual content extraction](#visual-content-extraction) for what to do with the inventory once captured.

### Check 5 — Appendix inventory: what does the appendix contain, and how should it be reproduced?

Checks 1–3 ensure the *text* of the source is intact; Check 4 inventories the *visuals*; this check inventories the *appendix material*. **Run this check on every source whose page count, table of contents, or end-pages suggest appendix material** — papers, reports, books, and longer articles. Skip for short articles, blog posts, video transcripts, and image sources where no appendix exists. Appendices over-index on the wiki's most reusable content (variable definitions, survey instruments, derivations, glossaries) so silent omission is the highest-cost failure mode of any pre-flight check.

Conversion fidelity degrades appendix material in predictable patterns:

| Source type | Conversion route | What survives | What's lost |
| --- | --- | --- | --- |
| PDF (paper / report) | `pdftotext -layout` | Inline prose, mangled tables | Multi-page tables that straddle page boundaries; columnar layouts; embedded figures |
| PDF (paper / report) | `marker` / `marker_single` | Prose, image references, most tables | Cross-references between appendix and body (Appendix Table A.1 ↔ §Methods); long-row appendix tables that wrap |
| PDF (paper / report) | MarkItDown / Pandoc | Prose, some tables | Most appendix-specific layouts; equation arrays |
| PDF (book) | any route | Front matter, body | Back matter (indices, bibliographies, errata) frequently truncated when only a sample/preview was acquired (see [§Check 1](#check-1--scope-is-this-the-whole-source)) |
| Article / web | Obsidian Web Clipper | Body prose | Almost always loses linked PDFs containing appendices; "supplementary material" links lost entirely |

Run a four-part inventory before drafting the source page:

1. **Locate the appendix(es) in the raw source.**
   - **For PDFs**: scan the table of contents for entries named `Appendix` / `Appendix A` / `Online Appendix` / `Web Appendix` / `Supplementary Material`; scan the end pages directly via the Read tool's PDF mode. Note the page range of each.
   - **For reports**: appendices may be embedded in the main flow under section numbers (e.g. §A, §B) rather than back-matter — search for `^Appendix` headers.
   - **For books**: distinguish substantive appendices (statistical tables, dataset descriptions, primary documents) from formal back matter (notes, bibliography, index).
   - **For articles**: check both the converted markdown and the source URL — many articles link to supplementary PDFs that the clipper does not follow.
2. **Classify each appendix by archetype.** Match against the archetype reference table in the [`scientific-papers-processing`](.claude/skills/scientific-papers-processing/SKILL.md) skill — variable definitions, survey instruments, mathematical derivations, sample data, coding/algorithm details, supplementary statistical tables, supplementary figures, glossaries, or author bios. The archetype determines reproduction strategy.
3. **Note page range + one-line content summary per appendix.** Example: *"Appendix (pp. 2411–2416, PDF pp. 30–35): variable definitions — 164 predictor variables across 18 categories; reproduction candidate."*
4. **Decide reproduction strategy per appendix *before* writing.** Three routing options: (a) reproduce inline in `## Distinctive artifacts`; (b) promote to a standalone concept page (`wiki/concepts/<slug>.md`) — the right move when the catalogue is reusable across multiple corpus sources; (c) defer with explicit reason (e.g. *"200-page raw dataset; provenance noted but not transcribed"*). Surface the decisions to the user in the pre-write summary so scope is confirmed before commit.

See [§Appendix content extraction](#appendix-content-extraction) for what to do with the inventory once captured.

### What to report when a check fails

State: (a) the file as it presents itself (filename, claimed identity from cover), (b) the file as it actually is (page count, identified content, scope), (c) the discrepancy, (d) the proposed next action (ingest as partial / wait for full file / proceed under a different identity). Then ask before proceeding.

## Visual content extraction

Source materials carry meaning in their visuals that the prose summary doesn't capture: a chart's trajectory, a diagram's topology, a table's values, a figure's spatial layout. **Every wiki source page describes the source's visual content in a dedicated `## Visual content` section** — exhaustive, accessibility-quality descriptions designed to make the visuals legible to a reader who cannot see them, *and* to make the visuals searchable through qmd (which indexes markdown body text).

This complements `## Distinctive artifacts` (which *reproduces* named load-bearing tables / taxonomies / equations as wiki-native content). The split:

- **`## Visual content`** — the **catalogue**. Every visual in the source gets an entry with a detailed prose description. Accessibility-first.
- **`## Distinctive artifacts`** — the **reproductions**. Load-bearing visuals are recreated as markdown tables, fenced code (for equations), or Mermaid diagrams. Wiki-native, copyable, citable.

A load-bearing visual appears in **both** sections: a description (Visual content) and a reproduction (Distinctive artifacts). The Visual-content entry for such a visual can end with `→ reproduced in [§ Distinctive artifacts](#distinctive-artifacts)` to avoid duplicating the data.

### When the section is required

**The rule:** the `## Visual content` section applies to *every* source that is **not exclusively text-based**. The kind doesn't decide — the source's carrier does. A paper with no figures is exclusively text-based; an article with embedded charts is not; a video is *never* exclusively text-based (the transcript is text, but the source is audiovisual).

| Source carrier | `## Visual content` required? |
| --- | --- |
| **Has visuals** — figures, tables (as visual objects, not just markdown tables), diagrams, charts, photos, screenshots, slides, on-screen demos, illustrations, maps, equations rendered as images, infographics | **Yes** — always. Applies across `paper`, `report`, `book`, `image`, `lecture`, `video`, `article` with visuals, and any new kind that carries non-text content. |
| **Exclusively text-based** — plain articles with no embedded images, dialogue transcripts, op-eds, text-only blog posts | **Not required.** Write a one-line `> No visuals in source.` so the absence is auditable. |
| **Audio-only** — podcasts, audio interviews, radio broadcasts | **Not applicable** — there are no visuals to describe. The transcript captures everything. (If the podcast has visual companion material like show-notes diagrams or slide decks, those become visuals to describe.) |

The decision rule: if a sighted reader of the source would experience information that a transcript-only reader would miss, you have visuals to describe. **Default to writing the section.** Silent omission is indistinguishable from forgetting.

#### Kind-specific notes

- **Papers, reports, books** — figures, tables, equations, flow diagrams. Most familiar case.
- **Videos** — slides, screen recordings, code on screen, demonstrations, gestural emphasis when load-bearing, on-screen captions or chyrons, whiteboard work. The transcript references many of these implicitly ("as you can see here", "this slide shows", "[slide change]"); the section makes those references concrete. A talking-head interview with no visual content beyond the speakers' faces gets a minimal section that says so (`> Single fixed shot of two speakers; no slides, demos, or screen content shown.`) — that *is* the auditable absence.
- **Lectures** — same as videos, with extra weight on slides and chalkboard / whiteboard work.
- **Images** (kind `image`) — the source *is* the visual. The Visual content section is the body of the page.
- **Articles with visuals** — hero images, embedded charts, infographics, photos accompanying journalistic text.
- **Articles without visuals** — text-only blog posts, op-eds, plain news copy. The one-line `> No visuals in source.` marker.
- **Podcasts** — outside the rule (audio-only). If the podcast has a companion video version or published slide deck, ingest those as separate sources or note the visual companion material in the body.

### Description format

Each visual entry follows this skeleton:

```markdown
### Figure N — <verbatim caption, or one-line summary if no caption>

**Type:** chart / diagram / photo / equation / flowchart / heatmap / map / screenshot / table / illustration
**Caption (verbatim):** <if present in source; omit the line if there is no caption>
**Location:** p. NN (or §X.Y, or timestamp MM:SS for videos)

<Prose description, 50–200 words for substantive visuals; 20–50 for incidental ones.>
```

The description must convey, where applicable to the visual type:

- **Layout / structure** — what is where. *"Two-panel figure: left panel time series 2010–2024; right panel cross-sectional histogram."*
- **Axes and scales** (charts) — labels, units, ranges, log/linear, whether axes are shared across panels.
- **Values and quantities** (tables, charts) — headline numbers, peaks, troughs, statistically significant cells. Don't transcribe every cell of a 50-row table; pick the load-bearing ones and note *"remaining N rows show …"*.
- **Trends and patterns** — direction, shape, inflection points, clustering, outliers, segments.
- **Visual encoding** — colour schemes (when meaningful), shape conventions (e.g. squares = treatment, circles = control), line styles (solid vs dashed).
- **Annotations** — arrows, labels, text overlays, footnotes attached to the visual.
- **What the visual is arguing** — one sentence on what the author is asking the reader to see.

For **incidental visuals** (correlation heatmaps, descriptive-statistics tables, scatter plots used for diagnostic checks, decorative photos), keep the description short — naming, location, one sentence of substantive content is enough.

For **load-bearing visuals also reproduced in `## Distinctive artifacts`**, the description still names the visual's *kind*, *location*, and *argumentative role*; the data itself lives in the reproduction. End the entry with `→ reproduced in § Distinctive artifacts`.

### Position on the source page

`## Visual content` goes **after** `## Results (WHAT)` and **before** `## Distinctive artifacts`. The reading order becomes:

1. **Results** — what the source found (prose).
2. **Visual content** — how the source *showed* it (catalogue + descriptions of all visuals).
3. **Distinctive artifacts** — reproductions of the load-bearing ones, as wiki-native content.
4. **Discussion** — what it means.

The "show → reproduce → interpret" order mirrors how a reader naturally engages with a paper: scan figures, zoom in on the headline ones, then absorb the takeaway.

### Methodology — how to actually extract the descriptions

The Read tool supports both image files and PDFs (rendering pages with embedded image descriptions in vision-capable models). The workflow:

1. **Open the PDF in `raw/assets/<slug>.pdf`** with the Read tool, using the `pages:` parameter on large documents to focus on the page ranges where figures live.
2. **For each visual found**, write the entry per the format above. Quote the caption verbatim if present; cite figure/table numbers as the source uses them (don't renumber).
3. **For markdown conversions that captured the figure as a referenced asset** (e.g. `![Figure 3](_page_5_Figure_2.jpeg)`), open the referenced asset and describe it directly.
4. **For tables already captured cleanly in the markdown conversion**, the Visual-content entry still gives a structural description ("3 columns × 8 rows; columns are X / Y / Z") plus the headline observations; the full transcription belongs in `## Distinctive artifacts` only if the table is load-bearing.
5. **Honest scoping applies.** If a visual is illegible (low-res scan, OCR-mangled text inside a flowchart, foreign-language labels), say so in the description rather than guessing: *"Figure 3 is a flowchart whose internal labels are partly illegible due to scan quality; the inferred topology is …"*.

### Quality interaction (D3 dimension)

The source-page quality rubric ([`quality-rubric.md`](.claude/skills/scientific-papers-processing/quality-rubric.md)) penalises pages with no Figure/Table mentions and no `## Distinctive artifacts` section (D3 dimension). Populating `## Visual content` does **not** by itself satisfy D3 — the reproduction obligation remains. But a thorough Visual-content section makes the D3 reproduction decision trivial: the load-bearing visuals are already named and located.

### What this section is not

- **Not full transcription.** The wiki page is a summary with structured visual descriptions; the original PDF in `raw/assets/` remains the canonical full-fidelity record.
- **Not a replacement for `## Distinctive artifacts`.** Reproduction and description serve different needs.
- **Not automated.** No script extracts visuals yet; §Process step 3 is the manual operation. A future helper (e.g. `scripts/visual-inventory.mjs`) may inventory visuals across the corpus, but the descriptions stay editorial.

### Backfill expectations

Source pages ingested before this rule do not carry `## Visual content`. Backfill is **opportunistic**: when a page is re-opened during a query or related ingest, add the section then. There is no obligation to bulk-backfill the corpus — the rule applies prospectively to all new Process runs.

## Appendix content extraction

Source materials often carry their most actionable content in the appendix: variable dictionaries that other studies reuse, survey instruments that enable replication, mathematical derivations that underpin named results, glossaries that anchor domain vocabulary. These are exactly the artifacts experts (human and agent) need for setting up their own analyses and experiments. **Every wiki source page whose appendix carries substantive content describes that content in a dedicated `## Appendix content` section** — a catalogue with type, location, and a reproduction decision per appendix, designed to make the appendix material legible to a reader who hasn't opened the PDF, and to make load-bearing content reusable through wiki-native artifacts.

This complements `## Visual content` (which inventories every figure/table by visual appearance) and `## Distinctive artifacts` (which reproduces load-bearing material as wiki-native content). The split:

- **`## Visual content`** — the visual *catalogue*. Every figure/table that appears in the body, described for accessibility.
- **`## Appendix content`** — the appendix *catalogue*. Every appendix described with type, location, content summary, and routing decision (reproduce / promote / defer).
- **`## Distinctive artifacts`** — the *reproductions*. Load-bearing material from body or appendix reproduced as wiki-native markdown / Mermaid / fenced code.

A load-bearing appendix appears in **multiple** sections: a routing entry in §Appendix content, a reproduction in §Distinctive artifacts (when inline) or a wikilink to a promoted concept page (when extracted), and — if the appendix material includes figures — accessibility descriptions in §Visual content.

### When the section is required

**The rule:** the `## Appendix content` section applies to *every* source whose appendix carries non-trivial content. If a sighted reader of the source would gain access to substantive material from the appendix that a body-only reader would miss, you have appendix content to catalogue. **Default to writing the section.** Silent omission is indistinguishable from forgetting.

| Source carrier | `## Appendix content` required? |
| --- | --- |
| **Has substantive appendices** — variable definitions, survey instruments, mathematical derivations, sample data, coding/algorithm details, supplementary statistical tables, supplementary figures, glossaries | **Yes** — always. |
| **Has only formal back matter** — author bios, funding statements, conflict-of-interest, IRB approval, acknowledgments, bibliography, index | **Yes** — but as a single one-line marker: `> Appendix [X] contains <bios / funding / disclosures / bibliography> — not substantive content; not transcribed.` so the absence is auditable. |
| **No appendix at all** — short articles, blog posts, video transcripts, image sources, brief reports | **Not required.** The quality rubric's D6 dimension scores N/A for these (excluded from total denominator). |

### Description format

Each appendix entry follows this skeleton:

```markdown
### Appendix [letter/number] — <name or one-line topic>

**Type:** <archetype: variable-definitions | survey-instrument | mathematical-derivation | sample-data | coding-algorithm | supplementary-tables | supplementary-figures | glossary | author-bios>
**Location:** pp. NN–NN (PDF pp. MM–MM if different from journal/print pagination)
**Reproduction:** inline in §Distinctive artifacts | extracted to [[concept-page-slug]] | deferred (<reason>)

<Content summary: what the appendix carries; row counts / question counts / equation counts; key categories; load-bearing observations. 50–200 words for substantive appendices; one line for formal back matter.>
```

The description must convey, where applicable to the archetype:

- **Structure** — what the appendix contains by category. *"164 variables across 18 categories: Z-Score (5), Business development (4), Profitability (10), …"*.
- **Reproduction decision and rationale** — why inline reproduction vs concept-page promotion vs deferral was the right call.
- **Cross-references to body claims** — which §Methods / §Results sections depend on this appendix material.
- **Honest scoping** — if only part of the appendix was read or transcribed, state which part and why.

### Position on the source page

`## Appendix content` goes **between** `## Visual content` and `## Distinctive artifacts`. The reading order becomes:

1. **Results** — what the source found.
2. **Visual content** — how the source *showed* it.
3. **Appendix content** — what the source *enables* (variable definitions, instruments, derivations).
4. **Distinctive artifacts** — reproductions of load-bearing body and appendix material.
5. **Discussion** — what it means.

The "show → catalogue → reproduce → interpret" order matches how an expert reader engages: scan results, inspect visuals, mine the appendix for reusable material, absorb the takeaway.

### Methodology — how to actually extract the content

The Read tool's PDF mode supports `pages:` ranges, so appendix extraction is targeted rather than a full-document re-read:

1. **From Check 5 inventory**, you have the page range of each appendix. Open the PDF in `raw/assets/<slug>.pdf` with `pages: "NN-MM"` scoping to just the appendix.
2. **Per archetype**, follow the reproduction strategy from the [archetype reference table](.claude/skills/scientific-papers-processing/SKILL.md#appendix-archetypes):
   - **Variable definitions / data dictionaries** → reproduce as wiki-native markdown table; promote to a standalone concept page when reusable across the cluster.
   - **Survey instruments** → reproduce as fenced quote or numbered list; promote when the instrument is named (Big Five, NPS, MBTI).
   - **Mathematical derivations** → reproduce as fenced math; promote when the derivation underpins a named result.
   - **Sample data / examples** → reproduce as fenced code or table; rarely promoted.
   - **Coding / algorithm details** → reproduce as fenced code or pseudocode; promote when the algorithm is named.
   - **Supplementary statistical tables** → describe in §Visual content with location; reproduce only if load-bearing.
   - **Supplementary figures** → describe in §Visual content; reproduce only if load-bearing.
   - **Glossaries** → reproduce as inline table or promote to standalone glossary concept page.
   - **Author bios / funding** → one-line marker only; skip transcription.
3. **For promoted concept pages**, create the page with frontmatter that cites the source as `source_count: 1` and `confidence: 0.85` (single-source baseline), and add typed `relationships:` linking to the originating source page (`part-of` or similar — use the closest match from the [closed vocabulary](#closed-vocabulary)).
4. **Honest scoping applies.** If an appendix is partially read (e.g. the first half of a 200-row table is transcribed; the rest is deferred to a future ingest), say so in the entry's content summary and in the `length:` frontmatter field.

### Quality interaction (D6 dimension)

The source-page quality rubric ([`quality-rubric.md`](.claude/skills/scientific-papers-processing/quality-rubric.md)) scores appendix coverage as dimension D6 (0–3, N/A when no appendix). Populating §Appendix content with type/location/content summary for every appendix satisfies D6 = 2. Promoting at least one appendix to a reusable wiki-native artifact (concept page) earns D6 = 3. Silent omission (appendix mentioned in body but no §Appendix content section) scores D6 = 0.

### What this section is not

- **Not full transcription of every appendix.** The wiki page is a catalogue with reproduction decisions; the canonical full-fidelity appendix lives in `raw/assets/<slug>.pdf`.
- **Not a replacement for `## Distinctive artifacts`.** Cataloguing routes appendix content; reproduction lands it as wiki-native artifact. Both required when appendix material is load-bearing.
- **Not automated.** [`scripts/lint-appendix-coverage.mjs`](scripts/lint-appendix-coverage.mjs) checks for the section's presence and basic structure, but the catalogue and reproduction decisions stay editorial.

### Backfill expectations

Source pages ingested before this rule do not carry `## Appendix content`. Backfill is **opportunistic**: when a page is re-opened during a query, related ingest, or the user explicitly asks about appendix material, add the section then. There is no obligation to bulk-backfill the corpus — the rule applies prospectively to all new Process runs.

## Working principles

- **The wiki is Claude's codebase.** Touching 15 files in one ingest is normal and expected. Don't be timid about cross-cutting updates — that's the point of the pattern.
- **Cross-references are the product.** A page without links is undermaintained. Always check what should link to what when adding or updating a page.
- **Bookkeeping is the job.** Humans abandon wikis because maintenance grows faster than value. Claude's value here is precisely doing the bookkeeping — index updates, log entries, cross-reference repair, consistency sweeps — without being asked twice.
- **Sources are immutable.** Never edit files in the raw collection. Only read.
- **Verify before you trust.** Filenames lie, samples masquerade as full sources, PDFs get truncated, and the highest-leverage content is often locked in appendices that get silently skipped. Run the five pre-flight checks (scope, identity, honest scoping, visual inventory, appendix inventory) before any ingest. The cleanup cost of a wiki page written on incomplete or misidentified data is much higher than the verification cost.
- **Co-evolve the schema.** When a workflow turns out to work well (or badly), update this file so future sessions inherit the lesson. The schema is meant to drift toward the user's actual workflow over time.
- **Citations beat assertions.** Wiki claims should be traceable to a source. When synthesizing across sources, say so.
- **A `bedrijfscase-bron` page supplies raw material, never the analysis.** It carries what the book reports about the company, with citations. It must NOT answer the two kernvragen from LRD §2.5 (*Hoe probeert deze organisatie te concurreren? Wat kan de operationele functie daaraan bijdragen?*), must not answer the Lean 4.0 critical-lens question from §6.9, and must not name gates or leeruitkomst numbers. That analysis is the students' work on their own `team-case` page (FR-01, FR-15). The reason is structural: §6.9 requires the Socratic tutor to cite these pages *"zonder ooit zelf te verklappen welk antwoord 'goed' is"* — a page that states the answer defeats that guarantee no matter how carefully the tutor is prompted. Enforced by `scripts/lint-source-neutrality.mjs`. Week-landing pages and the ai-wiki contentmap pages are exempt by design: posing the question and mapping content onto outcomes is navigation, not an answer.

## Tools and environment

- The wiki is intended to be browsed in **Obsidian** alongside the LLM session — graph view, backlinks, and Dataview (if frontmatter is used) are part of the user's reading experience. Prefer Obsidian-friendly conventions (e.g. `[[wikilinks]]`, attachment folder under `raw/assets/`) once that is confirmed with the user.
- **Obsidian Web Clipper** is the expected pipeline for getting web articles into the raw collection as markdown.
- **Marp** (markdown slide decks) and **matplotlib** charts are first-class output formats for query answers, alongside markdown pages.
- The repo is plain markdown in git — version history, branches, and diffs apply normally to wiki edits.

## Frontend / GitHub Pages

The wiki is published as a static site via **[Quartz v4](https://quartz.jzhao.xyz/)**, deployed to GitHub Pages on every push to `main`.

- **Source**: `wiki/` (untouched — Quartz reads it directly via `-d wiki`).
- **Config**: `quartz.config.ts`, `quartz.layout.ts` at repo root.
- **Custom extensions** (in `extensions/`):
  - `inject-type-tags.ts` — auto-adds `type/<type>` and `kind/<kind>` tags from frontmatter so the graph view and tag pages cluster pages by type. Source files stay clean.
  - `inject-aliases.ts` — appends frontmatter `aliases` to the indexed body so FlexSearch finds pages by alias.
  - `backlinks-with-aliases.tsx` — replaces Quartz's stock Backlinks component. The stock one only matches inbound links by canonical slug; this one also matches via the page's frontmatter `aliases`, so wikilinks like `[[Erik Brynjolfsson]]` (which Quartz resolves to the alias slug) correctly produce backlinks on the aliased page.
  - `inject-stale-banner.ts` — when a page's frontmatter has `status: stale`, prepends a warning blockquote at the top of the page linking to `superseded_by`. Source files stay clean; the banner appears only on the published site.
  - `inject-confidence-badge.ts` — when a page carries v0.2 lifecycle fields (`confidence`, `source_count`, `last_confirmed`), renders a one-line italicized metadata strip immediately after the H1: `Confidence 0.85 · 4 sources · last confirmed 2026-04-28`. Skips pages without `confidence` (sources, threads, syntheses).
  - `relationships-panel.tsx` — Quartz Component rendered in `afterBody` (i.e. at the bottom of the article body, just above the footer) so typed relationships read as "related content" the reader sees after finishing the page. Reads the page's `relationships:` frontmatter, groups by relationship type, resolves each `target` slug via `allFiles` lookup, surfaces optional `via` text, hides when empty. Component (not AST injection) so it has access to the slug→file map for proper link resolution.
- **Deploy**: `.github/workflows/deploy.yml`. Pages source must be set to "GitHub Actions" in repo Settings.
- **Local preview**: `npm install` once, then `npm run serve` → `http://localhost:8080`.
- **Build only**: `npm run build` → `public/`.

Practical notes:
- Adding a `type:` or `kind:` value to a page automatically adds a graph filter chip — no extra work.
- `raw/` is excluded via `ignorePatterns` in `quartz.config.ts` (it's source-of-truth, not for publishing).
- When a `[[wikilink]]` target doesn't exist, Quartz renders it as a "broken link" — useful for spotting stub gaps during lint.
- Quartz does not render Dataview blocks. If/when Dataview is introduced for Obsidian-side features, those blocks will appear as plain code on the public site.

## Lifecycle

Knowledge has a lifecycle. A claim from a single source is weaker than one confirmed across four sources. A claim from January is weaker than one confirmed last week. New data sometimes supersedes old data. The wiki captures all three with three frontmatter fields and one supersession protocol.

### Frontmatter contract (concepts and entities)

Every concept and entity page carries:

- `confidence: 0.0–1.0` — how strongly the claim on this page is supported by sources currently in the wiki.
- `last_confirmed: YYYY-MM-DD` — the date of the most recent ingest that reinforced this page.
- `source_count: N` — count of source pages that cite or substantiate this page (matches the page's inbound source links from `wiki/sources/`).
- `accessed_at: YYYY-MM-DD` — the date the page was last *read into context* (as opposed to written to). Added in v0.5 as the reinforcement signal for the [§Retention](#retention) curve. Seeded at v0.5 migration time to equal `last_confirmed`; bumped manually via `node scripts/bump-accessed.mjs <slugs>` after a query-time read, or procedurally during ingest (Process step 6 bumps `accessed_at` alongside `last_confirmed`). **Syntheses also carry `accessed_at`** (added after the v0.5 quality scorer flagged the omission — syntheses are claim-bearing pages, not evidence, so they decay like concepts). Sources do not carry `accessed_at` — sources don't decay; their reliability is governed by what cites them.

**Concepts and syntheses additionally carry** (added v0.5 quality slice):

- `quality_score: 0.0–1.0` — a mechanical health score combining structure, citation density, and cross-consistency. Computed by `node scripts/quality-score.mjs`; lives in frontmatter as a *derived* field (the only frontmatter value written by tooling rather than by hand). See [§Quality](#quality) for the rubric. Not on entities (which are catalogue pages, not knowledge claims) or sources (which are evidence).
- `quality_notes:` — optional list of specific issues the scorer flagged. Empty when score is at ceiling. Read by humans to know what to fix.

Sources do **not** carry `confidence`. Sources are evidence, not claims. Their reliability is captured implicitly by what cites them.

### Confidence rules

Set `confidence` defensibly when creating or updating a page:

- One supporting source: default `0.7`.
- Each additional supporting source: `+0.05` (cap at `0.95`).
- Any contradicting source flagged in `## Debates and supersession`: `−0.1`.
- Source that is a peer-reviewed paper, large-N empirical study, or government statistical release: `+0.05` over the baseline (counts once, not per source).
- Sources that are vendor-sponsored, anecdotal, or a single case study without replication: do not raise confidence above `0.75` unless multiple independent sources agree.

These are heuristics, not arithmetic. When the values conflict with intuition, write a defensible value and explain in `## Debates and supersession` if needed. Never write `0.0` as a default — that signals "not yet evaluated," which we don't allow on a live page.

### Supersession protocol

When new data fully replaces an older claim (not just adds nuance):

1. The retired page keeps its content. Do not delete or empty it.
2. The retired page gains `status: stale` and `superseded_by: [[new-page]]` in frontmatter.
3. The replacing page (a new source, or a rewritten concept/entity) gains `supersedes: [[retired-page]]` in frontmatter (use list syntax for multiple).
4. The `inject-stale-banner.ts` Quartz extension renders a warning blockquote at the top of stale pages on the published site. In Obsidian the frontmatter is visible; the banner is not.
5. Prepend a `log.md` entry under `op: refactor` describing what was superseded and why (reverse-chronological convention since 2026-05-12, GH #3).

When new data only adds nuance or contradiction without retiring the old claim, do **not** mark the old page stale. Add a bullet to its `## Debates and supersession` section instead.

### Debates and supersession section

Concept pages with more than one source must include a `## Debates and supersession` section near the bottom. It records:

- Open contradictions between sources (which source says X, which says ¬X, what the resolution looks like).
- Supersession events (which page was retired, when, why).
- Open questions that the next ingest might answer.

Empty placeholder text is acceptable on early pages; the section's presence is more important than its content.

### Tier vocabulary

The pipeline `raw/` → `wiki/sources/` → `wiki/concepts/` and `wiki/entities/` → `CLAUDE.md` corresponds to four implicit memory tiers (see [`llm-wiki.md`](llm-wiki.md)): working (raw observations), episodic (per-source summaries), semantic (cross-session facts), procedural (workflow patterns encoded in this schema). The wiki does not maintain separate storage for each tier — directories already serve that purpose. Promotion happens when a recurring observation across multiple sources stabilizes into a concept page, or when a recurring lint pattern becomes a CLAUDE.md rule.

### Author-entity promotion

When ingesting a source, every named author goes into the source page's `author:` frontmatter array. Whether to also create an entity page for each author follows a **second-source promotion rule**:

- **First source**: list the author in `author:`. In the source page's "Linked entities and concepts" section, list any not-yet-promoted authors under "**Dangling** (single-source mention, deferred): ...". Do **not** create an entity page yet.
- **Second source citing the same author**: create an entity page on that ingest, and update the first source's "Dangling" line accordingly. Treat this as a normal cross-cutting touch (per [§Working principles](#working-principles)).
- **Aliases**: if the same person's surface form varies across sources (e.g. `Erik Brynjolfsson` / `Brynjolfsson`, or filesystem-canonical diacritic strips like `Jesper B. Sorensen.md` for `Jesper B. Sørensen`), record every form in the entity page's `aliases:` so the audit treats them as equivalent.

The convention exists to reduce sparse single-mention entity pages while ensuring **recurring** authors get tracked. It is enforceable — the silent-skip failure mode (an author named on multiple sources but never given a page because each ingest deferred independently) is auditable via [`scripts/lint-dangling-authors.mjs`](scripts/lint-dangling-authors.mjs):

```bash
node scripts/lint-dangling-authors.mjs
```

The script walks `wiki/sources/` and `wiki/entities/`, reports any name in `author:` on ≥2 source pages without a matching entity (canonical filename or alias), and exits non-zero when dangling authors are found. Run after every ingest that adds source pages, or periodically as a corpus health check. The convention only governs **`author:` frontmatter**; people referenced incidentally in source bodies are out of scope.

## Retention

Knowledge has a half-life. A concept reinforced last week sits at full strength; a concept that hasn't been read or cited in 18 months has likely drifted from the rest of the wiki around it. v2's "forgetting" idea (the Ebbinghaus-style retention curve) is captured here as a **lint signal, never an auto-edit** — decay only changes what surfaces in lint output and what the SessionStart hook highlights; it never deletes, archives, or rewrites a page.

### The decay curve

For concept and entity pages, an *effective* confidence is derived at lint time:

```
effective_confidence = stored_confidence × exp(-days_since_access / tau)
```

Where:

- `stored_confidence` is the `confidence:` value written by the most recent ingest that touched the page.
- `days_since_access` is `(today − accessed_at)`.
- `tau` is the decay time-constant: **90 days for concepts and syntheses, 365 days for entities, ∞ for sources** (sources don't decay; they are immutable evidence). Concepts and syntheses decay roughly four times faster than entities because conceptual framings and durable conclusions shift faster than the people, organisations, and products they describe — a 2024 framing of "agent harness" is less recognisable today than the 2024 identity of OpenAI.

This is read-only — the stored `confidence:` is never overwritten by decay math. `effective_confidence` is computed each time lint runs (and, from v0.5's search slice, each time the search ranker assembles a result list).

### What decay does and does not do

**Does:**

- Surface decay candidates in lint output: any page where `effective_confidence < 0.5` gets listed under "decay candidates" with the suggestion to either re-confirm (bump `accessed_at` via a normal ingest/query touch) or, if the page is genuinely stale, run the [§Supersession protocol](#supersession-protocol).
- Influence search rank from v0.5's search slice onward: low-effective-confidence pages drop in result lists.
- Influence the SessionStart hook's surfacing of "needs attention" pages.

**Does not:**

- Delete pages. Ever.
- Auto-write to `status: stale`. Stale-marking is always a human-approved supersession decision per [§Supersession protocol](#supersession-protocol).
- Overwrite `confidence:`. `confidence:` is the value the last *active* ingest wrote; `effective_confidence` is a derived view, computed on demand.
- Decay sources. Source pages have no `accessed_at:` and no decay; they are the evidence layer.

### The reinforcement signal

`accessed_at:` is bumped to today's date whenever:

1. A new ingest touches the page (this is the same trigger as `last_confirmed`, so for ingest-time touches the two fields move together).
2. A query operation reads the page into context (lands with v0.5's search slice — a scheduled hook bumps `accessed_at` on pages the search ranker returned).
3. A user manually re-confirms the page during a lint pass ("yes, this is still current" → `accessed_at` bumps).

Pages whose `accessed_at:` falls behind `last_confirmed:` are *read-aged*: they're still factually current but haven't been actively engaged with. The decay curve uses `accessed_at`, so read-engagement matters as much as ingest-time freshness.

### Cuts and deferrals

- **No auto-deletion.** v2's "moved to a bottom drawer" is implemented here as "drops off the homepage and into lint output." Nothing is ever silently archived.
- **No per-page tau override.** Tau is fixed by page type (concept / entity). Personalised decay (e.g. "this concept decays slower because it's foundational") is deferred — if a concept genuinely should resist decay, set its `confidence:` to a higher value, don't introduce a per-page knob.
- **No scheduled retention sweep that auto-marks pages stale.** v2 suggests automation; this repo's hook contract ([§Hooks](#hooks)) forbids content edits from automation. Lint reports are the only output of the daily retention check.

## Quality

Not every wiki page is equally well-written. A concept with three sources but no `## Debates and supersession` section, no inbound wikilinks, and a 50-word body is structurally weak even if its `confidence:` is high. **v0.5 adds a mechanical quality score** that flags those structural weaknesses without trying to judge content correctness on concepts and syntheses. **v0.6 adds an LLM-as-judge overlay** for `kind: paper` source pages — see [§Source-page scoring (v0.6)](#source-page-scoring-v06).

### What gets scored

- **Concepts** (`wiki/concepts/*.md`) — they make knowledge claims; their structural shape predicts readability and re-use.
- **Syntheses** (`wiki/syntheses/*.md`) — they are durable conclusions and bear the strictest schema (Question / Findings / Sources consulted / Lessons / Open questions).
- **Not entities** — entity pages are catalogue cards (who/what/where); the quality model doesn't fit. Their health is governed by `confidence`, `source_count`, and `relationships` only.
- **Not sources** — sources are evidence, immutable, never scored.
- **Not threads** — threads are provisional by design; quality scoring would be premature.

### The rubric

`quality_score` is a weighted sum on `[0.0, 1.0]`. Three dimensions:

| Dimension | Weight | What's checked |
| --- | ---: | --- |
| **Structure** | 0.40 | H1 present; required sections present per page type (`## Debates and supersession` for concepts with `source_count > 1`; the five mandatory sections for syntheses per [§Synthesis](#synthesis)); frontmatter contract complete (`confidence`, `last_confirmed`, `source_count`, `accessed_at`); body length ≥200 words (i.e. not a stub). |
| **Citation density** | 0.30 | Number of wikilinks to source pages (`[[2026-…-…]]`) per 1000 body words. Target: ≥3.0 source links per 1000 words. Scored linearly up to that ceiling. The wiki's central convention is *citations beat assertions* — this dimension enforces it numerically. |
| **Cross-consistency** | 0.30 | Every `relationships:` target slug exists as a real page; every typed relationship has a body wikilink (the v0.3 body-wikilink rule) at least mentioning the target; no broken `[[wikilink]]`s; concepts with `source_count > 1` have a `## Debates and supersession` section (overlaps Structure but counted again because it's the load-bearing claim about epistemic honesty). |

The 0.40 / 0.30 / 0.30 weighting reflects the schema's priorities: structure is the most-tractable lever the wiki controls; citation density and cross-consistency together encode the *citation discipline + relationship discipline* that the v0.2 and v0.3 layers established.

### Thresholds

- **`quality_score ≥ 0.85`** — page is at or near ceiling. No action needed.
- **`0.65 ≤ quality_score < 0.85`** — workable; specific issues listed in `quality_notes`. Address opportunistically.
- **`quality_score < 0.65`** — needs work. Surfaced by lint and SessionStart hook; address before adding new sources to the page.

### How and when it runs

- **Manual batch** — `node scripts/quality-score.mjs` walks `wiki/concepts/` and `wiki/syntheses/`, recomputes scores, writes `quality_score` and `quality_notes` back to frontmatter. Idempotent — if the score and notes haven't changed, no write happens (git stays clean).
- **Dry-run** — `node scripts/quality-score.mjs --dry-run` prints the score table without writing.
- **Single page** — `node scripts/quality-score.mjs --page <slug>` scores one page (e.g. just after editing a concept).
- **Not hook-fired** — quality scoring runs cross-page consistency checks; running it on every PostToolUse would walk the entire wiki on every keystroke. Run it manually after each ingest batch, or weekly as a corpus health check.

### The auto-write exception

The schema permits tooling to write to **exactly two frontmatter fields**, both derived/mechanical and both on concepts/syntheses only:

| Field | On pages | Written by | When |
| --- | --- | --- | --- |
| `quality_score` | concepts, syntheses | [`scripts/quality-score.mjs`](scripts/quality-score.mjs) | user-invoked or hook-fired |
| `quality_notes` | concepts, syntheses | [`scripts/quality-score.mjs`](scripts/quality-score.mjs) | user-invoked or hook-fired |

**Source pages carry no auto-written fields.** v0.5 added `quality_floor:` and `quality_floor_notes:` to source-page frontmatter; v0.6 removed them. Source-page scores (floor + LLM judgment) live only in `logs/quality-source-pages.jsonl` and the HTML report — never in the page. This protects against anchoring: every `--judge` run starts from clean state, the page text being the only input.

Everything else (lifecycle fields, `relationships:`, body content) is editorial. The hooks contract ([§Hooks](#hooks)) forbids automation from editing wiki content beyond these two fields. The exception bar is narrow on purpose: any future auto-write must be **derived** (computable from page state, not invented), **deterministic** (re-runs idempotent), and **explicit** (the page acknowledges the field as auto-managed).

The rubric version itself lives in [`quality-rubric.md`](.claude/skills/scientific-papers-processing/quality-rubric.md) YAML frontmatter (`rubric_version:`). Tooling parses that field — never hardcoded — so a version bump there propagates automatically through the chain (rubric edit → re-score → JSONL append → HTML regen).

### Source-page scoring (v0.6)

The mechanical-floor scorer for source pages lives in [`scripts/quality-source-page.mjs`](scripts/quality-source-page.mjs). It is now joined by an **LLM-as-judge overlay**:

- **Scope.** Only `kind: paper` source pages are scored. Reports, video transcripts, articles, images drop out — the Keshav 3-pass + IMRaD rubric does not fit those carriers.
- **Mechanical floor (default).** `node scripts/quality-source-page.mjs [--page <slug>]` walks paper pages and computes per-dim D1–D6 lower bounds. Caps at 2/3 per dim (level-3 needs judgment). Appends one JSONL line per page with `kind: "mechanical-floor"`.
- **LLM judgment (`--judge`).** `node scripts/quality-source-page.mjs --judge [--page <slug>]` additionally invokes headless Claude Code (`claude -p ... --output-format text`) with the rubric + page body (with any legacy `## Quality review` block stripped) + the mechanical floor as guardrails. The LLM returns per-dim scores 0–3 plus reasoning. Soft-floor rule: judgment may go below floor only with an explicit `below_floor_reason` — the validator in [`scripts/_lib/llm-judge.mjs`](scripts/_lib/llm-judge.mjs) rejects silent downgrades. Judgment runs append JSONL lines with `kind: "mechanical-floor + llm-judgment"` carrying both `floor:` and `judgment:` blocks plus the LLM's reasoning per dim.
- **Output surfaces.** [`scripts/quality-log-summary.mjs`](scripts/quality-log-summary.mjs) is the CLI viewer; [`scripts/quality-log-html.mjs`](scripts/quality-log-html.mjs) regenerates `logs/quality-report.html`. Both show judgment as primary when present, floor as the structural baseline.
- **Never writes to the page.** Source pages are inputs to scoring, never outputs. This is the load-bearing v0.6 decision.

### Cuts and deferrals

- **LLM-as-judge: source pages only.** v0.6 lands the LLM-judge slice for `kind: paper` source pages. Concepts and syntheses remain mechanical-only — the rubric for that surface is structural and does not yet have an LLM-overlay layer.
- **No auto-rewrite of low-quality pages.** Even when a page scores below 0.65, the script never edits page content — it only appends to the log. The fix is always editorial.
- **No quality score on entities.** v2 implies scoring "everything" — this repo restricts scoring to pages where structural shape and substantive content predict re-use value (concepts, syntheses, paper-kind sources).

## Search

At ~200 pages the wiki has outgrown `index.md` as a primary discovery surface. v2's "hybrid search past 100–200 pages" warning has cashed in. v0.5 adds **[qmd](https://github.com/tobi/qmd)** (`@tobilu/qmd` on npm) as the local search engine — BM25 keyword + vector semantic + LLM re-ranking, all on-device via `node-llama-cpp` with GGUF models. No external API; no embedding service.

### What lives where

- **qmd's index** (BM25 inverted index + 768-d embeddings per page) lives outside the repo, in qmd's own data directory (typically `~/.qmd/`). It is not committed.
- **The collection mapping** is registered with qmd as a named collection derived from `package.json`'s `name` (the `COLLECTION` constant in [`scripts/wiki-query.mjs`](scripts/wiki-query.mjs); override with the `WIKI_COLLECTION` env var), rooted at `./wiki` with the glob `**/*.md` (so the corpus of concepts, entities, sources, artifacts, threads, syntheses, plus `index.md` and `log.md` is indexable).
- **The collection context-string** (registered via `qmd context add qmd://<collection> "..."`) carries the schema summary so qmd's LLM re-ranker has framing when surfacing results.
- The wiki's typed graph (`wiki/.graph.json` from v0.3) remains the third retrieval stream; it is **not** indexed by qmd. Graph traversal is invoked separately (see §Graph) and merged with qmd's hits via Reciprocal Rank Fusion at the query-answering layer.

### When to use qmd vs `index.md`

| Query shape | Strategy |
| --- | --- |
| Looking up a known page by exact title or alias | `index.md` — direct lookup, fastest |
| Question that obviously hits ≤5 wiki pages by name | `index.md` — open them directly |
| Question that touches >5 pages, or whose answer requires synthesis across several | **qmd first** to narrow to top 10, then read those |
| Open-ended exploration ("what does the wiki say about X-ish topics") | **qmd `query`** (hybrid + rerank) — it surfaces semantic neighbours `index.md` won't catch |
| Looking for *structural* context ("what is `agent-harness` `part-of`?") | Graph traversal via `wiki/.graph.json` — qmd doesn't know about typed edges |

The 5-page threshold is a heuristic. The real test is whether the query would force you to scan >50% of `index.md` to find candidates — if yes, qmd is cheaper.

### qmd command cheat-sheet

Run via `npx @tobilu/qmd <command>` (no global install needed) or `qmd <command>` after `npm install -g @tobilu/qmd`.

- **`qmd query "<question>"`** — **default for complex queries.** Hybrid retrieval (BM25 ∪ vector) followed by LLM re-ranking. Slower per call but most robust to phrasing variation.
- **`qmd search "<terms>"`** — fast BM25 keyword search. Use when the terms are specific and you expect literal matches.
- **`qmd vsearch "<question>"`** — pure vector semantic search. **Warning:** unreliable on lexically ambiguous paraphrases — without a BM25 leg, vector can resolve to the wrong semantic cluster on a single misleading word (the v0.5 acceptance test caught this: a Dutch paraphrase with the ambiguous *"in productie"* sent vsearch to the labor/employment cluster instead of harness/runtime; `query` got it right). Treat `vsearch` as a diagnostic tool, not a primary discovery surface.
- **`qmd get "<path>"`** — fetch a specific document by path, or `qmd get "#<docid>"` by qmd's internal id (shown in search results).
- **`qmd multi-get "<glob>"`** — fetch multiple documents by glob (e.g. `"sources/2026-05*.md"`).

The **collection name** becomes a URI prefix in qmd's output: results are reported as `qmd://<collection>/<path>`. Treat that as the wiki source-of-truth path. Scope queries to the collection with `-c <collection>` so results don't bleed in from other qmd collections on the same machine ([`scripts/wiki-query.mjs`](scripts/wiki-query.mjs) already does this via its `COLLECTION` constant).

### Re-embedding after writes

qmd's index does not auto-refresh. After ingest sessions that add or substantially edit pages, **re-index then re-embed** the collection:

```sh
npx @tobilu/qmd update -c <collection>   # re-scan wiki/ so new/changed files enter the index
npx @tobilu/qmd embed  -c <collection>   # compute vectors for changed-hash docs only
```

`update` picks up newly added pages (a bare `embed` only embeds docs qmd already knows about, so new files would be silently missed). `embed` then computes embeddings only for pages whose content hash changed. On a typical post-ingest run (5–10 pages touched), both are seconds. A full rebuild is rare.

### Re-ranking by `effective_confidence`

When qmd returns its top-N, the query-answering layer should re-rank by §Retention's `effective_confidence`. A high-BM25 hit on a concept that has decayed (e.g. `effective_confidence < 0.5` because `accessed_at` is 18 months old) is downgraded relative to a fresher concept on the same topic. This is the integration point between §Search and §Retention — qmd returns relevance, the wiki's lifecycle math returns currency, and both matter. The re-ranking is computed at read-time; qmd's stored scores are not modified.

### Bumping `accessed_at` after a query

When a query consumes pages from qmd's results, **bump those pages' `accessed_at` to today** — that's the reinforcement signal §Retention's decay curve uses. There are three routes, from most integrated to most manual:

**Route 1 — `/wq` slash command** (most ergonomic, the default for interactive use):

```
/wq wat zegt de wiki over dynamische capaciteiten van organisaties
```

The command dispatches to [`scripts/wiki-query.mjs`](scripts/wiki-query.mjs) which runs `qmd query --json`, prints the top-N results, **and automatically bumps `accessed_at`** on every concept / entity / synthesis page returned. Sources in the result list are skipped (they don't decay). Language-agnostic — the slash command answers in the query's language.

**Route 2 — wiki-query wrapper directly** (for shell, scripts, other agents):

```sh
node scripts/wiki-query.mjs -n 8 "your question"          # 8 results + bump
node scripts/wiki-query.mjs --no-bump -n 3 "quick lookup" # skip the bump
node scripts/wiki-query.mjs --json "your question"        # raw qmd JSON
```

Same auto-bump semantics as `/wq`. The `--json` flag passes qmd's structured output through unchanged — useful for other agents or pipelines.

**Route 3 — qmd MCP server** (for agents that want a direct tool):

Register the qmd MCP server by adding a `.mcp.json` at the repo root (one-time, user-authorised):

```json
{
  "mcpServers": {
    "qmd": {
      "command": "npx",
      "args": ["--yes", "@tobilu/qmd", "mcp"]
    }
  }
}
```

After reload, agents in this repo have direct `query`, `get`, `multi_get`, `status` tools from qmd's MCP server. **Important caveat:** qmd's MCP server does *not* know about the wiki's `accessed_at` reinforcement rule — it only retrieves. Agents using MCP directly should still call `node scripts/bump-accessed.mjs <slugs>` afterwards to honour §Retention. The `/wq` slash command and `wiki-query.mjs` wrapper are the only paths that bundle both operations.

**Manual fallback** for ad-hoc bumps unrelated to a query:

```sh
node scripts/bump-accessed.mjs <slug> [<slug> ...]
```

Idempotent — a slug already at today's date is a no-op. Slugs resolve against `wiki/concepts/`, `wiki/entities/`, `wiki/syntheses/`. Sources are rejected (they don't decay).

### Cuts and deferrals

- **No external API embeddings.** v2 mentions "vector search via embeddings"; qmd's local GGUF route honours that without OpenAI/Anthropic API exposure.
- **No graph-aware retrieval inside qmd.** Graph traversal stays in `wiki/.graph.json` + `scripts/`; merging happens at the answer-synthesis layer, not inside the retrieval engine. v2 envisions a unified store; this split is pragmatic and revisable.
- **No MCP integration yet.** qmd ships an MCP server; wiring it into Claude Code as a native tool is deferred to the v0.5 quality slice (or whenever it becomes friction). Until then the CLI route works.
- **No auto-refresh hook on edit.** The PostToolUse lint hook ([§Hooks](#hooks)) deliberately does not call `qmd embed` after every wiki edit — re-embedding on every keystroke would thrash. Re-embed runs as part of the manual ingest-completion checklist, not as automation.

## Graph

The wiki is a graph, not a list of pages. Wikilinks in body text already encode relationships, but they're untyped — `[[Erik Brynjolfsson]]` doesn't say *whether* the page mentions Erik because he authored a paper, employs someone, or is being contradicted. v0.3 adds a typed layer in frontmatter so the wiki can be queried as a graph (e.g., "what does this concept contradict?", "what did Brynjolfsson author?").

### Relationships frontmatter

Every concept and entity page may carry a `relationships:` block in its frontmatter:

```yaml
relationships:
  - type: contradicts
    target: ai-employment-effects
    via: "occupation-level vs task-level"
    confidence: 0.7
  - type: authored-by
    target: Erik-Brynjolfsson
```

- **`target`** is the destination page's slug (filename without extension), not a `[[wikilink]]`. Wikilinks-in-frontmatter are not crawled reliably by Quartz; you'd get partial/silent broken links.
- **`type`** must come from the closed vocabulary below.
- **`via`** (optional) is a one-line string explaining the nuance — what the relationship turns on. Particularly valuable on `contradicts`/`supports`.
- **`confidence`** (optional, 0.0–1.0) overrides the default for this edge. If absent, the edge inherits the page's confidence (see [§Lifecycle](#lifecycle)).

### Closed vocabulary

| Type | Direction | Use |
| ---- | --------- | --- |
| `supports` | A supports B | A's claim reinforces B's claim (intra-concept agreement) |
| `contradicts` | A contradicts B | A's claim conflicts with B's; pair with `via` |
| `caused` | A caused B | Causal claim — a phenomenon, decision, or event led to another |
| `fixed` | A fixed B | A resolves or repairs B (rare in knowledge work; common in code wikis) |
| `supersedes` | A supersedes B | A retires B; pair with v0.2 supersession protocol |
| `uses` | A uses B | A makes use of B (e.g., a method uses a tool) |
| `depends-on` | A depends on B | A would not work without B |
| `part-of` | A is part of B | A is a component of B (e.g., person `part-of` lab) |
| `instance-of` | A is an instance of B | A is a specific case of the broader B |
| `authored-by` | A is authored by B | A's content originates with B (person or org) |
| `published-by` | A is published by B | A appeared via B (publisher, journal, venue) |
| `employs` | A employs B | A (organization) employs B (person) |

Use the type that fits. Inverse relationships are not stored explicitly — `scripts/graph-export.mjs` computes them by walking the corpus.

### Source-to-source relationships

The closed vocabulary works for source pages too. A source page may declare typed `relationships:` pointing to other source pages — the most common types in practice are **`supports`** (e.g., a research-frontier paper supports an applied practitioner workshop on the same topic; an empirical dataset supports the framework a prior conceptual paper named), **`contradicts`** (e.g., a study disconfirms a prior empirical claim — always pair with `via:` describing what the disagreement turns on), and **`supersedes`** (per [§Supersession protocol](#supersession-protocol) — pair with `status: stale` + `superseded_by:` on the retired source).

Source-to-source edges are how the wiki encodes its **thematic cluster index** — two sources on the same topic with no typed edge between them is a graph-quality smell, not a neutral state. The [§Ingest](#ingest) workflow's step 5 (Neighbour-source scan) is the disciplined way to keep this layer consistent.

### Body-wikilink rule (load-bearing)

**Every typed relationship in frontmatter must also appear as a body `[[wikilink]]` with at least one sentence of context.**

Frontmatter is the *typed* layer; body is the *navigable* layer; both are required. If a relationship exists only in frontmatter, Quartz's link crawler cannot follow it — you get a relationships panel pointing at links that don't show up in the graph view. If a wikilink exists only in body, the relationship is untyped and the graph export misses it. Lint enforces both directions from v0.4.

A page's `## Related concepts` / `## Related pages` / in-prose mentions usually already satisfy the body side; the migration just adds the frontmatter twin.

### Wikilink-rendering rule (Quartz compatibility)

**Never put markdown formatting inside the alias portion of a wikilink.** Quartz's default forward-link parser expects a literal string between `|` and `]]`; emphasis (`*…*`), bold (`**…**`), or other markdown inside the alias either leaks the raw characters into the rendered link text or silently breaks the link on the published site. Obsidian renders these fine because it processes the alias as full markdown — so the breakage is invisible in authoring and only shows up after deploy.

Two safe patterns:

- **Full-alias italics**: move the asterisks outside the wikilink — `*[[target|alias]]*`, not `[[target|*alias*]]`.
- **Partial italics inside an alias** (e.g. a publication title within a longer descriptive alias): drop the inner asterisks — `[[target|Author 2026 — Title of Paper (Journal)]]`, not `[[target|Author 2026 — *Title of Paper* (Journal)]]`. The `[[…]]` rendering already signals the link is to a publication; the visual loss is minor and the link stays clickable.

This rule applies to body text, table cells, and any other markdown context where a wikilink renders. Frontmatter wikilinks (e.g. `relationships.target:`) are a separate matter — those should be slugs only, never wikilinks at all.

### Graph export

`scripts/graph-export.mjs` walks all `wiki/**/*.md`, reads frontmatter, and emits `wiki/.graph.json` (gitignored) with a node list (slug, type, kind, confidence) and an edge list (type, source, target, confidence, via). Re-run after any migration that changes relationships. v0.5 hybrid search uses this file as its third stream.

### Formalized `kind:` enum (entities)

`kind:` on entity pages is now restricted to one of: `person | organization | product | project | place | event | library | dataset | benchmark | venue`. Drift from earlier ingests (e.g. `org` for organization) gets normalized during the v0.3 migration.

## Dynamic-capabilities tagging

Source pages may carry a `dynamic_capabilities:` frontmatter field declaring which **Warner & Wäger (2019) process-model cells** the source touches. This adds a queryable meta layer parallel to v0.3's typed `relationships:`, but specialised to the digital-transformation lens: rather than "this source supports/contradicts another wiki page," the tag answers "what kind of digital-transformation work is this source about?"

The closed vocabulary, the operational definitions for each slug, and the `role_defaults:` matrix that drives role-relevance inheritance all live in one place: [[concepts/warner-wager-process-model|warner-wager-process-model]]. That concept page is the single source of truth; CLAUDE.md only documents the *contract* between source pages and the lint.

### Frontmatter contract (source pages)

```yaml
dynamic_capabilities:
  - <bucket>/<element>
  - ...
roles: [<role-slug>, ...]   # optional override, see §Role-relevance
```

- `dynamic_capabilities:` is **optional**. Pre-2026-05-14 source pages do not need backfill; new ingests should tag when the W&W lens applies.
- Each entry must be drawn from the closed vocabulary published on [[concepts/warner-wager-process-model|warner-wager-process-model]] (15 cells across 5 buckets: `digital-sensing/*`, `digital-seizing/*`, `digital-transforming/*`, `strategic-renewal/*`, `contextual/*`).
- Multiple entries allowed when a source genuinely speaks to multiple cells.
- **Tagging is encouraged, not forced.** When a source sits outside the W&W lens (e.g. pure LLM-internals papers, model-quantization mechanics), omit the field rather than stretching the vocabulary.
- `dynamic_capabilities:` tags do **not** carry per-entry `confidence:` — the tag is a binary "touches / doesn't touch" classification, not a graded claim.

**Tags as discovery index.** Beyond classification, `dynamic_capabilities:` cells are the corpus's **thematic adjacency index**. Two source pages sharing a cell are conceptually adjacent — they are the first candidates for source-to-source typed `relationships:` per [§Source-to-source relationships](#source-to-source-relationships). The [§Ingest](#ingest) workflow uses this affordance in its step 5 (Neighbour-source scan), with a fallback path through shared concept-page citations for pre-GH #4 sources that don't carry W&W tags yet. A future lint rule can flag sources with ≥2 overlapping cells but no typed relationship between them; until then the discipline is the ingestor's, and the *"≥3 candidate neighbours, surface the list"* rule in Ingest step 5 is the accountability mechanism.

### Body twin rule (load-bearing)

**Every `dynamic_capabilities:` entry in frontmatter must be reflected in the body** — at minimum one sentence in the page summary saying *how* the source touches that cell, ideally naming which of the bullet-level activities listed on [[concepts/warner-wager-process-model|warner-wager-process-model]] are in play. Frontmatter is the typed layer; body is the navigable layer. Both required.

This mirrors v0.3's [§Body-wikilink rule](#body-wikilink-rule-load-bearing) for typed relationships — same architectural pattern, same enforcement mechanism. Lint matches on the cell slug or its trailing element (e.g. either `digital-seizing/balancing-digital-portfolios` or `balancing-digital-portfolios` in body prose satisfies the rule).

### Role-relevance inheritance

Each cell carries a **default role profile** — the business roles that would typically care about a source in that cell. The matrix lives on [[concepts/warner-wager-process-model|warner-wager-process-model]] as a `role_defaults:` block, with 15 role slugs across nine C-suite (`ceo`, `coo`, `cfo`, `cso`, `cdo`, `cto`, `cio`, `chro`, `cmo`) and six functional roles (`product-manager`, `tech-lead`, `rd-director`, `innovation-lab-lead`, `transformation-lead`, `strategy-consultant`).

Role-relevance is **derived** from `dynamic_capabilities:` by default — no per-source `roles:` needed. A source page may add an explicit `roles:` list when its emphasis diverges from the cell defaults; when present, `roles:` **replaces** the inherited defaults for that source (half-overrides are not supported in v1).

`roles:` is a list of role slugs from the closed vocabulary on the concept page. Lint validates the vocabulary on source pages. (On person-entity pages, `roles:` — if used — remains a free-text job-title field, not a slug list. Lint distinguishes by `type:`.)

The body-twin rule does **not** extend to `roles:` — role-relevance is a derived view, not an independent claim.

### When not to tag

- Sources purely about LLM internals (training dynamics, quantization, attention mechanics) where the W&W lens does not apply.
- Sources where the only plausible cell is `contextual/external-triggers` and even that feels forced — leave the field off rather than over-fit.
- Sources whose contribution is purely methodological (analysis tools, vocabularies, benchmarks) without a digital-transformation use case attached.

The point of the tagging layer is to make the *digital-transformation reading* of the corpus queryable. A source that does not contribute to that reading should not be forced into the vocabulary just to have a tag.

## Synthesis

A `wiki/threads/` page is provisional — it gathers questions, candidate sources, and a "How this thread should resolve" plan. When enough sources are in to answer the question, the thread is **synthesized** into a `wiki/syntheses/` page. Threads stay open as long as the wiki is still gathering evidence; syntheses are the durable conclusions.

### Synthesis page contract

A synthesis page (filename usually matches the originating thread's slug) carries `type: synthesis` and the v0.2 lifecycle fields, plus:

```yaml
type: synthesis
derived_from: [thread-slug]   # list; one or more threads this closes
opened: YYYY-MM-DD            # date the originating thread opened
closed: YYYY-MM-DD            # date this synthesis was filed
```

Required body sections, in order:

1. **Question** — what was the thread asking, restated as a single sentence.
2. **Findings** — what the synthesis concludes. The substantive part.
3. **Sources consulted** — bulleted list of every source page that informed the synthesis. Each as a `[[wikilink]]`. This is the citation panel.
4. **Lessons** — short, transferable claims extracted from the synthesis. Each lesson is a single sentence; v0.6 will promote individual lessons to standalone `wiki/lessons/` pages.
5. **Open questions** — what the synthesis did *not* answer; carried forward to a new thread or future ingest.

### `synthesize` operation

When a thread is ready to close:

1. Read the thread page and every source it lists.
2. Draft the synthesis page in `wiki/syntheses/` per the contract above.
3. Update the thread page: `status: closed` in frontmatter; add a "Closed" note pointing to the synthesis.
4. Update `index.md`: drop the thread from the open-threads list; add the synthesis to the (no-longer-empty) Syntheses section.
5. Prepend a `log.md` entry under `op: synthesize` describing the question and the headline finding (reverse-chronological convention since 2026-05-12, GH #3).

## Artifacts

A source's value is usually compressible into prose — *what the paper argued, why it matters* — but some load-bearing content resists compression: a 23-row variable list, a 5×6 model-comparison table, a per-country coefficient matrix, a named instrument's full item list. These are the artifacts an expert agent needs *verbatim*, not paraphrased, and they have always strained the source-page format. v0.7 introduces `wiki/artifacts/` as the dedicated home for them.

### When to promote a table/figure/equation to an artifact page

A reproducible artifact earns its own page in `wiki/artifacts/` when it meets **all three** of:

1. **Load-bearing.** Skipping it would lose information the paper is known for — a named taxonomy, a headline-result table, a variable dictionary, a named diagram. (Correlation heatmaps, descriptive-statistics tables, and reference lists usually fail this test.)
2. **Resists prose compression.** The artifact's content can't be summarised in 2–3 sentences without losing rows. A 5-row table that says "AUC went up at each modelling step" can stay inline; a 23-row financial-features list cannot.
3. **Paper-specific provenance matters.** The artifact is a specific paper's empirical or methodological output — its regression coefficients, its sample composition, its derived instrument scoring. It belongs to *this* paper, not the literature at large.

The third criterion is what separates `wiki/artifacts/` from `wiki/concepts/`. A concept is *reusable knowledge*: when multiple sources cite the same instrument (Big Five, NPS), the same variable dictionary, the same named algorithm, that lives in `wiki/concepts/`. An artifact is *paper-tied evidence*: Powell 2024's per-country MDA coefficients, Hajek 2024's BERTopic categories, Altman 2023's monetary-impact table. When in doubt: paper-specific → artifact; corpus-shared → concept.

Edge case: a paper's *appendix* of variables can be either. Altman 2023's 164-variable Omega Score appendix landed in [[concepts/shared-variable-definitions]] because it's the reference catalogue for a multi-paper thematic cluster (other papers cite the same variables). Hajek 2024's Table 4 BERTopic taxonomy lands in `wiki/artifacts/hajek-2024-bertopic-risk-categories.md` because the 26 categories are tied to Hajek's specific BERTopic run on Item 1A filings — a different paper running BERTopic would produce different categories.

### Frontmatter contract (`type: artifact`)

```yaml
---
type: artifact
artifact_kind: table | equation-block | figure-diagram | survey-instrument | glossary | algorithm
title: "<verbatim source title — e.g. 'Table 4 — BERTopic risk categories'>"
source: "[[<source-slug>]]"            # mandatory; the originating source page
source_table_ref: "Table 4"            # the paper's own numbering, verbatim
source_pages: "pp. 11–12"              # location in the source's pagination
last_confirmed: <YYYY-MM-DD>
accessed_at: <YYYY-MM-DD>
tags: [<topic-1>, <topic-2>, ...]
relationships:                          # optional; v0.3 typed edges
  - type: part-of
    target: <source-slug or concept-slug>
---
```

Notes:

- **No `confidence:` field.** Artifacts are evidence, not claims. Their fidelity is binary (verbatim or not) and trust is inherited from the source page that cites them.
- **No `source_count:`.** Artifacts are always tied to one source. (When a *second* source documents the same artifact — e.g. two papers both reproduce a standard instrument — keep the artifact tied to whichever source described it first and add a `cited-by` relationship from the second source.)
- **No `kind:` field.** `artifact_kind:` is the discriminator.
- **`accessed_at:` participates in §Retention decay** with tau = 365 days (same as entities — artifacts are reference material, not arguments).

### Slug convention

`<first-author-surname>-<year>-<topic-keyword>`, mirroring the source-page slug stem. Examples:

| Source | Artifact | Slug |
|---|---|---|
| Hajek 2024 | Table 2 — 23 financial features | `hajek-2024-financial-features` |
| Hajek 2024 | Table 4 — BERTopic risk categories | `hajek-2024-bertopic-risk-categories` |
| Powell 2024 | Table 1 — prior-literature matrix | `powell-2024-prior-literature-matrix` |
| Powell 2024 | Table 3 — ASEAN discriminant functions | `powell-2024-asean-discriminant-functions` |
| Altman 2023 | Table 5 — ML model comparison | `altman-2023-model-comparison` |
| Habib 2020 | Table 1 — distress measurement models | `habib-2020-distress-measurement-models` |

Topic keyword: short, content-bearing, 1–3 words. The table number stays in `source_table_ref:`, not in the slug.

### Body skeleton

```markdown
# <Title>

> <Brief context: what this artifact is, where it sits in the paper.>

## Provenance

| Field | Value |
|---|---|
| Source | [[<source-slug>]] |
| Source's reference | Table N / Figure N / Equation N (verbatim from the paper) |
| Location | pp. NN–MM |
| Last confirmed | YYYY-MM-DD |

## <The artifact itself — markdown table, fenced code, Mermaid diagram, etc.>

<The verbatim reproduction. For tables: full row-by-row markdown table.
For equations: fenced math. For named instruments: numbered list.
For diagrams: Mermaid where the source's topology is clear.>

## Notes

<Optional. Any wiki-relevant context: how the source uses this artifact,
known errata, links to neighbouring artifact pages or concepts.>

## Cross-references

<Wikilinks to related concept pages, neighbouring artifacts, and
the parent source's `## Distinctive artifacts` catalogue entry.>
```

### Source-page changes

When an artifact is promoted, the source page's `## Distinctive artifacts` section transforms from *reproduction* to *catalogue*. Each entry becomes a short wikilink stub:

```markdown
### Table 4 — BERTopic risk categories

**Type:** taxonomy · **Location:** pp. 11–12 · **Reproduced in:** [[hajek-2024-bertopic-risk-categories]]

26-row taxonomy of risk categories with top-5 terms each (Intellectual property, R&D, Security, Tax, Litigation, …). The artifact page carries the full reproduction.
```

The `## Visual content` section is unchanged — it still describes the visual for accessibility. The `## Distinctive artifacts` section is what shrinks: the *data* moves to the artifact page; the *catalogue entry* stays on the source page.

### Quality rubric implication (D3)

A source page satisfies **D3 = 3** when every load-bearing distinctive artifact is reproduced *either* inline in `## Distinctive artifacts` *or* by wikilink to an `[[<artifact-slug>]]` page where the verbatim reproduction lives. The LLM judge counts both equally.

### Migration path

An existing cluster-reusable catalogue like [[concepts/shared-variable-definitions]] stays as `type: concept` (it's the reference catalogue for a multi-paper thematic cluster — corpus-shared, not paper-tied). No migration. Going forward, *paper-specific* tables go to `wiki/artifacts/`; *cluster-reusable* catalogues stay in `wiki/concepts/`.

## Hooks

v0.4 wires Claude Code hooks (configured in [`.claude/settings.json`](.claude/settings.json)) so the bookkeeping that v0.2 and v0.3 added doesn't have to be triggered manually. The harness fires the hooks; the scripts under [`scripts/`](scripts/) are the implementations.

### Non-negotiable rule

**Hooks may write to `wiki/log.md`, to lint reports (stderr/stdout), to gitignored derived artifacts (`wiki/.graph.json`, `logs/*`), and to the two whitelisted derived frontmatter fields on concepts/syntheses (`quality_score`, `quality_notes` — see [§The auto-write exception](#the-auto-write-exception)). Hooks may NOT edit any `wiki/**/*.md` page body content, and may NOT write any field to source-page frontmatter** — not concept, not entity, not source, not synthesis, not thread, and not `index.md`. Source-page scores (both floor and LLM-judgment) live exclusively in `logs/quality-source-pages.jsonl`. Content edits always require explicit user approval in-session.

This protects the v1 trust contract ("Claude owns the wiki layer, user owns direction") from automation drift. A hook that silently rewrites a concept page when the user wasn't looking is a worse failure than a hook that doesn't fire.

### Hooks in use

| Event | Script | Purpose |
| ----- | ------ | ------- |
| `SessionStart` | [`scripts/session-start.mjs`](scripts/session-start.mjs) | Outputs a short wiki snapshot (catalog counts, 5 most recent log entries — the *first* 5 since the 2026-05-12 reverse-chronological flip, `status: stale` and `confidence < 0.5` flags) to stdout — Claude Code feeds it back as session context. Read-only. |
| `PostToolUse` (Edit, Write) | [`scripts/lint-page.mjs`](scripts/lint-page.mjs) | If the just-edited file is under `wiki/**/*.md`, validates the v0.2 lifecycle contract (`confidence`, `last_confirmed`, `source_count`), the v0.3 closed relationship vocabulary, and the v0.3 body-wikilink rule (every `relationships.target` must appear as a body `[[wikilink]]`). Warnings to stderr. Always exits 0 — never blocks the tool call. |
| `PostToolUse` (Edit, Write) | [`scripts/on-rubric-change.mjs`](scripts/on-rubric-change.mjs) | Filters to the canonical rubric path (`.claude/skills/scientific-papers-processing/quality-rubric.md`); for any other edited file, exits silently. When the rubric is edited, runs `quality-source-page.mjs` (floor only; appends JSONL; auto-chains HTML regen). Judgment never auto-fires from hooks — that's a manual `--judge` invocation. Writes only to `logs/*`; never touches source-page frontmatter or body. Always exits 0 — never blocks. |
| `Stop` | [`scripts/session-end.mjs`](scripts/session-end.mjs) | Per-turn check: if any `wiki/**/*.md` is modified or untracked, re-runs [`scripts/graph-export.mjs`](scripts/graph-export.mjs) so `wiki/.graph.json` stays fresh; otherwise exits silently. No log writes. |

### Auto-prefix log convention

When/if a hook ever does write to `log.md` in a future version, the entry's op must be prefixed `auto-` (e.g. `auto-lint`, `auto-supersession-check`) to distinguish hook-fired writes from human-curated entries. Currently no hook writes log entries; this convention is reserved.

### Cuts vs. v2 plan

- **No on-query hook** — the "file good answers back" decision is human-judgment, not a hook target.
- **No scheduled retention decay** — deferred to v0.5 alongside hybrid search.
- **`session-end.mjs` does not write a log entry** — `Stop` fires per-turn, not per-session, so per-turn entries would be too noisy. Manual log writing (now prepending) remains the convention until a real `SessionEnd` event is wired (or a session-end slash command is built).
- **No auto-fix on lint warnings** — `lint-page.mjs` only reports; the human or Claude decides what to do.

## Reference

[`llm-wiki.md`](llm-wiki.md) — the self-contained system blueprint: the conceptual pattern, the three-layer architecture, every operation and page type, the full feature stack (lifecycle, retention, quality, search, graph, dynamic-capabilities tagging, visual/appendix extraction, artifacts, hooks), and the complete inventory of skills, scripts, and Quartz extensions.

`CLAUDE.md` (this file) is the operational contract — the day-to-day *how*. `llm-wiki.md` is the design-level *what and why*. Re-read the blueprint whenever a workflow question comes up that this file doesn't answer, then consider promoting the resolution into this file.
