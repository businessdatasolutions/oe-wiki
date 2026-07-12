---
rubric_version: '1.3'
changelog:
  - version: '1.3'
    date: 2026-05-25
    change: 'D3 (Distinctive artifacts) updated for the `wiki/artifacts/` slice. Level 3 is now satisfied when load-bearing artifacts are reproduced *either* inline in §Distinctive artifacts *or* by wikilink to a `type: artifact` / `type: concept` page. The wikilink path makes the source page a catalogue; the artifact page carries the verbatim reproduction. Mechanical floor scorer + LLM judge prompt updated to recognize artifact wikilinks.'
  - version: '1.2'
    date: 2026-05-25
    change: 'LLM-as-judge slice lands: judgment scores are produced by a fresh headless `claude -p` call on every run and live only in `logs/quality-source-pages.jsonl` — never in source-page bodies or frontmatter. Stripped the in-body Scoring form template. D4 floor regex accepts both "Limitations the authors acknowledge" and "Limitations acknowledged by authors" word orders.'
  - version: '1.1'
    date: 2026-05-25
    change: 'Added D6 (Appendix coverage); denominator widens to 15/18 for appendix-bearing sources.'
  - version: '1.0'
    date: 2026-05-25
    change: 'Initial release — D1–D5.'
---

# Source-page quality rubric

