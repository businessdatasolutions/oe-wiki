# LLM Wiki — System Blueprint

A pattern, and a working instantiation of it, for building a persistent personal knowledge base that an LLM maintains for you.

This document is the **self-contained blueprint** of the system in this repository: the idea, the architecture, every operation and page type, the full feature stack, and the complete inventory of skills, scripts, and publishing extensions that ship with the template. Read it to understand *what this is and why*; read [`CLAUDE.md`](CLAUDE.md) for the operational *how* that the agent follows day to day.

The original conceptual seed for this pattern is Andrej Karpathy's "LLM Wiki" idea. Everything below is one disciplined instantiation of it — the part you can copy, point your agent at, and start filling with documents.

---

## 1. The core idea

Most experience with LLMs and documents looks like RAG: upload files, the model retrieves relevant chunks at query time, generates an answer. It works, but the model rediscovers knowledge from scratch on every question. Nothing accumulates. Ask a subtle question spanning five documents and the model re-finds and re-pieces the fragments every time.

This system is different. Instead of only retrieving from raw documents at query time, the LLM **incrementally builds and maintains a persistent wiki** — a structured, interlinked collection of markdown files between you and the raw sources. When you add a source, the LLM reads it, extracts what matters, and integrates it into the existing wiki: updating entity pages, revising concept summaries, flagging where new data contradicts old claims, strengthening the evolving synthesis. Knowledge is **compiled once and kept current**, not re-derived per query.

The wiki is a **persistent, compounding artifact**. The cross-references are already there. The contradictions are already flagged. The synthesis already reflects everything read. It gets richer with every source added and every question asked.

You rarely write the wiki yourself — the LLM writes and maintains all of it. You own sourcing, exploration, and direction; the LLM does the grunt work of summarizing, cross-referencing, filing, and bookkeeping. In practice: the agent on one side, Obsidian on the other. Obsidian is the IDE; the LLM is the programmer; the wiki is the codebase.

**Division of labor (non-negotiable):** Claude owns the wiki layer entirely. You own sourcing, exploration, and direction.

---

## 2. The three layers

1. **Raw sources** — your curated collection of source documents (articles, papers, videos, reports, books, images). **Immutable.** The LLM reads from them but never modifies them. This is the source of truth.

2. **The wiki** — a directory of LLM-generated, LLM-owned markdown: per-source summaries, entity pages, concept pages, threads, syntheses, artifacts, plus an index and a log. The LLM creates pages, updates them as sources arrive, maintains cross-references, and keeps everything consistent.

3. **The schema** — [`CLAUDE.md`](CLAUDE.md) (for Claude Code; `AGENTS.md` for Codex). The contract that turns a generic chatbot into a disciplined wiki maintainer: directory conventions, page formats, frontmatter contracts, and the workflows for ingesting, querying, and maintaining. You and the LLM co-evolve it over time.

These three layers correspond to four implicit **memory tiers**: working (raw observations), episodic (per-source summaries → `wiki/sources/`), semantic (cross-session facts → `wiki/concepts/` + `wiki/entities/`), and procedural (workflow patterns encoded in the schema). The directories *are* the storage; promotion happens when a recurring observation stabilizes into a concept page, or a recurring lint pattern becomes a schema rule.

---

## 3. Repository layout

```
raw/                      Immutable source material, organized by source TYPE (not topic)
  articles/ assets/ books/ images/ lectures/ papers/ podcasts/ reports/ videos/
wiki/                     LLM-owned knowledge layer
  sources/                One page per ingested source (episodic memory)
  entities/               People, orgs, products, datasets, venues … (catalogue cards)
  concepts/               Cross-source knowledge claims (semantic memory)
  threads/                Open questions gathering evidence
  syntheses/              Durable conclusions closed out from threads
  artifacts/              Verbatim, paper-tied reproductions (tables, taxonomies, instruments)
  index.md                Catalogue of every page, one-line summaries, by category
  log.md                  Reverse-chronological record of every operation
CLAUDE.md                 The schema — the operating contract the agent follows
llm-wiki.md               This blueprint
scripts/                  Node helpers: lint, quality, search, retention, hooks, graph export
extensions/               Custom Quartz plugins for the published site
.claude/                  skills/, commands/, settings.json (hooks)
quartz/, quartz.*.ts      Static-site generator + config (publishes wiki/ to a browsable site)
```

`raw/` is organized by **source type**, not topic — different formats have different processing rules. New typed subfolders are created on the fly when a genuinely new source category appears (`raw/interviews/`, `raw/patents/`).

---

## 4. The four operations

These replace "build / lint / test" for a knowledge repo.

