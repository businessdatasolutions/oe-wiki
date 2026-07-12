---
name: scientific-papers-processing
description: Use when ingesting a scientific paper (PDF, preprint, conference proceeding, journal article) into the wiki — i.e. when a `.pdf` lands in `raw/papers/` or `raw/assets/`, or the user says "ingest this paper", "process this paper", "read this paper into the wiki", "summarise this PDF for the wiki", or shares an arXiv / DOI / journal URL and wants a wiki source page. Combines Keshav's three-pass reading method with the wiki's Acquire+Process schema so the depth of reading is bounded by the paper's relevance and the resulting source page carries the full lifecycle contract.
---

# scientific-papers-processing

The disciplined workflow for turning a scientific paper into a wiki source page. The reading depth follows Keshav's three-pass method ([`HowtoReadPaper.pdf`](HowtoReadPaper.pdf)); the body skeleton follows the IMRaD structure ([`Research-Paper-Structure.png.webp`](Research-Paper-Structure.png.webp)); the file paths, frontmatter, and step ordering follow CLAUDE.md §Ingest.

## When to use

- A `.pdf` of a paper lands in `raw/papers/`, `raw/assets/`, or is dragged into the conversation.
- The user shares an arXiv URL, DOI, or publisher link and asks for the paper to be ingested.
- The user asks to "read", "summarise", "process", or "review" a paper for the wiki — fetch and read first, *then* summarise.
- A paper is cited in another source's `references:` and the user wants to chase it down.

When **not** to use:

- The "paper" is a blog post, white paper, or industry report — those go through the `articles/` or `reports/` raw subfolders with lighter conventions, not this skill.
- The user wants a one-off question answered *about* a paper they're holding and is not asking for a wiki page. Use `/wq` or read the PDF inline instead.
- A paper has already been ingested and the user is updating its source page — go straight to the existing page; do not re-run Acquire.

## The two-phase shape (matches CLAUDE.md §Ingest)

```
ACQUIRE                                            PROCESS
─────────────────────                              ──────────────────────────────────────
PDF / URL ──► convert ──► raw/papers/<slug>.md ──► 3-pass read ──► wiki/sources/<YYYY-MM-DD>-<slug>.md
                                                       │
                                                       └► touch concepts/entities/threads as needed
```

Acquire **only** touches `raw/`. Process **only** writes `wiki/`. They can run in the same session (the umbrella `ingest` op in `log.md`) or be split across sessions (then log Acquire as `acquire | …` and Process later as `ingest | …`).

## Phase 1 — Acquire

### 1.1 Identify the source

Capture, before converting:

- **Authors** (exact spelling, all of them, in source order — first author identity is load-bearing for the page slug).
- **Title** (verbatim — colons matter, subtitles matter).
- **Year of publication** (the date that goes in the slug prefix; use the official publication date, not the preprint date, unless the wiki page is explicitly about the preprint).
- **Venue** (journal name + volume/issue, or conference name + year, or `arXiv:NNNN.NNNNN`).
- **DOI** if available; else canonical URL.

### 1.2 Convert PDF → markdown

Per CLAUDE.md §Acquire step 2: papers must be converted to markdown *before* landing in `raw/papers/`. Conversion options, in order of fidelity:

```bash
# Best: preserves structure, equations, tables, figure captions
marker_single <input.pdf> --output_dir raw/papers/ --output_format markdown

# Good fallback for text-heavy papers
markitdown <input.pdf> > raw/papers/<slug>.md

# Last resort — loses formatting
pdftotext -layout <input.pdf> - > raw/papers/<slug>.md
```

Keep the original PDF at `raw/assets/<slug>.pdf` for reference (figures, equation rendering, page-number citations).

### 1.3 Slug naming

Slugify the **first-author surname + year + first-3–4 content words**, lowercase, ASCII, hyphen-separated. Examples:

| Paper | Slug |
|---|---|
| Keshav (2007), *How to Read a Paper* | `keshav-2007-how-to-read-a-paper` |
| Vaswani et al. (2017), *Attention Is All You Need* | `vaswani-2017-attention-is-all-you-need` |
| Dell'Acqua et al. (2026), *Navigating the Jagged Technological Frontier* | `dellacqua-2026-jagged-technological-frontier` |

The raw file lives at `raw/papers/<slug>.md`. The wiki source page filename will use the **publication date** prefix per CLAUDE.md: `wiki/sources/<YYYY-MM-DD>-<slug>.md`.

### 1.4 Acquire-time frontmatter contract

The converted markdown must carry a YAML header — Process reads this during pre-flight. Minimum fields:

```yaml
---
title: <verbatim title>
authors:
  - <Surname, Initial.> (first author)
  - <…>
year: <YYYY>
publication_date: <YYYY-MM-DD>   # ISO; use publication date, not preprint date
venue: <journal / conference / arXiv id>
doi: <10.xxxx/...>               # if available
url: <canonical URL>             # journal page, arXiv abs page, or institutional repo
pdf: <relative path to raw/assets/...pdf>
page_count: <integer>            # actual PDF page count
notes: |
  <provenance: marker_single / pdftotext / human-edited; OCR quality; figures missing; etc.>
---
```

If conversion produced a clean file but the YAML header isn't there, **prepend it by hand** before moving to Phase 2. The header is the contract between Acquire and Process; Process refuses to write a source page without it.

## Phase 2 — Process

### 2.1 Pre-flight checks (CLAUDE.md §Verifying sources before ingest)

Before reading further, run all five checks. **Surface any failure to the user before continuing.**