The canonical instrument for self-scoring a `wiki/sources/*.md` page after ingest. **Six dimensions** (D1–D5 always-on, D6 conditional on the source carrying an appendix), each scored **0–3**, normalised to a 0.0–1.0 final score. Anchored on [Keshav's three-pass method](HowtoReadPaper.pdf) and the [IMRaD body skeleton](Research-Paper-Structure.png.webp).

The canonical rubric version lives in this file's YAML frontmatter (`rubric_version:`). Tooling parses that field — never hardcoded — so a version bump here propagates automatically.

This rubric complements — does **not** replace — [`scripts/quality-score.mjs`](../../../scripts/quality-score.mjs), which scores `wiki/concepts/` and `wiki/syntheses/` on structural grounds. The two scopes are disjoint: that scorer measures *concept-page consolidation quality*; this rubric measures *source-page extraction fidelity*.

## When to use

1. **In-line (forward-looking)** — invoked at [`SKILL.md` §2.5b](SKILL.md) after writing a source page, before running the neighbour-source scan and catalogue updates. Run `node scripts/quality-source-page.mjs --judge --page <slug>` to compute floor + LLM-judgment overlay; the score lands in [`logs/quality-source-pages.jsonl`](../../../logs/quality-source-pages.jsonl). The page itself is never modified.
2. **Ad-hoc audit** — re-run `--judge` over an existing source page to refresh its score. Idempotent — every run starts from clean state because the page never carries prior scores.

Do NOT use this rubric for:
- Concept pages or synthesis pages — those have their own scorer.
- Entity pages — these are catalogue cards, not knowledge claims; no rubric fits.
- Thread pages — provisional by design; scoring would be premature.
- **Non-paper source kinds** — `wiki/sources/*.md` pages with `kind:` other than `paper` (reports, video transcripts, articles, images) drop out of scoring. The Keshav 3-pass + IMRaD anchors don't fit those carriers.

## LLM-as-judge

The rubric is the reference document the LLM judge reads on every run. The judge gets:

1. **The full rubric** (this file, frontmatter stripped) — including all six dimensions, anchors, and worked low-quality examples.
2. **The source page body** — with any pre-existing `## Quality review` H2 block stripped (legacy). The page is the *input* to scoring, never the output.
3. **The mechanical floor** — the lower bound from the structural-lint pass. The judge may score a dimension below the floor only when it provides an explicit `below_floor_reason` for that dim (per "never overridden silently" below). Such cases land in the log's `judgment_warnings` field.

The judge returns a JSON object with per-dimension scores 0–3 plus reasoning. Scores live exclusively in `logs/quality-source-pages.jsonl` and the HTML report (`logs/quality-report.html`) — they never write back into the wiki, so every re-judgment runs from clean state without anchoring on prior scores.

The judge is implemented in [`scripts/_lib/llm-judge.mjs`](../../../scripts/_lib/llm-judge.mjs) and invoked from [`scripts/quality-source-page.mjs`](../../../scripts/quality-source-page.mjs) when the `--judge` flag is passed. Invocation is `claude -p ... --output-format text` — headless Claude Code, inheriting the user's CLI auth.

## The five dimensions

### D1 — Pass-1 Five Cs coverage

**Maps to** Keshav §First Pass. At the end of Pass 1 the reader (and the wiki page) should answer the five Cs: *Category / Context / Correctness / Contributions / Clarity*.

| Score | Anchor |
|---:|---|
| **0** | TL;DR or Context section missing; category not identifiable from the page. |
| **1** | Category and Contributions named; Context / Correctness / Clarity absent or boilerplate. |
| **2** | All five Cs answered, each with at least a sentence. *(Default for any page following the skill's body skeleton)* |
| **3** | All five Cs answered substantively. **Context** names other wiki sources or specifically-cited theoretical bases (not just *"this is a paper about X"*). **Correctness** states whether assumptions hold and where they bend. **Clarity** notes specific writing strengths or weaknesses (not generic praise). |

### D2 — IMRaD body skeleton

**Maps to** the [IMRaD anatomy image](Research-Paper-Structure.png.webp): WHY (Intro) / HOW (Methods) / WHAT (Results) / SO WHAT (Discussion).

| Score | Anchor |
|---:|---|
| **0** | No discernible IMRaD structure on the page. |
| **1** | Skeleton present but ≥1 section < 100 words (placeholder-level depth). |
| **2** | All four sections present with substantive content (≥100 words each). |
| **3** | All four sections substantive **and** the "What" section cites specific results — effect sizes, sample sizes, statistical significance, *specific table/figure numbers* from the source. *"Profitability ratios discriminate best (Powell et al. 2024, Table 3 coefficients 0.42–0.61)"* is D2=3; *"profitability ratios discriminate best"* is D2=2. |

### D3 — Distinctive-artifact fidelity ★

**Maps to** Keshav §Second Pass figure-criticism + IMRaD's *"often shown in tables and figures"*. This is the dimension that catches the most common shallow-ingest failure: extracting what a paper *says* while missing what it *shows*.

A **distinctive artifact** is any element the paper introduces or that carries its argument — *not every* figure or table. The criterion: would a reader who skips this artifact miss something the paper is known for? Named scores, headline result tables, taxonomy tables, cause-effect diagrams, named equations, and conceptual frameworks all qualify. Correlation heatmaps, descriptive-statistics tables, and reference lists typically do not.

| Score | Anchor |
|---:|---|
| **0** | No mention of any figure, table, equation, or named diagram from the paper. *(See Bari (2026) anchor below.)* |
| **1** | Some figures/tables mentioned by number but **not described** — gestured at, not reproduced. *(See Hajek (2024) and Powell (2024) anchors below.)* |
| **2** | All paper-named distinctive artifacts (named scores, key tables, headline figures, named equations, taxonomies) are listed in the body; at least one is described in enough detail that a reader could reconstruct its key content without opening the PDF. |
| **3** | All distinctive artifacts named **and verbatim-reproduced**, *either* inline in `## Distinctive artifacts` *or* by wikilink to a `type: artifact` / `type: concept` page where the verbatim reproduction lives. Taxonomies enumerated as lists/tables; named-equation formulae transcribed (e.g. `Z = 1.2X₁ + 1.4X₂ + ...`); cause-effect diagrams reproduced as a Mermaid block or interpreted as an ordered narrative; named scores given their explicit formula. The reader can find every load-bearing row, coefficient, and category in the wiki — they never need to open the PDF for the data. |

**Structural home**: v0.7 introduces `wiki/artifacts/<slug>.md` as the default reproduction target for paper-tied tables, named instruments, regression outputs, and per-segment breakdowns. The source page's `## Distinctive artifacts` section becomes a **catalogue** of those artifacts (catalogue entry = type + location + wikilink to the artifact page + 1-sentence summary). Reusable catalogues — variable dictionaries shared across the cluster, named instruments other studies cite — stay in `wiki/concepts/` per the v0.5 precedent. Inline reproduction remains the right choice for tiny tables (<8 rows) and short equations. See [CLAUDE.md §Artifacts](../../../CLAUDE.md#artifacts) for the concept/artifact split and the artifact frontmatter contract.

**What the LLM judge looks for at D3 = 3**: in the source page, every load-bearing artifact appears as a catalogue entry with a wikilink to its reproduction. Following any one wikilink reaches a page whose body carries the full row-by-row table / verbatim equation / numbered instrument items. Inline reproduction in the source page also satisfies D3 = 3 when the table is small enough that promotion would be over-engineering.

**Tie-breaking rule** — when artifact handling varies within a paper (e.g. headline taxonomy enumerated but supporting tables skipped), score by the paper's **most distinctive** artifact, not the average. Log the un-transcribed secondaries in the rubric notes.

### D4 — Critical reading

**Maps to** Keshav §Second Pass (*"summarise the main thrust… with supporting evidence"*) + the skill's `Limitations the authors acknowledge` / `Limitations not flagged` body convention + figure-quality critique (*"are axes labelled? error bars? sample sizes?"*).

| Score | Anchor |
|---:|---|
| **0** | No critical commentary; pure paraphrase. |
| **1** | Limitations the authors acknowledge are stated; nothing further. *(Beware: presence of a "not flagged" subsection alone does not lift to 2 — see the boilerplate trap below.)* |
| **2** | Author-acknowledged limitations **plus** at least one substantive *"limitations not flagged"* item that is concrete, paper-specific, and tied to a real methodological choice. |
| **3** | Both layers **plus** figure/table quality critique applying Keshav's tests (axes labelled, error bars, sample sizes, statistical significance, are the visualisation's conclusions justified by what's plotted). |

**The ceiling-by-default trap** — the skill's body convention forces both subsections to exist, so a careless ingest can hit D4 = 2 mechanically without actually reading critically. Score by **substance**:

- *"the sample could be larger"* → boilerplate, applies to any empirical paper → counts as D4 = 1, not 2.
- *"the management-change indicator is a binary signal whose construction details affect interpretability; the dependence on Croatian administrative-data infrastructure limits replication"* (Altman page) → concrete, traceable to specific methodological choices → genuine D4 = 2.

### D5 — Pass-3 markers *(conditional)*

**Maps to** Keshav §Third Pass: *"identify and challenge every assumption", "pinpoint implicit assumptions", "identify missing citations", "reconstruct the entire structure of the paper from memory"*.

**Applies only when** the page's `length:` frontmatter explicitly claims Pass 3 depth. For Pass 1 / Pass 2 pages, D5 is excluded and the total is normalised to /12. For Pass 3 pages, total normalises to /15.

| Score | Anchor |
|---:|---|
| **0** | Claims Pass 3 but body shows no Pass-3 markers. |
| **1** | One of the four Pass-3 outputs present (implicit assumptions named **OR** missing citations flagged **OR** strong/weak points identified **OR** technique issues critiqued). |
| **2** | At least two of the four Pass-3 outputs present. |
| **3** | All four Pass-3 outputs visible; the page is plausibly sufficient to reconstruct the work from memory without re-reading the source. |

### D6 — Appendix coverage *(conditional)*

**Maps to** [CLAUDE.md §Check 5 (Appendix inventory)](../../../CLAUDE.md#check-5--appendix-inventory-what-does-the-appendix-contain-and-how-should-it-be-reproduced) and [§Appendix content extraction](../../../CLAUDE.md#appendix-content-extraction). Scores how the source page handles appendix material — the layer that most often carries reusable artifacts (variable dictionaries, instruments, derivations, glossaries).

**Applies only when** the source carries appendix material. For sources with no appendix (short articles, video transcripts, blog posts, brief reports, image sources), D6 is **N/A** and excluded from the total's denominator. For sources with appendices, **the floor is 2** — silent omission (D6 = 0) or acknowledged-but-deferred (D6 = 1) is below the floor and the page should be revisited before commit.

| Score | Anchor |
|---:|---|
| **N/A** | Source has no appendix material. Excluded from total. |
| **0** | **Silent omission.** Source's body or §Methods references appendix / supplementary content that is clearly substantive (variable list, instrument, derivation, glossary, robustness tables) but the source page has no `## Appendix content` section, no mention in §Visual content, no caveat anywhere. Reader cannot tell whether the gap is deliberate or oversight. |
| **1** | **Acknowledged but deferred.** Source page acknowledges the appendix exists (e.g. in `length:` or *"What was actually ingested"* prose) but no structured `## Appendix content` section. Honest about the gap; doesn't address it. |
| **2** | **Section present + reproduced or deferred with reason.** Source page has `## Appendix content` listing every appendix with type, location, and content summary. Load-bearing content either (a) reproduced in `## Distinctive artifacts` as wiki-native artifacts, or (b) explicitly deferred with concrete reason. |
| **3** | **Promoted to reusable artifact.** Same as 2, plus at least one appendix promoted to a standalone wiki-native artifact (`wiki/concepts/<slug>.md` concept page / glossary / named instrument) that serves the corpus, not just this source page. The promotion is the move from *"this paper's appendix"* to *"the corpus's reference catalogue."* |

## Scoring math

```
appendix_applies = source carries appendix material (per CLAUDE.md §Check 5)

if depth in {Pass 1, Pass 2}:
    if appendix_applies:
        total = (D1 + D2 + D3 + D4 + D6) / 15
    else:
        total = (D1 + D2 + D3 + D4) / 12

if depth == Pass 3:
    if appendix_applies:
        total = (D1 + D2 + D3 + D4 + D5 + D6) / 18
    else:
        total = (D1 + D2 + D3 + D4 + D5) / 15
```

**Thresholds** (mirror the existing concept scorer's bands):

| Total | Band | Action |
|---:|---|---|
| **≥ 0.85** | At ceiling | Catalogue update can proceed. |
| **0.65 – 0.85** | Workable | Specific dimensions flagged; address opportunistically. |
| **< 0.65** | Below floor | Revisit before commit. Most likely cause: D3 (artifacts), D4 (critical reading), or D6 (appendix coverage). |

## Soft-floor rule (never overridden silently)

When the LLM judge produces a `Score < Floor` for any dimension, the judge must include an explicit `below_floor_reason` string in its JSON response for that dimension. The validator in [`scripts/_lib/llm-judge.mjs`](../../../scripts/_lib/llm-judge.mjs) rejects below-floor scores that lack a reason — protecting against the LLM hallucinating absence of structure that the floor scorer detected.

Legitimate downgrades exist (e.g. the page has a `## Distinctive artifacts` H2 section that's actually empty boilerplate — floor mechanically scores D3 = 2, but judgment legitimately scores D3 = 1). Those land in the log's `judgment_warnings:` field rather than being silently accepted or hard-rejected.

## Calibration: worked low-quality anchors

These anchors are drawn from the first ingest batch (2026-05-25). They give pattern-match examples for the 0/1 levels. Excellence anchors (2/3 levels with concrete examples) will be added once the corpus contains pages that demonstrate them.

### D3 — Distinctive-artifact fidelity (low-quality anchors)

**Score 0 anchor — Bari (2026)** — [`wiki/sources/2026-02-04-bari-2026-us-small-business-distress-framework.md`](../../../wiki/sources/2026-02-04-bari-2026-us-small-business-distress-framework.md)

> The paper contains **Figure 3 "Process of Financial Distress Evolution"** — a cause-effect flow diagram:
>
> Declining Income / Increasing Debt / Eroding Liquidity / Operating Losses / Cash-Flow Volatility → **FINANCIAL DISTRESS** → Short-Term Borrowing / Asset Liquidation → **FAILURE**, moderated by Industry Conditions / Management Challenges / External Shocks.
>
> Also Figure 12 "Integrated Predictors of Financial Distress". **Neither figure is named or interpreted on the wiki page.** The Discussion section paraphrases the diagram's contents in prose (*"liquidity strain → distress → asset liquidation chain"*) but never tells the reader the paper *shows* this as a flowchart. **D3 = 0** — the paper's distinctive visual argument is invisible on the wiki page.

**Score 1 anchor — Hajek & Munk (2024)** — [`wiki/sources/2024-06-22-hajek-2024-distress-prediction-annual-reports.md`](../../../wiki/sources/2024-06-22-hajek-2024-distress-prediction-annual-reports.md)

> The paper contains **Table 4 "Topics identified using BERTopic"** — a 26-row taxonomy of risk categories with top-5 terms each: Intellectual property, R&D, Security, Tax, Litigation, Currency, Insurance, Competitive, Product, Dividend, Compliance, Regulatory, Personnel, Workforce, Health, Liquidity, Overseas business, Failure management, Commercial lending, Material, Price, Data privacy, Timing, Intangible asset, IT, Credit risk.
>
> The wiki page writes *"Risk-factor disclosures (Item 1A) carry predictive signal beyond what conventional financial ratios contain — the linguistic dimension is additive, not redundant"* and names the BERT topic-modelling pipeline in Methods — but **never enumerates a single risk category** from Table 4. The artifact is gestured at; its content is not reproduced. **D3 = 1** — the table that arguably carries the paper's most reusable contribution is mentioned by existence only.

**Score 1 anchor (the "I skimmed the tables" variant) — Powell et al. (2024)** — [`wiki/sources/2024-01-01-powell-2024-asean-accounting-early-warning-distress.md`](../../../wiki/sources/2024-01-01-powell-2024-asean-accounting-early-warning-distress.md)

> The wiki page's *"What was actually ingested"* section literally says: *"Per-country MDA-coefficient breakdown tables (Tables 3–5)… were skimmed for headline patterns rather than read row-by-row."* The headline finding (*"profitability ratios are the best distress predictors, followed by liquidity and leverage"*) is stated, but the per-country coefficient weights — the paper's distinctive empirical contribution to the ASEAN literature — are not transcribed anywhere on the page. **D3 = 1** — naming tables by number without reproducing their content is the canonical Pass-2 failure Keshav warns against (*"Common mistakes like these will separate rushed, shoddy work from the truly excellent"*).

**Score 1↔2 boundary anchor — Habib et al. (2020)** — [`wiki/sources/2020-01-01-habib-2020-distress-determinants-consequences-review.md`](../../../wiki/sources/2020-01-01-habib-2020-distress-determinants-consequences-review.md)

> The 3-bucket × 4-bucket determinants × consequences taxonomy *is* enumerated cleanly on the wiki page (D3 = 2 quality). **However**, Table 1 (distress calculation measures with counts of surveyed papers per measure) and Table 3 (consequences-of-distress with author/sample/finding/economic-significance rows) are not transcribed. The page is split: the headline taxonomy is at D3 = 2, but the supporting tables are at D3 = 1. **Per the tie-breaking rule**, score by the paper's most distinctive artifact — for Habib the taxonomy IS the contribution, so **D3 = 2** — but flag the un-transcribed supporting tables in the rubric notes.

### D4 — Critical reading (low-quality anchors)

**The ceiling-by-default trap** — all 6 ingested pages have "Limitations the authors acknowledge" + "Limitations not flagged" subsections because the skill structure required it. Mechanically they all score D4 = 2. The risk: **boilerplate "not flagged" items** that add no real critique.

- *Genuine critical reading → D4 = 2* — Hajek page: *"single-language (English) limits generalisability to non-English filings"* — concrete, paper-specific, traceable to a methodological choice.
- *Boilerplate masquerading → D4 = 1 despite the subsection existing* — *"the sample could be larger"* / *"more recent data would strengthen the analysis"* applies to any empirical paper and reveals no real engagement. Score by substance, not by section presence.

**Score 2 anchor (substantive, not ceiling) — Altman et al. (2023)** — [`wiki/sources/2022-11-28-altman-2023-omega-score-sme-default.md`](../../../wiki/sources/2022-11-28-altman-2023-omega-score-sme-default.md)

> Wiki page flags as "not flagged": *"the management-change indicator is a binary signal whose construction details affect interpretability; the dependence on Croatian administrative-data infrastructure (FINA accounts, government payment data) limits replication in jurisdictions without comparable data layers."* Both are concrete, paper-specific, and tied to real methodological choices the authors made. **D4 = 2** legitimately.

### D6 — Appendix coverage (anchors)

**Score 1 anchor — Altman et al. (2023), pre-backfill state** — [`wiki/sources/2022-11-28-altman-2023-omega-score-sme-default.md`](../../../wiki/sources/2022-11-28-altman-2023-omega-score-sme-default.md) as of the 2026-05-25 batch ingest.

> The paper contains a **6-page appendix (journal pp. 2411–2416)** cataloguing **164 predictor variables across 18 categories** (Altman Z-Score variables / Business development / Profitability / Interest rate risk / Liquidity / Financial leverage / Δ balance-sheet / Size / Age / Industry / Region / Year / Internationalization / Innovation / Relational capital / Payment behavior / Employee-related / Management-related). The source page acknowledges on line 74: *"Supplementary Material was referenced but not opened; **the appendix variable list was not transcribed**."* No `## Appendix content` section exists. **D6 = 1** — honest about the gap but doesn't address it. The 164-variable catalogue — exactly the kind of reusable artifact other corpus papers should be able to cite — remains locked in the PDF. This anchor was the trigger for the v0.5+ D6 dimension.

**Score 2 anchor — Hajek & Munk (2024)** — [`wiki/sources/2024-06-22-hajek-2024-distress-prediction-annual-reports.md`](../../../wiki/sources/2024-06-22-hajek-2024-distress-prediction-annual-reports.md)

> The paper contains an appendix with **Figure A.1 (correlation heatmap, p. 18)** and **Table A.1 (hyperparameter grid, p. 19)**. The wiki page's `length:` field names them as read; both are described in `## Visual content` with location and headline observations; neither is treated as load-bearing enough for `## Distinctive artifacts` reproduction or concept-page promotion. **D6 = 2** — the section's intent is satisfied via §Visual content + an explicit "incidental" routing decision, even though the page does not carry a separate `## Appendix content` heading. *(Backfill opportunity: when the page is re-opened, split the appendix entries out of §Visual content into a proper §Appendix content section.)*

**Score 3 anchor — Altman et al. (2023), post-backfill state** — same page as the Score 1 anchor above, after the 2026-05-25 appendix-schema refactor.

> The 164-variable catalogue is reproduced as a standalone concept page [[sme-distress-predictor-variables]]; the source page's `## Appendix content` section names the appendix (type=variable-definitions, location=pp. 2411–2416, reproduction=`[[sme-distress-predictor-variables]]`) with a 160-word content summary; `## Distinctive artifacts` cross-references the concept page and reproduces the 18-category summary table inline. The promoted concept page is cited by [[financial-distress]], [[altman-z-score]], [[payment-behavior-variables]], [[sme-default-prediction]], and [[omega-score]]. **D6 = 3** — the appendix went from locked-in-PDF to corpus-wide reference catalogue. This is the canonical promotion pattern.

**Tie-breaking note.** A page that has §Appendix content but the section is empty boilerplate (`### Appendix A` with no Type / Location / Reproduction / content summary) scores D6 = 1, not 2 — the floor requires *substantive* coverage, not headers. A page whose §Appendix content correctly defers everything ("entirely formal back matter: author bios, funding, IRB; not substantive") still scores D6 = 2 — explicit deferral with reason is what the floor demands.

### D1 (Five Cs) and D2 (IMRaD) — corpus-wide observations

- **D1 floor across all 6 first-batch pages ≈ 2** (Adequate). The 5 Cs are mostly present in the TL;DR + Context prose but rarely broken out as explicit answers. Future low-quality anchor: a page where Context is generic (*"this is a paper about distress prediction"*) rather than specific (*"this paper sits in the Beaver→Altman→Merton lineage and is adjacent to [[…]]"*).
- **D2 floor across all 6 first-batch pages ≈ 2–3** (Adequate–Excellent). All 6 follow the IMRaD body skeleton the skill mandates. The "What" section quality varies — Altman page reproduces the full AUC comparison table (D2 = 3); Bari page describes the regression but omits specific coefficient tables (D2 = 2).

### D5 — empirical anchors deferred

The first-batch corpus contains **zero Pass-3 pages**: Luppe and Bari are Pass 1 / Pass 1+; Hajek, Habib, Powell, Altman are Pass 2. D5 has **no anchors in the current corpus**. They will be added to this rubric the first time a paper is genuinely ingested at Pass 3 depth.

### Excellence anchors — deferred

To be added once the corpus contains source pages that demonstrate D3 = 3 or D4 = 3 quality. Expected path: a future re-ingest of Hajek (enumerating Table 4 in a `## Distinctive artifacts` subsection) and Bari (transcribing Figure 3 as a Mermaid diagram or interpreted ordered narrative) will produce the first D3 = 3 anchors.

## Reference appendix

- **[`HowtoReadPaper.pdf`](HowtoReadPaper.pdf)** — S. Keshav, *How to Read a Paper*, ACM SIGCOMM CCR 2007. The level anchors quote Keshav directly: the five Cs (D1), the figure-criticism criteria *"axes properly labeled, error bars, statistically significant"* (D3 / D4), the four Pass-3 outputs (D5).
- **[`Research-Paper-Structure.png.webp`](Research-Paper-Structure.png.webp)** — IMRaD anatomy diagram. D2 anchors derive from its WHY / HOW / WHAT / SO WHAT prompts. The diagram's note that Results are *"often shown in tables and figures"* is the structural basis for D3 existing as a separate dimension.
- **[`SKILL.md`](SKILL.md)** — the parent skill that calls this rubric in §2.5b.
- **[`../../../scripts/quality-source-page.mjs`](../../../scripts/quality-source-page.mjs)** — the mechanical floor scorer + LLM-as-judge driver. Computes the structural lower bound and (with `--judge`) invokes headless Claude Code for the substantive overlay. Scores land in `logs/quality-source-pages.jsonl` — never in source-page frontmatter or body.
- **[`../../../scripts/_lib/llm-judge.mjs`](../../../scripts/_lib/llm-judge.mjs)** — encapsulates the `claude -p` invocation, prompt assembly, JSON-response validation, and the soft-floor enforcement (below-floor scores require an explicit reason).
- **[`../../../scripts/quality-score.mjs`](../../../scripts/quality-score.mjs)** — the existing concept/synthesis scorer (disjoint scope; the two scorers do not overlap).