### Ingest = Acquire + Process

A source enters the wiki in two phases that fail differently and run on different cadences.

- **Acquire** lands a raw file and stops: fetch / convert / place into the correct typed `raw/` subfolder. Formats the LLM can't read in one pass are converted to markdown *first* (PDF → markdown via `marker`/`pdftotext`/MarkItDown; YouTube → transcript; `.docx`/`.epub`/`.html` → markdown via pandoc). Acquire only touches `raw/`. Acquire-time skills emit a canonical YAML frontmatter contract that Process reads downstream.
- **Process** turns a raw file into wiki pages: verify identity & completeness (the pre-flight checks, §11), read the source (text, visuals, *and* appendices), discuss takeaways with you, write the source page, tag it, run a neighbour-source scan, then update **every** affected entity/concept/thread page (a single ingest may touch 10–15 files), update `index.md`, and prepend a `log.md` entry.

The split exists because re-acquiring a source from a better channel (higher-quality transcript, full text replacing a sample) is common and benign — it replaces the raw file without re-processing.

### Query

You ask a question against the wiki. The LLM locates relevant pages (via `index.md` at small scale, or hybrid search past ~200 pages), synthesizes an answer **with citations**, and chooses the output format the question calls for — markdown page, comparison table, slide deck (Marp), chart (matplotlib). **Good answers are filed back into the wiki as new pages** so explorations compound rather than vanishing into chat history.

### Lint

A periodic health check: detect contradictions, find stale claims superseded by newer sources, flag orphan pages, identify concepts mentioned but lacking a page, note missing cross-references and data gaps, suggest new questions. Lint **reports**; you decide what to act on. Nothing is auto-deleted.

### Synthesize

When a thread has gathered enough evidence to answer its question, it is closed into a `wiki/syntheses/` page with a fixed contract: **Question · Findings · Sources consulted · Lessons · Open questions**. The thread is marked `closed`; the index and log are updated. Threads are provisional; syntheses are durable.

---

## 5. Page types and frontmatter

Every page carries `type: source | entity | concept | thread | synthesis | artifact`. Discriminators: `kind:` on entities (`person | organization | product | project | place | event | library | dataset | benchmark | venue`) and sources (`paper | report | book | video | lecture | article | image`); `artifact_kind:` on artifacts (`table | equation-block | figure-diagram | survey-instrument | glossary | algorithm`).

Cross-references are **wikilinks only** (`[[target]]` / `[[target|alias]]`) — never bare paths in body text. Wikilinks are the product: a page without links is undermaintained.

---

## 6. The knowledge lifecycle

Knowledge has a lifecycle: a claim from one source is weaker than one confirmed across four; a January claim is weaker than one confirmed last week; new data sometimes supersedes old. Three frontmatter fields plus one protocol capture all three.

**Concept and entity pages carry:**
- `confidence: 0.0–1.0` — how strongly the page is supported by current sources. One source → `0.7`; each additional → `+0.05` (cap `0.95`); a contradicting source → `−0.1`; peer-reviewed / large-N / government-statistical source → `+0.05`. Heuristics, not arithmetic — write a defensible value. Never `0.0` (that means "not evaluated", which a live page may not be).
- `last_confirmed: YYYY-MM-DD` — date of the most recent ingest that reinforced the page.
- `source_count: N` — count of source pages that substantiate the page.

**Sources do not carry `confidence`** — they are evidence, not claims; their reliability is captured by what cites them.

**Supersession protocol** (when new data fully replaces an older claim, not just adds nuance): the retired page keeps its content and gains `status: stale` + `superseded_by: [[new-page]]`; the replacing page gains `supersedes: [[retired-page]]`; a `log.md` entry records it. Nothing is ever deleted. When new data only adds nuance or contradiction, don't mark stale — add a bullet to the page's `## Debates and supersession` section instead (mandatory on any concept with >1 source).

**Author-entity promotion** uses a second-source rule: the first source lists an author in `author:` frontmatter but defers an entity page; the second source citing the same author triggers the entity page. Auditable via `scripts/lint-dangling-authors.mjs`.

---

## 7. Retention — knowledge has a half-life

A concept reinforced last week sits at full strength; one not read or cited in 18 months has likely drifted. This is captured as a **lint signal, never an auto-edit**.

`accessed_at: YYYY-MM-DD` records when a page was last *read into context* (distinct from `last_confirmed`, which is when it was last *written*). At lint and search time an *effective* confidence is derived:

```
effective_confidence = stored_confidence × exp(−days_since_access / tau)
```