| Check | Test | Failure action |
|---|---|---|
| **Scope** | Highest TOC page reference ≤ actual PDF page count? Filename matches `*-sample.pdf` / `L-NNNNNNNN-pdf*.pdf` / generic `download.pdf`? | If TOC > pages, you have an excerpt or sample. Stop and ask the user whether to ingest as partial or wait for the full file. |
| **Identity** | Cover/title page authors + title match the filename's claimed identity? | If mismatch (e.g. `Mitchell-Dino-2011.pdf` actually contains Dell'Acqua 2026), flag the mismatch. The slug names the *actual* content; `raw:` frontmatter records the literal filename; note the mismatch in the source page body + log. |
| **Honest scoping** | Will the source page's `length:` field state what was *actually read* (not the nominal full length)? | If you only read pp. 1–15, say so. Front matter + intro + framework only? Say so. Never claim "full ingest" when the body chapters were skipped. |
| **Visual inventory** | How many figures / tables / equations / diagrams does the source carry, and did the markdown conversion preserve them? `pdftotext -layout` drops images entirely; `marker` keeps them as referenced assets but figure semantics may need recovery. | If visuals were lost in conversion, plan to read the original PDF in `raw/assets/<slug>.pdf` directly via Pass 2 (which already covers figures + tables). State the visual count in the pre-write summary so the user can confirm scope of the `## Visual content` section. See [CLAUDE.md §Check 4](../../../CLAUDE.md#check-4--visual-inventory-what-visuals-does-the-source-carry-and-did-the-conversion-preserve-them) and [§Visual content extraction](../../../CLAUDE.md#visual-content-extraction). |
| **Appendix inventory** | Does the source carry appendix material? If so, what archetype (variable definitions / survey instrument / mathematical derivation / sample data / coding-algorithm / supplementary tables / supplementary figures / glossary / author bios) and what's the page range of each? | If substantive appendices exist, plan a targeted PDF read with `pages: "NN-MM"` scoping. Decide reproduction strategy per appendix *before* writing — inline in §Distinctive artifacts / promote to standalone concept page / defer with reason. State the appendix inventory in the pre-write summary so the user can confirm scope of the `## Appendix content` section. See [CLAUDE.md §Check 5](../../../CLAUDE.md#check-5--appendix-inventory-what-does-the-appendix-contain-and-how-should-it-be-reproduced) and [§Appendix content extraction](../../../CLAUDE.md#appendix-content-extraction). The [§Appendix archetypes](#appendix-archetypes) table below names the reproduction strategy per archetype. |

### 2.2 The three-pass read (Keshav, 2007)

The pass depth is bounded by the paper's *relevance* to the wiki, not by completeness for its own sake. Keshav's method:

**Pass 1 — Bird's-eye view (5–10 min). Always run.**

1. Read title, abstract, introduction.
2. Read section + subsection headings (skip body).
3. Read conclusions.
4. Glance over references — mentally tick those already in the wiki.
5. **Read appendix headings only.** Note presence, page range, and apparent type (variable list / instrument / derivation / supplementary tables / etc.) for each appendix. Populate the Check 5 inventory. Don't read appendix body content at Pass 1.

At the end of Pass 1, answer the **five Cs**:

1. **Category** — measurement / analysis / prototype / position / survey / framework.
2. **Context** — which other wiki sources is this related to? Which theoretical bases?
3. **Correctness** — assumptions defensible?
4. **Contributions** — main claims, in one sentence each.
5. **Clarity** — well-written? Equations rigorous? Figures honest (error bars, axis labels)?

**Decision gate:** Decide depth:

- Outside wiki scope → write a minimal Pass-1-only source page (length: `"~N pages (Pass 1 only — abstract, intro, conclusions read; body deferred)"`) so the paper is *findable* if it later becomes relevant. Confidence stays modest (0.7 default).
- Adjacent to wiki interests → continue to Pass 2.
- Core to current threads → continue to Pass 2, plan for Pass 3.

**Pass 2 — Content grasp (up to 1 hour). Run when paper is adjacent/core.**

1. Read figures + tables with care. Are axes labelled? Error bars? Sample sizes? Statistical significance noted? *Common figure mistakes separate excellent from shoddy work — flag them in the source page body.*
2. Read methods + results in full. Skim proofs.
3. Mark unread references that look central — add them to a "Citations to chase" list in the source page body.
4. **Read substantive appendix content** alongside body — especially methods-supporting appendices (variable definitions, hyperparameter grids, survey instruments, glossaries). Use targeted PDF reads via `pages: "NN-MM"` rather than re-reading the whole document. Transcribe load-bearing tables / instruments as wiki-native artifacts per the [§Appendix archetypes](#appendix-archetypes) table.
5. You should now be able to summarise the paper to someone else with supporting evidence — *including* what the appendix enables a reader to do next (replicate the survey? reuse the variable list? port the algorithm?).

If you can't summarise at the end of Pass 2: either the subject matter is genuinely unfamiliar (note this honestly — confidence cap at 0.7 until a Pass 3 or a second source corroborates), or the paper is poorly written (flag this in the source page).

**Pass 3 — Virtual re-implementation (4–5 hours novice / 1 hour expert). Run only for core/load-bearing papers.**

1. Re-create the work mentally: same assumptions, same data, what would *you* have concluded?
2. Challenge every assumption in every statement.
3. Identify implicit assumptions, missing citations, weak experimental controls.
4. **Read all appendix content.** Reproduce everything load-bearing as wiki-native artifacts. **Promote reusable catalogues** (variable dictionaries, named instruments, named algorithms, glossaries) to standalone concept pages under `wiki/concepts/` so they serve the whole corpus, not just this source page. The promotion move is what earns D6 = 3 on the quality rubric.
5. Jot down future-work ideas — these may become `wiki/threads/` entries.

A Pass-3-read paper supports a confidence of 0.85+ and is candidate material for the page's `## Debates and supersession` section if it contradicts or refines an existing wiki claim.

**Honest-scoping convention extended.** The `length:` field should state what was read from each section, including appendices. Example: *"~36 pages (Pass 2 — main body + Appendix variable table read; Supplementary Material Tables SM1–SM12 deferred)"*. A Pass-2 page that read the body but skipped the appendix is fine — say so in `length:` and in the *"What was actually ingested"* body section, and the D6 score will reflect it (= 1, acknowledged but deferred).

### Appendix archetypes

Used by [CLAUDE.md §Check 5](../../../CLAUDE.md#check-5--appendix-inventory-what-does-the-appendix-contain-and-how-should-it-be-reproduced), [CLAUDE.md §Appendix content extraction](../../../CLAUDE.md#appendix-content-extraction), [CLAUDE.md §Artifacts](../../../CLAUDE.md#artifacts), and the per-pass guidance above. The archetype determines reproduction strategy and where the reproduction lives.

| Archetype | Examples | Reproduction target |
| --- | --- | --- |
| **Variable definitions / data dictionaries** | Altman's 164-variable Omega Score table; KPI dictionaries; coding schemes; data-element catalogues | **Concept page** when reusable across the cluster (e.g. a variable set shared across several papers in a thematic cluster — see [[shared-variable-definitions]]). **Artifact page** when paper-specific (one paper's variable list run on its own data). Inline in §Distinctive artifacts only for tiny (<8-row) lists. |
| **Survey / interview instruments** | Likert scales, question batteries, interview protocols, vignettes, experimental stimuli | **Concept page** when the instrument is *named* (Big Five, NPS, MBTI, GHQ-12) — other studies will reuse it. **Artifact page** for paper-specific custom instruments. Fenced quote / numbered list. |
| **Mathematical derivations / proofs** | Step-by-step proofs, alternative derivations, regularity conditions, optimisation derivations | **Concept page** when the derivation underpins a named result reused elsewhere. **Artifact page** for paper-specific derivations. Fenced LaTeX or blockquoted equations. |
| **Sample data / examples** | Sample firm records, anonymised case studies, example questionnaire responses, code traces | **Artifact page** (case-specific); rarely promoted to concept. Fenced code or table. |
| **Coding / algorithm details** | Pseudocode, hyperparameter grids, R/Python snippets, model-architecture diagrams, training schedules | **Concept page** when the algorithm is named and reusable (e.g. a named NLP pipeline, a benchmark protocol). **Artifact page** for paper-specific hyperparameter grids. Fenced code/pseudocode. |
| **Headline / model-comparison tables** | AUC tables, classification-accuracy tables, regression-coefficient summaries, multi-model benchmark tables | **Artifact page** by default — these are the most cited tables in any paper and always paper-specific. Inline §Distinctive artifacts only when ≤5 rows. |
| **Per-country / per-segment empirical tables** | Country-by-country MDA coefficients, industry-segment breakdowns, sub-sample regression results | **Artifact page** — paper-specific empirical output; the wikilink-and-summary catalogue entry on the source page stays brief. |
| **Supplementary statistical tables** | Robustness checks, sensitivity analyses, alternative specifications, sub-sample breakdowns | **Defer with reason** in §Appendix content when not load-bearing for the page's central claims. **Artifact page** when robustness check is the *whole point* of the paper. |
| **Supplementary figures** | ROC curves, PCA plots, calibration plots, example trees, additional time-series | Describe in §Visual content (accessibility-quality). **Artifact page** only when load-bearing (Mermaid / ASCII art / fenced). |
| **Taxonomies / classification schemes** | Risk-disclosure topic models (Hajek BERTopic), industry classifications, capability taxonomies | **Concept page** when taxonomy is intended to generalise (e.g. a published industry taxonomy). **Artifact page** when produced by the paper's own run on its own data. |
| **Literature-synthesis matrices** | Author-by-finding review tables, model-by-ratio prior-literature matrices | **Artifact page** — bibliographic artifacts tied to the surveying paper. The catalogue value justifies full reproduction even at 30–80 rows. |
| **Glossaries / acronym lists** | Domain-specific term definitions, abbreviation tables, controlled vocabularies | **Concept page** when the glossary has corpus-wide value (other sources will cite). **Artifact page** for paper-specific notation tables. |
| **Author bios / funding / disclosures / IRB statements** | "About the authors", grant numbers, conflict-of-interest, ethics approval, registered-trial IDs | **Skip transcription.** One-line marker in §Appendix content. |

The taxonomy is non-exhaustive. When you encounter an artifact that doesn't fit, treat it like the closest archetype and document the reasoning in the §Distinctive artifacts catalogue entry on the source page.

**Promotion heuristic** (the concept-vs-artifact split — see [CLAUDE.md §Artifacts](../../../CLAUDE.md#artifacts) for the full rule):

- **Concept page** when **any** of: (a) more than one corpus source could plausibly cite the same artifact, (b) the artifact has a name the wider literature uses (instrument, algorithm, formula, taxonomy), or (c) the artifact is the kind of thing an *expert reader would copy out for their own work* — variable lists, survey instruments, glossaries, named procedures.
- **Artifact page** when the artifact is **paper-tied evidence**: the paper's own regression output, the paper's own variable run, the paper's own sample, the paper's own per-segment breakdown.

Bias toward *promotion to artifact page* when the choice is borderline; the cost of an under-cited artifact page is much lower than the cost of leaving a reusable table locked in a single source's `## Distinctive artifacts` section as paraphrase.

### 2.3 Discuss key takeaways with the user

Per CLAUDE.md §Process step 2: before writing the source page, surface the headline findings in a short response. Format:

```markdown
**Pre-write summary of `<slug>`:**

- **Five Cs:** Category = …, Context = …, Correctness = …, Contributions = …, Clarity = …
- **Headline finding:** <one sentence>
- **Visual inventory:** ~N figures, M tables, K equations — conversion fidelity: clean / partial / images-stripped (PDF read planned for §Visual content)
- **Appendix inventory:** <one line per appendix: archetype + page range + routing decision>, or *"none — no substantive appendix material"*. Example: *"Appendix A (pp. 2411–2416): variable-definitions, 164 vars × 18 categories → promote to standalone concept page `[[shared-variable-definitions]]`"*
- **W&W cells in play:** <list, or "none — outside W&W lens">
- **Concepts/entities I'll touch:** [[concept-a]], [[concept-b]], [[Author Name]]
- **Neighbour-source candidates (preview):** [[source-X]], [[source-Y]] — full scan in step 5
- **Proposed confidence:** 0.XX (rationale: …)
- **Read depth:** Pass 1 / Pass 2 / Pass 3
```

Wait for user confirmation (or, in auto mode, the user's standing approval per session) before writing the source page.

### 2.4 Write the source page

File: `wiki/sources/<publication_date>-<slug>.md`.

Frontmatter contract (mirrors CLAUDE.md §Lifecycle + the video-source convention, adapted for papers):

```yaml
---
type: source
kind: paper
title: "<verbatim title — quote if it contains a colon>"
author:                          # array, even for solo papers
  - "<First Author Surname, Initial.>"
  - "<…>"
url: "<DOI URL or canonical URL>"
date_published: <YYYY-MM-DD>
length: "~N pages (Pass X — what was actually read)"
venue: "<journal/conference/arXiv>"
doi: "<10.xxxx/...>"             # optional but encouraged
citation_key: "<firstauthor_YYYY_firstkeyword>"  # BibTeX handle; lowercase, underscores
raw: "../../raw/papers/<slug>.md"
pdf: "../../raw/assets/<slug>.pdf"
confidence: 0.70-0.95            # per Lifecycle rules
last_confirmed: <today YYYY-MM-DD>
source_count: 1                  # this page itself is one source; concept pages aggregate
accessed_at: <today YYYY-MM-DD>
tags: [<topic-1>, <topic-2>, ...]
dynamic_capabilities:            # optional; per W&W vocabulary
  - <bucket>/<cell>
relationships:                   # added in step 5 after neighbour-source-scan
  - type: <vocabulary>
    target: <slug>
    via: "<one-line nuance>"
---
```

Body skeleton (IMRaD-aligned, with the Keshav five Cs woven in):

```markdown
# <Title>

> <Abstract verbatim, as a blockquote. This is the paper's own framing,
> shown before the wiki's interpretation overlays it.>

## TL;DR

<2–4 sentences. The headline finding + the one thing a wiki reader needs to remember.>

## Citation

**APA (7th edition):**

> <Rendered APA string — see §2.4a for construction rules.>

**BibTeX:**

```bibtex
@<entry-type>{<citation_key>,
  author  = {<Surname1, First1 and Surname2, First2 and ...>},
  title   = {<Title>},
  year    = {<YYYY>},
  ...
}
```

## What was actually ingested

<State the read depth honestly. If Pass 1 only, say so. If Pass 2 covered methods
but skimmed proofs, say so. This is the "honest scoping" check operationalised.>

## Context (WHY)

<Why was this paper written? What does the introduction frame as the problem?
What theoretical bases ground the work? Which other wiki sources is it adjacent to?>

## Methods (HOW)

<What did the authors do? Study design, dataset, N, instruments, analytical
technique. For theoretical papers: framework, propositions, scope conditions.>

## Results (WHAT)

<What did they find? Reference specific figures by number. Note effect sizes,
confidence intervals, statistical significance where reported.>

## Visual content

<Exhaustive accessibility-quality catalogue of every visual in the paper —
figures, tables, equations, flow diagrams, photos, screenshots, illustrations.
One entry per visual, in source order, each with: heading (`### Figure N — …`),
**Type:**, **Caption (verbatim):** if present, **Location:** page or section,
followed by a prose description (50–200 words for substantive visuals, 20–50
for incidental ones) covering layout, axes/scales, headline values, trends,
visual encoding, annotations, and what the visual is arguing. Entries for
load-bearing visuals can be terser and end with `→ reproduced in § Distinctive
artifacts`. See [CLAUDE.md §Visual content extraction](../../../CLAUDE.md#visual-content-extraction)
for the full contract. If the paper genuinely has no visuals, write
`> No visuals in source.` instead of omitting the section.>

## Appendix content

<Catalogue of every appendix in the paper. One entry per appendix, in source
order, each with: heading (`### Appendix [letter/number] — <name>`),
**Type:** (archetype from the [§Appendix archetypes](#appendix-archetypes) table),
**Location:** pp. NN–NN (PDF pp. MM–MM if different), **Reproduction:** inline
in §Distinctive artifacts | extracted to `[[concept-page-slug]]` |
extracted to `[[artifact-slug]]` | deferred
(<reason>), followed by a 50–200-word content summary (row counts / question
counts / key categories / load-bearing observations). Formal back matter (author
bios, funding, IRB) gets a single one-line marker. See [CLAUDE.md §Appendix
content extraction](../../../CLAUDE.md#appendix-content-extraction) for the
full contract. If the paper has no appendix at all, omit this section — the
quality scorer treats absence as N/A (excluded from denominator).>

## Distinctive artifacts

<The paper's named taxonomies, key tables, headline figures, named equations,
cause-effect diagrams, and named scores. v0.7 changes the default reproduction
target: each load-bearing artifact is promoted to its own page under
`wiki/artifacts/<slug>.md` (or `wiki/concepts/<slug>.md` when the artifact is
genuinely reusable across the corpus — see the promotion heuristic in
§Appendix archetypes and [CLAUDE.md §Artifacts](../../../CLAUDE.md#artifacts)).
This section becomes a **catalogue** of those artifacts: each entry names the
artifact, locates it in the source, and links to its dedicated page. Reserve
inline reproduction for the smallest tables (<8 rows), short equations, and
brief Mermaid diagrams where the artifact-page overhead exceeds its value.

Catalogue entry skeleton:

```markdown
### Table N — <verbatim caption or short topic>

**Type:** <archetype from §Appendix archetypes>
**Location:** pp. NN–MM
**Reproduced in:** [[<artifact-slug>]]

<1-2 sentence summary of what the artifact carries and why it matters.>
```

This section is the structural home for D3 of
[quality-rubric.md](quality-rubric.md). D3 = 3 is satisfied when every load-
bearing artifact is reproduced *either* inline here *or* by wikilink to a
`type: artifact` / `type: concept` page where the verbatim reproduction lives.
Distinguish distinctive artifacts (named scores, headline tables,
argument-carrying diagrams) from incidental ones (correlation heatmaps,
descriptive-statistics tables, reference lists) — only the former belong here.
Visuals reproduced here should also appear (as descriptions) in `## Visual
content` above — the catalogue is exhaustive, the reproductions are selective.>

## Discussion / Significance (SO WHAT)

<What does it mean for the wiki's current claims? Does it support, refine,
contradict, or supersede an existing concept page? Limitations the authors
acknowledge; limitations they don't.>

## Citations to chase

<References from the paper that look central but aren't yet in the wiki.
This is the seed list for follow-on Acquire sessions.>

## Linked entities and concepts

<Wikilinks to every entity and concept page this source touches. Authors
go in `author:` frontmatter; if any author is a second-source mention, this
is where the new entity page gets linked — per CLAUDE.md §Author-entity
promotion. Dangling (first-mention) authors are listed here under
"**Dangling** (single-source mention, deferred): …".>

## Source-to-source relationships

<Wikilinks to neighbour sources surfaced by the scan in step 5. Each
relationship in `relationships:` frontmatter must appear here as a body
wikilink with at least one sentence of context — per CLAUDE.md
§Body-wikilink rule.>
```

### 2.4a Construct the APA + BibTeX citation (mandatory)

Every paper source page **must** carry both an APA 7th-edition reference and a BibTeX entry in its `## Citation` section. The two are derived mechanically from the acquire-time frontmatter (`authors`, `title`, `year`, `venue`, `doi`, `url`, plus volume/issue/pages when present) — no creative work needed once the metadata is captured correctly.

**Citation key convention.** `<first-author-surname>_<year>_<first-content-keyword>`, lowercase, ASCII, underscores. Matches the slug pattern so BibTeX handle and file slug stay aligned. Examples:

| Paper | `citation_key` |
|---|---|
| Keshav (2007), *How to Read a Paper* | `keshav_2007_read_paper` |
| Vaswani et al. (2017), *Attention Is All You Need* | `vaswani_2017_attention` |
| Dell'Acqua et al. (2026), *Navigating the Jagged Technological Frontier* | `dellacqua_2026_jagged_frontier` |

**APA 7th-edition rules** (the four templates that cover ~95% of papers):

| Type | Template |
|---|---|
| **Journal article (with DOI)** | `Author, A. A., & Author, B. B. (YYYY). Title of the article. *Journal Name*, *Volume*(Issue), pp–pp. https://doi.org/...` |
| **Journal article (no DOI, online)** | `... Title. *Journal Name*, *Volume*(Issue), pp–pp. <URL>` |
| **Conference proceeding** | `Author, A. A. (YYYY). Title of the paper. In *Proceedings of the Conference Name* (pp. pp–pp). Publisher. https://doi.org/...` |
| **arXiv / preprint** | `Author, A. A., & Author, B. B. (YYYY). Title of the paper. *arXiv*. https://doi.org/10.48550/arXiv.NNNN.NNNNN` |

APA mechanics — keep these right:

- **Authors:** `Surname, F. M.` (initials with periods, no full first names). Up to 20 authors are listed in full, separated by commas with `, &` before the last. For 21+ authors: list first 19, then `…`, then final author.
- **Year:** in parentheses; `(YYYY)` for published works, `(YYYY, Month DD)` for preprints when only an upload date exists.
- **Title:** sentence case (only first word + proper nouns + first word after a colon are capitalised). Italicise journal title and volume number, **not** issue or pages.
- **DOI:** always as a clickable URL `https://doi.org/<DOI>`; no `DOI:` prefix. If the paper has a DOI, use it — even if you accessed via a PDF.
- **Single-author papers:** no `&`. Two authors: `Surname, F., & Surname, F.`. Three to twenty: comma-separated with `, &` before the last.

**BibTeX entry types** (pick the right one — wrong type breaks reference managers):

| Source | Entry type | Required fields |
|---|---|---|
| Peer-reviewed journal article | `@article` | `author, title, journal, year, volume, number, pages, doi` |
| Conference paper | `@inproceedings` | `author, title, booktitle, year, pages, publisher, doi` |
| Book | `@book` | `author, title, year, publisher, address, isbn` |
| Book chapter | `@incollection` | `author, title, booktitle, editor, year, pages, publisher` |
| arXiv preprint | `@misc` (or `@unpublished`) | `author, title, year, eprint, archivePrefix={arXiv}, primaryClass, doi` |
| Tech report / working paper | `@techreport` | `author, title, institution, year, number` |

BibTeX mechanics — keep these right:

- **Author field:** `Surname1, First1 and Surname2, First2 and ...` — the literal word `and` separates authors (not commas, not `&`).
- **Title field:** wrap in `{...}` to preserve case (`title = {Attention Is All You Need}`). BibTeX otherwise lowercases titles in many styles.
- **Special characters:** escape with backslash (`\&`, `\%`, `\_`). Accented characters: prefer Unicode literals (`Sørensen`) — modern engines handle them, and the wiki is UTF-8 throughout.
- **DOI field:** the bare DOI only (`10.xxxx/...`), without the `https://doi.org/` prefix — reference managers add that themselves.
- **Pages:** double-hyphen (`pages = {1--15}`) — BibTeX renders the en-dash from `--`.

**Worked example — journal article with DOI:**

```
APA: Dell'Acqua, F., McFowland III, E., Mollick, E. R., Lifshitz-Assaf, H., Kellogg, K. C.,
     Rajendran, S., Krayer, L., Candelon, F., & Lakhani, K. R. (2026). Navigating the jagged
     technological frontier: Field experimental evidence of the effects of AI on knowledge
     worker productivity and quality. *Academy of Management Journal*, *69*(2), 412–447.
     https://doi.org/10.5465/amj.2024.0124
```

```bibtex
@article{dellacqua_2026_jagged_frontier,
  author  = {Dell'Acqua, Fabrizio and McFowland III, Edward and Mollick, Ethan R. and
             Lifshitz-Assaf, Hila and Kellogg, Katherine C. and Rajendran, Saran and
             Krayer, Lisa and Candelon, François and Lakhani, Karim R.},
  title   = {{Navigating the Jagged Technological Frontier: Field Experimental Evidence of
             the Effects of AI on Knowledge Worker Productivity and Quality}},
  journal = {Academy of Management Journal},
  year    = {2026},
  volume  = {69},
  number  = {2},
  pages   = {412--447},
  doi     = {10.5465/amj.2024.0124}
}
```

**Worked example — arXiv preprint:**

```
APA: Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N.,
     Kaiser, Ł., & Polosukhin, I. (2017). Attention is all you need. *arXiv*.
     https://doi.org/10.48550/arXiv.1706.03762
```

```bibtex
@misc{vaswani_2017_attention,
  author        = {Vaswani, Ashish and Shazeer, Noam and Parmar, Niki and Uszkoreit, Jakob
                   and Jones, Llion and Gomez, Aidan N. and Kaiser, Łukasz and Polosukhin, Illia},
  title         = {{Attention Is All You Need}},
  year          = {2017},
  eprint        = {1706.03762},
  archivePrefix = {arXiv},
  primaryClass  = {cs.CL},
  doi           = {10.48550/arXiv.1706.03762}
}
```

**When metadata is missing.** If a field genuinely cannot be recovered (no DOI, unknown pages, missing volume), state `n.d.` for year, `n.p.` for pages, and omit the field rather than fabricating. Note the gap in the source page's `notes:` provenance field so a future ingest can fix it.

### 2.5 Tag `dynamic_capabilities:` (W&W microfoundations)

Encouraged, not forced. If the paper is about LLM internals, quantisation mechanics, or any other domain outside the Warner & Wäger lens — skip the field. Otherwise pick from the closed vocabulary on `[[concepts/warner-wager-process-model]]`. Every cell named in frontmatter needs at least one body sentence saying *how* the paper touches it (the body-twin rule).

### 2.5b Self-score against the quality rubric

Before running the neighbour-source scan and the catalogue updates, score the just-written source page against [`quality-rubric.md`](quality-rubric.md). v0.6 lands the LLM-as-judge slice — judgment now runs from a fresh LLM call every time, not from a hand-filled body block.

**Single-step:** run the judge for the just-written page:

```sh
node scripts/quality-source-page.mjs --judge --page <slug>
```

What happens, in order:

1. The scorer filters to `kind: paper` pages — only paper sources are subject to the Keshav 3-pass + IMRaD rubric. Reports, video transcripts, articles drop out.
2. The mechanical-floor pass runs first (structural lint per D1–D6). The floor is the **lower bound** — never silently overridden downward.
3. Headless Claude Code (`claude -p ... --output-format text`) is invoked with the rubric, the page body (with any `## Quality review` block stripped), and the floor as guardrails. It returns per-dimension scores 0–3 plus reasoning.
4. The judgment may go below the floor for a dimension *only* if the LLM provides an explicit `below_floor_reason` (per the rubric's "never overridden silently" rule). Such cases land in the `judgment_warnings` field of the log line.
5. Both floor and judgment land in `logs/quality-source-pages.jsonl` as a single entry. The HTML report and CLI viewer surface judgment as primary; floor stays visible as the structural-integrity baseline.

**Gate** (reading the log's `total` for the just-judged slug):

- **Total ≥ 0.85** → at ceiling; proceed to §2.6.
- **0.65 ≤ Total < 0.85** → workable. Read `judgment_reasoning` per dim for the issues the judge flagged — typically D3 (populate `## Distinctive artifacts` with reproductions) or D4 (replace boilerplate limitations with paper-specific items). Re-run the judge, then proceed.
- **Total < 0.65** → **do not commit**. Same diagnostic path as above. Fix and re-run.

**Never** write judgment scores back into the wiki page (body or frontmatter). The page is the *input* to scoring, never the output. Every re-judgment starts from clean state — this is the safeguard against anchoring on prior scores.

**Floor-only quick check (no LLM call):**

```sh
node scripts/quality-source-page.mjs --page <slug>
```

Useful when iterating on structural compliance (sections present, mentions, phrases). Skip this; just run `--judge` when you're ready for the actual gate.

**Eval log (automatic).** Every run appends one JSONL line per scored page to [`logs/quality-source-pages.jsonl`](../../../logs/quality-source-pages.jsonl). Entries with `kind: "mechanical-floor"` are floor-only; entries with `kind: "mechanical-floor + llm-judgment"` carry the LLM overlay. Pass `--no-log` to skip the log append (e.g. local experimentation).

View the log via the read-only **CLI viewer**:

```sh
node scripts/quality-log-summary.mjs                       # latest state per page (default)
node scripts/quality-log-summary.mjs --page <slug>         # full history of one page, with ↑/↓ deltas
node scripts/quality-log-summary.mjs --latest 20           # last 20 entries chronologically
node scripts/quality-log-summary.mjs --since 2026-05-01    # entries since a date
node scripts/quality-log-summary.mjs --json --page <slug>  # raw JSONL for piping into jq
```

…or generate a **self-contained HTML report** (sortable table, clickable drill-down with per-dimension sparklines, dark-mode aware, no external libs — opens directly via `file://` in any browser):

```sh
node scripts/quality-log-html.mjs                # writes logs/quality-report.html
node scripts/quality-log-html.mjs --open         # also opens in default browser
node scripts/quality-log-html.mjs --out <path>   # custom output location
```

The HTML embeds the JSONL data inline at generate-time, so re-run the generator to refresh the report.

### 2.6 Run the neighbour-source scan

Invoke the **[`neighbour-source-scan`](../neighbour-source-scan/SKILL.md) skill** — both Path A (W&W cell overlap) and Path B (shared concept-page citations). Add the resulting typed edges to `relationships:` frontmatter and write the body wikilinks. **At ≥3 candidate neighbours, surface the list before commit.**

### 2.7 Update concepts, entities, threads, artifacts

For every concept or entity page touched, bump `last_confirmed` and `accessed_at` to today and recompute `source_count` + `confidence` per the Lifecycle rules. For each new author meeting the second-source promotion rule, create an entity page. If the paper contradicts an existing wiki claim, add an entry to that page's `## Debates and supersession` section.

For each load-bearing artifact identified in §2.2 Pass 2 (figures, tables, named scores, taxonomies, instruments, regression outputs, per-segment breakdowns), apply the promotion heuristic in §Appendix archetypes:

- **Reusable across the corpus** → create / update a `wiki/concepts/<slug>.md` page. Carry the v0.2 lifecycle contract (`confidence`, `source_count`, `last_confirmed`, `accessed_at`).
- **Paper-tied evidence** → create a `wiki/artifacts/<slug>.md` page per [CLAUDE.md §Artifacts](../../../CLAUDE.md#artifacts). Frontmatter: `type: artifact`, `artifact_kind:`, `source: [[<source-slug>]]`, `source_table_ref:`, `source_pages:`, `last_confirmed:`, `accessed_at:`. No `confidence:`, no `source_count:`.
- **Tiny (<8 rows) or fully captured inline** → leave in the source page's `## Distinctive artifacts` section as a verbatim reproduction (no promotion).

Update the source page's `## Distinctive artifacts` section to point at each new artifact page via wikilink — the section is a catalogue, not a duplicate of the data.

### 2.8 Catalogue updates

- Add the new source page to `wiki/index.md` under `## Sources`, one-line summary.
- Add any new artifact pages to `wiki/index.md` under `## Artifacts` (new section), one-line summary each.
- Prepend a `log.md` entry: `## [<today>] ingest | <slug>` (or `acquire | <slug>` if Process is being deferred). When multiple artifacts were promoted, mention the count.
- Re-run `node scripts/quality-score.mjs` for any concept page touched.
- Re-embed for search: `npx @tobilu/qmd embed`. (This catches the new artifact pages automatically; the qmd collection root is `./wiki`.)

## Pass-depth quick-reference

| Read depth | Time | Page state | Confidence ceiling |
|---|---|---|---|
| **Pass 1 only** | 5–10 min | Abstract + intro + headings + conclusions read | 0.70 (single source, light contact) |
| **Pass 2** | up to 1 hr | + figures, methods, results, citations-to-chase | 0.85 (full grasp, no re-implementation) |
| **Pass 3** | 1–5 hr | + virtual re-implementation, assumption challenge | 0.95 (deep engagement, defensible) |

A paper does not need Pass 3 to enter the wiki. A Pass-1-only paper is honest about its depth in `length:` and `## What was actually ingested`, and that's enough.

## Common mistakes

| Mistake | Fix |
|---|---|
| Reading the PDF cover-to-cover before Pass 1 | Run Pass 1 first; let the 5 Cs gate further depth. Plowing through a paper that's outside wiki scope wastes hours. |
| Claiming Pass 2 depth after only reading the abstract | `length:` lies → wiki corrodes. Be honest: "~24 pages (Pass 1 only)" is fine. |
| Treating the filename as identity | Always read the cover page. The Mitchell-Dino-2011 → Dell'Acqua-2026 precedent in CLAUDE.md is the warning. |
| Skipping pre-flight on a "famous" paper | Famous ≠ verified. Even canonical PDFs can be excerpts, mis-labelled, or OCR-mangled. |
| Forgetting the abstract blockquote | Body must open with the paper's *own* framing as a blockquote — same convention as videos opening with the YouTube description. |
| Citing figure numbers without reading figures | If a figure isn't worth opening in the PDF, it isn't worth citing. |
| Skipping enumeration of the paper's distinctive taxonomy/diagram/equation — "the prose summary covers it" | No. D3 of [`quality-rubric.md`](quality-rubric.md) explicitly requires distinctive artifacts named **and reproduced**. Tables and named diagrams are the part of the paper that survives translation worst; enumeration is cheap. The `## Distinctive artifacts` section is the structural home — populate it, don't paraphrase it away. |
| Trusting the markdown conversion when figures are missing — "if it isn't in the markdown, the paper doesn't have it" | No. `pdftotext -layout` drops every image; `marker` keeps assets but the figure's argumentative meaning isn't in the asset name. Always cross-check figure/table count against the original PDF in `raw/assets/` during pre-flight Check 4. Read the PDF directly if the conversion is lossy. |
| Skipping `## Visual content` because "the figures aren't important to my summary" | No. The section is a contract, not a summary-quality call. Describe every visual, briefly if it's incidental — the catalogue is the value, not your judgement of importance. Use `> No visuals in source.` only when the source genuinely carries none. |
| Describing only the headline figure and using "see paper for the rest" | The section is exhaustive, not selective. Incidental visuals get short descriptions (20–50 words); load-bearing ones get full descriptions (50–200 words) plus reproduction in `## Distinctive artifacts`. |
| Skipping neighbour-source-scan because "this paper is obviously isolated" | Run grep first, intuition second. The MGI ↔ FTSG bridge incident is the warning. |
| Promoting every author to an entity on first sight | Apply the second-source rule. List first-time authors under **Dangling** in the source page; only promote on the second source citing them. |
| Re-acquiring without updating the source page | Re-acquisition replaces the raw file but does **not** touch the wiki page until Process re-runs. If you re-acquired (better OCR, full version replacing a sample), schedule Process. |
| Skipping the `## Citation` section because "the URL is enough" | APA + BibTeX are **mandatory** per §2.4a. The URL alone doesn't survive transcription into a paper, slide deck, or reference manager. |
| Writing BibTeX with `&` between authors | BibTeX uses the literal word `and`. `&` is reserved and must be escaped (`\&`) when it appears inside a field value. |
| Lowercasing a BibTeX title field | Wrap it in `{...}` so styles don't down-case `LLM` to `llm` or strip the case from a proper noun. |
| APA `et al.` on the first cite | APA 7th lists up to 20 authors in full on the reference page. `et al.` belongs in *in-text* citations, not in the reference. |

## Red flags — STOP and re-check

- *"This paper is the same as the filename claims"* — verify with the cover page, not the intuition.
- *"The TOC references chapter 12 but the PDF only has 30 pages"* — you have a sample. Surface to user.
- *"I'll write the source page now and run the neighbour scan later"* — neighbour scan is step 5 of Process *before* index/log updates. Catching omissions after commit is more painful than catching them in the scan.
- *"The paper is outside wiki scope so I'll skip writing the source page"* — write it anyway, Pass 1 only. Future-you may discover it became relevant.
- *"I'll mark this Pass 2 because I read most of it"* — *most* is not *Pass 2*. Pass 2 has a specific definition (figures read with care, methods + results in full). Be honest.
- *"The DOI link in frontmatter is enough; I can skip the rendered APA/BibTeX"* — no. The body `## Citation` section is mandatory per §2.4a. Citations are an output of the wiki, not just metadata.
- *"I don't know the volume/issue, I'll leave it blank in BibTeX"* — fine, **but** note the gap in `notes:` so a future ingest can fix it. Silent omissions corrode reference-manager imports months later.
- *"D3 is 0 but the prose summary is thorough — close enough"* — no. The rubric's worked anchors show this is the exact failure mode it was built to catch. A thorough prose summary that omits Table 4's taxonomy or Figure 3's flow diagram still scores **D3 = 0**, and the total falls below 0.65. Populate `## Distinctive artifacts`.
- *"The markdown conversion has no images, so the paper must be text-only"* — no. `pdftotext -layout` drops all images silently; `marker` keeps them but the asset names hide the figure semantics. Open the original PDF in `raw/assets/` during pre-flight Check 4 and count visuals there. The `## Visual content` section is built from the PDF, not the conversion.
- *"I'll skip `## Visual content` and just populate `## Distinctive artifacts`"* — no. The two serve different needs: Visual content is the **exhaustive accessibility catalogue** (every visual described); Distinctive artifacts is the **selective reproduction** (load-bearing visuals recreated as wiki-native content). A load-bearing visual appears in both — described once, reproduced once.

## Related skills and references

- **Reading discipline:** [`HowtoReadPaper.pdf`](HowtoReadPaper.pdf) — S. Keshav, *How to Read a Paper*, ACM SIGCOMM CCR 2007. The three-pass method this skill operationalises.
- **Body skeleton:** [`Research-Paper-Structure.png.webp`](Research-Paper-Structure.png.webp) — IMRaD anatomy: Title/Abstract → Intro (WHY) → Methods (HOW) → Results (WHAT) → Discussion (SO WHAT) → References.
- **Quality rubric:** [`quality-rubric.md`](quality-rubric.md) — six-dimension source-page scoring instrument (D1 Five Cs / D2 IMRaD / D3 Distinctive artifacts / D4 Critical reading / D5 Pass-3 markers / D6 Appendix coverage). Invoked at §2.5b before catalogue updates. Mechanical floor + LLM-as-judge overlay both computed by [`scripts/quality-source-page.mjs`](../../../scripts/quality-source-page.mjs) (`--judge` flag); scores live only in `logs/quality-source-pages.jsonl`, never in the source page itself.
- **Schema contract:** [`CLAUDE.md`](../../../CLAUDE.md) — §Ingest, §Verifying sources before ingest, §Lifecycle, §Author-entity promotion, §Dynamic-capabilities tagging.
- **Neighbour-scan:** [`neighbour-source-scan`](../neighbour-source-scan/SKILL.md) — invoked in step 2.6.
- **Sibling acquire-time skill (videos):** [`youtube-transcript-skill`](../youtube-transcript-skill/SKILL.md) — same Acquire/Process discipline applied to a different source kind. Refer to it when the schema for video sources needs to be cross-checked against paper conventions.
- **Literature survey workflow (Keshav §3):** when ingesting *several* papers in a thematic batch, use the three-step survey method — find 3–5 recent papers via Google Scholar / arXiv, do Pass 1 on each, follow shared citations + key authors, then proceed paper-by-paper through this skill.