with `tau` = 90 days for concepts and syntheses, 365 for entities and artifacts, ∞ for sources (sources don't decay). The decay is **read-only**: it surfaces decay candidates in lint output and lowers a stale page's search rank, but never deletes a page, never auto-writes `status: stale`, and never overwrites `confidence:`. `accessed_at` is bumped by ingest touches, query reads, and manual re-confirmation.

---

## 8. Quality — a mechanical health score

Not every page is equally well-written. A mechanical `quality_score: 0.0–1.0` (the only frontmatter field tooling is permitted to write) flags structural weakness on **concepts and syntheses** — three dimensions: **Structure** (0.40: required sections, frontmatter contract, ≥200-word body), **Citation density** (0.30: ≥3 source-wikilinks per 1000 words), **Cross-consistency** (0.30: relationship targets exist, body-wikilink rule honoured, no broken links). Thresholds: ≥0.85 at ceiling, 0.65–0.85 workable, <0.65 needs work. Computed by `scripts/quality-score.mjs` (idempotent, user-invoked).

**Source-page scoring** adds an **LLM-as-judge overlay** for `kind: paper` pages via `scripts/quality-source-page.mjs --judge`: a mechanical floor (`scripts/quality-source-page.mjs`) computes per-dimension lower bounds, then headless Claude Code returns substantive per-dimension scores with reasoning. Source-page scores live **only** in `logs/` — never in the page — so each judging run starts from clean state. The rubric lives in `.claude/skills/scientific-papers-processing/quality-rubric.md` (`rubric_version:` propagates through the scoring chain).

---

## 9. Search — hybrid retrieval at scale

At small scale `index.md` is enough. Past ~100–200 pages the wiki needs proper search. The template uses **[qmd](https://github.com/tobi/qmd)** (`@tobilu/qmd`): local BM25 keyword + vector semantic + LLM re-ranking, all on-device via GGUF models — no external API, no embedding service.

- The wiki is registered as a qmd collection (name derived from `package.json`'s `name`; override with `WIKI_COLLECTION`). Scope queries with `-c <collection>`.
- `qmd query` is the default for complex questions (hybrid + rerank); `qmd search` for literal terms; `qmd vsearch` is a diagnostic only (pure vector misfires on ambiguous paraphrases).
- After ingest, re-index then re-embed: `qmd update -c <collection>` (picks up new files) then `qmd embed -c <collection>` (vectors for changed-hash docs).
- The query-answering layer re-ranks qmd's hits by §7's `effective_confidence` — relevance from qmd, currency from the lifecycle math.
- Reads bump `accessed_at` on the returned concept/entity/synthesis pages (the `/wq` command and `scripts/wiki-query.mjs` bundle retrieval + bump; sources are skipped).

---

## 10. The typed graph

Body wikilinks encode relationships but are untyped. A `relationships:` frontmatter block adds a typed layer from a **closed vocabulary**: `supports · contradicts · caused · fixed · supersedes · uses · depends-on · part-of · instance-of · authored-by · published-by · employs`. Each edge has a `target` (slug, not a wikilink), an optional `via:` (one-line nuance), and optional `confidence:`.

**Body-wikilink rule (load-bearing):** every typed relationship in frontmatter must also appear as a body `[[wikilink]]` with at least one sentence of context. Frontmatter is the *typed* layer; body is the *navigable* layer; both are required. Source-to-source edges encode the wiki's thematic-cluster index — two sources on the same topic with no edge between them is a graph-quality smell, caught by the **neighbour-source scan** at ingest. `scripts/graph-export.mjs` walks the corpus and emits `wiki/.graph.json` (computing inverse edges), consumed by hybrid search and the published relationships panel.

---

## 11. Verifying sources before ingest

Filenames lie, samples masquerade as full sources, PDFs get truncated, and the highest-leverage content is often locked in appendices. Five **pre-flight checks** run before any ingest:

1. **Scope** — is this the whole source? (compare PDF page count to the TOC's highest page reference; watch for library-preview / `*-sample` filename patterns).
2. **Identity** — does the filename match the content? (identify from cover/title page, not the filename).
3. **Honest scoping** — `length:` frontmatter states what was *actually read*, not the nominal full length.
4. **Visual inventory** — what visuals does the source carry, and did conversion preserve them? (markdown conversion routinely strips images/charts/complex tables; plan a recovery path).
5. **Appendix inventory** — what's in the appendix and how should it be reproduced? (variable dictionaries, instruments, derivations, glossaries — classify by archetype, decide reproduce / promote / defer).

When a check fails, report (a) how the file presents itself, (b) what it actually is, (c) the discrepancy, (d) the proposed action — then ask before writing.

**Visual & appendix content extraction.** Every non-text-based source page carries a `## Visual content` section (exhaustive, accessibility-quality descriptions of every figure/table/diagram, also making visuals searchable through qmd). Sources with substantive appendices carry a `## Appendix content` section cataloguing each appendix with type, location, and a reproduction decision. Load-bearing material is reproduced wiki-native in `## Distinctive artifacts` or promoted to an **artifact page** (verbatim, paper-tied) or a **concept page** (reusable across sources).

---

## 12. Optional domain lens — dynamic-capabilities tagging

The template ships one example of a **domain-specific tagging layer**: source pages may carry a `dynamic_capabilities:` field classifying which Warner & Wäger (2019) digital-transformation process-model cells the source touches, with role-relevance inheritance. This is the most domain-specialised piece of the schema — it makes a *strategy/digital-transformation reading* of the corpus queryable. **Swap it for your own domain lens, or drop it entirely** if it doesn't apply; tagging is encouraged, never forced, and sources outside the lens simply omit the field. The closed vocabulary and role matrix live on a concept page (`warner-wager-process-model`) that you create on first use.

---

## 13. Publishing — Quartz + custom extensions

The wiki publishes as a static site via **[Quartz v4](https://quartz.jzhao.xyz/)** (`npm run serve` for local preview, `npm run build` for the static site; the `.github/` workflow deploys to GitHub Pages). Quartz reads `wiki/` directly; `raw/` is excluded. Custom extensions in `extensions/` teach Quartz the wiki's schema:

| Extension | Purpose |
| --- | --- |
| `inject-type-tags.ts` | Adds `type/<type>` and `kind/<kind>` tags so the graph view and tag pages cluster by page type. |
| `inject-aliases.ts` | Appends frontmatter `aliases` to indexed text so search finds pages by alias. |
| `backlinks-with-aliases.tsx` | Backlinks component that also matches inbound links via a page's aliases. |
| `inject-stale-banner.ts` | Renders a warning banner on `status: stale` pages linking to `superseded_by`. |
| `inject-confidence-badge.ts` | Renders a one-line `Confidence · sources · last confirmed` strip after the H1. |
| `relationships-panel.tsx` | Renders typed `relationships:` as a "related content" panel at the bottom of each page. |
| `catalog-footer.tsx` | Footer catalogue counts across the page types. |
| `strip-dataview.ts` | Strips Obsidian `dataview` blocks (which Quartz can't render). |
| `latex-no-single-dollar.ts` | LaTeX transformer that avoids single-`$` ambiguity. |

---

## 14. Hooks — automation that never edits content

Claude Code hooks (configured in `.claude/settings.json`) handle bookkeeping without manual triggering. **Non-negotiable rule:** hooks may write to `log.md`, lint reports, gitignored derived artifacts (`wiki/.graph.json`, `logs/*`), and the two whitelisted derived fields (`quality_score`, `quality_notes` on concepts/syntheses). Hooks may **NOT** edit any wiki page body or write any source-page frontmatter. Content edits always require explicit in-session approval — this protects the trust contract from automation drift.

| Event | Script | Purpose |
| --- | --- | --- |
| `SessionStart` | `scripts/session-start.mjs` | Emits a wiki snapshot (counts, recent log entries, stale/low-confidence flags). Read-only. |
| `PostToolUse` (Edit, Write) | `scripts/lint-page.mjs` | Validates the lifecycle contract, the closed relationship vocabulary, and the body-wikilink rule on edited wiki pages. Reports to stderr; never blocks. |
| `PostToolUse` (Edit, Write) | `scripts/on-rubric-change.mjs` | When the quality rubric is edited, re-runs the source-page floor scorer and regenerates the HTML report. Writes only to `logs/*`. |
| `Stop` | `scripts/session-end.mjs` | If any wiki page changed this turn, re-runs `graph-export.mjs` to refresh `wiki/.graph.json`. |

---

## 15. Skills inventory (`.claude/skills/`, `.claude/commands/`)

Skills package repeatable workflows the agent invokes by name.

| Skill / command | What it does |
| --- | --- |
| `scientific-papers-processing` | Ingest a paper using Keshav's three-pass reading method bound to the Acquire+Process schema, including the 5 pre-flight checks, appendix archetypes, visual/appendix sections, and a self-score against the quality rubric. |
| `youtube-transcript-skill` | Fetch a YouTube video's metadata + transcript via Playwright into `raw/videos/<slug>.md` with the canonical YAML frontmatter contract. The acquire-time skill for video sources. |
| `zotero-acquire` | Pull items from a local Zotero 7 library into `raw/` (copy PDF, convert to markdown, write an Acquire→Process stub). Acquire-phase only. |
| `neighbour-source-scan` | Step 5 of Ingest: find thematically adjacent sources (shared dynamic-capabilities cells or shared concept citations) and propose typed source-to-source `relationships:` edges. |
| `traceable-wiki-answer` (`/wqa`) | Answer a question and return a fully auditable trace: question, paths explored, used vs. ignored (with reasons), fact locations, and an answer-element → wiki-page map. For provenance-critical queries. |
| `/wq` | Quick wiki query via qmd hybrid search, with automatic `accessed_at` bump per §7. The default interactive lookup. |

---

## 16. Scripts inventory (`scripts/`)

| Script | Purpose |
| --- | --- |
| `lint-page.mjs` | Per-edit hook: validates lifecycle, relationship-vocabulary, and body-wikilink contracts. |
| `lint-confidence.mjs` | Walks concepts/entities; flags confidence/lifecycle-field issues. |
| `lint-dangling-authors.mjs` | Flags authors named on ≥2 sources with no entity page (second-source promotion rule). |
| `lint-appendix-coverage.mjs` | Checks source pages for the `## Appendix content` section's presence and structure. |
| `lint-rubric-version-drift.mjs` | Flags source pages scored against an out-of-date rubric version. |
| `quality-score.mjs` | Mechanical quality scoring for concepts and syntheses (writes `quality_score`/`quality_notes`). |
| `quality-source-page.mjs` | Source-page scorer: mechanical floor + optional `--judge` LLM-as-judge overlay (writes to `logs/`). |
| `quality-log-summary.mjs` / `quality-log-html.mjs` | CLI and HTML views of the source-page eval log. |
| `bump-accessed.mjs` / `seed-accessed-at.mjs` | Retention helpers: bump / seed `accessed_at`. |
| `wiki-query.mjs` | qmd query wrapper that prints results and bumps `accessed_at` (backs `/wq`). |
| `wiki-retrieve.mjs` | Multi-strategy retrieval + candidate ledger (backs `traceable-wiki-answer`). |
| `graph-export.mjs` | Emits `wiki/.graph.json` (nodes + typed edges, with computed inverses). |
| `session-start.mjs` / `session-end.mjs` / `on-rubric-change.mjs` | Hook implementations (see §14). |

---

## 17. Tools and environment

- **Obsidian** is the intended reading surface alongside the agent — graph view, backlinks, and Dataview. The template prefers Obsidian-friendly conventions (`[[wikilinks]]`, attachment folder under `raw/assets/`).
- **Obsidian Web Clipper** converts web articles to markdown for `raw/`. Bind "Download attachments for current file" to a hotkey so clipped images land on disk (LLMs read text first, then view referenced images separately).
- **Marp** (markdown slide decks) and **matplotlib** charts are first-class query-answer output formats alongside markdown pages.
- The whole repo is **plain markdown in git** — version history, branches, and diffs apply to every wiki edit.

---

## 18. Why this works

The tedious part of a knowledge base is not the reading or thinking — it's the bookkeeping: updating cross-references, keeping summaries current, noting contradictions, maintaining consistency across dozens of pages. Humans abandon wikis because maintenance grows faster than value. LLMs don't get bored, don't forget a cross-reference, and can touch 15 files in one pass. The wiki stays maintained because the cost of maintenance is near zero.

The human curates sources, directs analysis, asks good questions, and thinks about what it all means. The LLM does everything else. The idea is Vannevar Bush's Memex (1945) — a private, actively-curated knowledge store where the trails between documents are as valuable as the documents — with the part Bush couldn't solve (who does the maintenance) handed to the LLM.

---

## 19. Using this template

1. Copy the repository.
2. `npm install` (Node ≥ 22).
3. Optionally rename the wiki: set `package.json` `name`, `quartz.config.ts` `pageTitle` / `baseUrl`, and the GitHub Pages remote.
4. Drop your first source into the right `raw/<type>/` folder (or point the agent at a URL / PDF / YouTube link).
5. Tell the agent to ingest it. It reads [`CLAUDE.md`](CLAUDE.md), runs the pre-flight checks, writes the source page, updates concepts/entities, and logs the operation.
6. `npm run serve` to browse the published site; open the repo in Obsidian to read with graph view and backlinks.

Start small — the `index.md` catalogue is enough until the wiki grows past a couple hundred pages, at which point the qmd search layer earns its keep. Everything past §6 is modular: keep what serves your domain, drop what doesn't, and co-evolve `CLAUDE.md` as you learn what works.
