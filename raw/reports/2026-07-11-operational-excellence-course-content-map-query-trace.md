---
type: query-trace
question: "I am building a course on operational excellence. Can you crawl the ai wiki and make a list of topics/concepts/business cases that will be valuable to the course?"
date: 2026-07-11
language: en
trace: "2026-07-11-operational-excellence-course-content-map-query-trace.json"
pages_used: 19
pages_ignored: 19
---

# Query trace — Wiki content map for the Operational Excellence course

## 1. Question

- **Original:** "I am building a course on operational excellence. Here is the Learner Requirement Document: https://businessdatasolutions.github.io/operational-excellence-course/design-documents/lrd-operational-excellence.html . Can you crawl the ai wiki and make a list of topics/concepts/business cases that will be valuable to the course?"
- **Restated:** Which wiki pages (concepts, sources/business cases, syntheses) supply valuable content for a HAN Operational Excellence course structured around the Direct/Design/Deliver/Develop operations cycle, with a mandatory Lean 4.0 / Industry 5.0 critical lens and a DMAIC capstone?
- **Facets:**
  1. Direct-phase strategy and digital-transformation framing (operations strategy, dynamic capabilities)
  2. Design/Deliver-phase process, technology and Lean content (Industry 4.0/5.0, Lean 4.0, industrial AI)
  3. Develop-phase improvement, quality and change-management content (systems thinking/TQM/Six Sigma/BPR, resistance-as-data, org design)
  4. Cross-cutting business cases and the DMAIC/critical-lens capstone material

The LRD itself was fetched (WebFetch) to establish this structure: a 15-week, four-phase course (Direct → Design → Deliver → Develop, per Slack/Brandon-Jones/Johnston's operations-management textbook), a mandatory Lean 4.0 / Industry 5.0 "critical lens" paragraph at every checkpoint, a DMAIC (Define-Measure-Analyze-Improve-Control) capstone in week 15, and case work drawn from a 130+ case book library (IKEA, Toyota, Ryanair, Michelin, Amazon, Pret a Manger).

## 2. Paths explored

**qmd hits (relevance stream)** — `node scripts/wiki-retrieve.mjs --json -n 12 "operational excellence course: Lean 4.0, Industry 5.0, dynamic capabilities digital transformation, AI-driven process improvement, DMAIC continuous improvement, systems thinking quality management, business cases and change management"`

| # | Page | type | qmd rank | fused | verdict |
|---|------|------|----------|-------|---------|
| 1 | `wiki/sources/2026-04-28-gomaa-lean-4-0.md` | source | 1 | 0.940 | USE |
| 2 | `wiki/concepts/lean-4-0.md` | concept | 2 | 0.712 | USE (decayed, unique) |
| 3 | `wiki/concepts/dynamic-capabilities.md` | concept | 3 | 0.941 | USE |
| 4 | `wiki/concepts/micro-productivity-trap.md` | concept | 4 | 0.896 | USE |
| 5 | `wiki/concepts/industry-4-0.md` | concept | 5 | 0.703 | USE |
| 6 | `wiki/sources/2026-02-01-manditereza-ontology-driven-industrial-ai.md` | source | 6 | 0.869 | USE |
| 7 | `wiki/sources/2026-03-31-carrier-mit-industrial-ai-that-works-strategy-survival-success.md` | source | 7 | 0.856 | USE |
| 8 | `wiki/sources/2026-06-07-calms-framework-atlassian.md` | source | 8 | 0.843 | IGNORE |
| 9 | `wiki/sources/2026-05-10-ries-lennys-force-destroys-companies-within.md` | source | 9 | 0.831 | IGNORE |
| 10 | `wiki/sources/2026-04-28-werner-lebrun-octopus-organization.md` | source | 10 | 0.819 | USE |

**graph neighbours** (`--hops 1`, typed-edge stream)

| Page | reached via | fused | verdict |
|------|-------------|-------|---------|
| `wiki/concepts/enterprise-ai-adoption.md` | supports:dynamic-capabilities / caused:micro-productivity-trap | 0.486 | USE |
| `wiki/concepts/strategy.md` | supports:dynamic-capabilities | 0.429 | USE |
| `wiki/concepts/automation-vs-augmentation.md` | contradicts:micro-productivity-trap | 0.429 | USE |
| `wiki/concepts/warner-wager-process-model.md` | instance-of:dynamic-capabilities | 0.413 | USE |
| `wiki/syntheses/organizational-frameworks-for-ai-adoption.md` | supports:micro-productivity-trap | 0.387 | USE |
| `wiki/sources/2026-05-15-sterman-systems-thinking-for-leaders-designing-solutions-that-work.md` | supports:carrier source | 0.358 | USE |
| `wiki/sources/2025-05-06-jassy-amazon-agility-ai-strategy-changing-role-of-managers.md` | supports:micro-productivity-trap | 0.410 | IGNORE |
| `wiki/sources/2026-04-14-thompson-the-daily-workers-letting-ai-do-their-jobs.md` | supports:micro-productivity-trap | 0.404 | IGNORE |
| `wiki/entities/DBS-Bank.md` | instance-of:dynamic-capabilities | 0.401 | IGNORE |
| `wiki/sources/2026-04-24-hu-yc-how-to-build-a-company-with-ai-from-the-ground-up.md` | supports:micro-productivity-trap | 0.398 | IGNORE |
| `wiki/concepts/strategic-centering.md` | supports:dynamic-capabilities | 0.393 | IGNORE |
| `wiki/sources/2026-05-06-bockeler-engineering-of-ai-agents-context-harnessing-autonomy.md` | supports:micro-productivity-trap | 0.393 | IGNORE |
| `wiki/sources/2026-05-07-singhal-stanford-cs153-product-management-in-ai-era.md` | supports:micro-productivity-trap | 0.387 | IGNORE |
| `wiki/concepts/strategic-foresight.md` | part-of:dynamic-capabilities | 0.379 | IGNORE |
| `wiki/concepts/ai-agents.md` | uses:industry-4-0 | 0.366 | IGNORE |
| `wiki/concepts/infinite-game.md` | supports:dynamic-capabilities | 0.365 | IGNORE |
| `wiki/concepts/ai-knowledge-hiding.md` | supports:micro-productivity-trap | 0.364 | IGNORE |
| `wiki/sources/2022-06-29-martin-hbr-a-plan-is-not-a-strategy.md` | supports:carrier source | 0.363 | IGNORE |
| `wiki/sources/2026-05-11-ognibeni-ai-agents-cool-demos-vs-real-revenue-china.md` | supports:ries-lennys source | 0.350 | IGNORE |
| `wiki/entities/MIT-Sloan-Executive-Education.md` | published-by:carrier source | 0.349 | IGNORE |
| `wiki/sources/2026-02-11-shyamsundar-jain-organizational-strategies-collective-wisdom-nature.md` | supports:werner-lebrun | 0.345 | IGNORE |
| `wiki/entities/Lenny's-Podcast.md` | published-by:ries-lennys source | 0.331 | IGNORE |
| `wiki/concepts/industrial-ai-agents.md` | instance-of:carrier source | 0.299 | IGNORE |

**index.md gap-expansion** (Step 5 — one round, triggered by the Develop-phase / quality-management facet being underserved by the qmd ranking above)

| Page | why added |
|------|-----------|
| `wiki/concepts/systems-thinking.md` | Names TQM/Six Sigma/BPR directly; confirmed present via `grep` on `wiki/index.md` and file existence check |
| `wiki/sources/2026-04-28-bansal-birkinshaw-systems-thinking.md` | Systems-thinking's primary source; three-modes-of-innovation framework |
| `wiki/sources/2026-05-07-carucci-resistance-as-data.md` | Change-management/risk content for Develop-phase Ch18 |
| `wiki/sources/2026-05-24-erginbilgic-bloomberg-leaders-rolls-royce-turnaround-playbook.md` | Strong non-digital business case identified during earlier Explore-agent sweep, absent from the qmd ranking |
| `wiki/sources/2026-06-18-dumra-mit-smr-dbs-everyone-an-innovator.md` | Strongest single Design-phase process-redesign business case, absent from the qmd ranking |

`qmd_hit_count`: 10. `candidate_count`: 33 (+5 gap-expansion = 38 total triaged). `graph_available`: true, no `graph_warning`.

## 3. Ignore policy applied

Reason-classes that fired this run:

- **`off-facet`** — semantically adjacent (via qmd or graph) but addresses none of the four decomposed facets. Fired 10 times: CALMS/DevOps framework, startup-culture pieces, YC/product-management content, agent-engineering-harness essay, generic AI-agents definitional page, game-theory/culture framing, HR/knowledge-hiding, China-agents-revenue content, nature-inspired-strategy piece.
- **`redundant`** — covers the same claim as an already-selected, stronger page. Fired 5 times: individual sources already synthesized inside `micro-productivity-trap` (Jassy, Thompson), `concepts/strategy` already covering the plan-vs-strategy distinction (Martin HBR, strategic-centering), and `industrial-ai-agents` already synthesizing the Manditereza + Carrier sources it draws on.
- **`wrong-granularity`** — entity catalogue card where the facet needs the underlying claim/content. Fired 3 times: DBS-Bank entity (prefer the Dumra source directly), MIT-Sloan-Executive-Education entity, Lenny's-Podcast entity.
- **`below-threshold`** — low fused score, no facet needs the page. Fired once: `strategic-foresight` (foresight-specific, not core to the four course phases).
- **`decayed`** — deliberately *not* applied to `concepts/lean-4-0` despite `effective_confidence` of 0.31 at query time: per the ignore policy, a *unique* decayed page that no fresher candidate covers must be marked USE with staleness flagged rather than silently dropped. Lean 4.0 is the single most load-bearing page for this course (built from the exact paper the LRD cites), so it was kept and its staleness is noted in §5 and in the final answer.

## 4. Information ignored

| Page | reason-class | one-line reason |
|------|--------------|-----------------|
| `wiki/sources/2026-06-07-calms-framework-atlassian.md` | off-facet | DevOps/software-delivery culture framework, not an operations-management framework in the LRD's textbook-based scope |
| `wiki/sources/2026-05-10-ries-lennys-force-destroys-companies-within.md` | off-facet | Startup/product-culture organizational-entropy content |
| `wiki/sources/2025-05-06-jassy-amazon-agility-ai-strategy-changing-role-of-managers.md` | redundant | Already synthesized inside `concepts/micro-productivity-trap` |
| `wiki/sources/2026-04-14-thompson-the-daily-workers-letting-ai-do-their-jobs.md` | redundant | Already synthesized inside `concepts/micro-productivity-trap` |
| `wiki/entities/DBS-Bank.md` | wrong-granularity | Entity stub; the Dumra source page supplies the actual course-relevant content |
| `wiki/sources/2026-04-24-hu-yc-how-to-build-a-company-with-ai-from-the-ground-up.md` | off-facet | YC startup-building content, out of operations-management scope |
| `wiki/concepts/strategic-centering.md` | redundant | Redundant with `concepts/strategy` for the Direct-phase facet |
| `wiki/sources/2026-05-06-bockeler-engineering-of-ai-agents-context-harnessing-autonomy.md` | off-facet | Agent-engineering/harness practitioner essay, too narrowly technical |
| `wiki/sources/2026-05-07-singhal-stanford-cs153-product-management-in-ai-era.md` | off-facet | Product-management content, tangential to operations management |
| `wiki/concepts/strategic-foresight.md` | below-threshold | Foresight-specific, not core to the four course phases |
| `wiki/concepts/ai-agents.md` | off-facet | Generic AI-agents definitional page |
| `wiki/concepts/infinite-game.md` | off-facet | Game-theory/culture framing |
| `wiki/concepts/ai-knowledge-hiding.md` | off-facet | HR/psych knowledge-hiding behavior |
| `wiki/sources/2022-06-29-martin-hbr-a-plan-is-not-a-strategy.md` | redundant | Already covered by `concepts/strategy` |
| `wiki/sources/2026-05-11-ognibeni-ai-agents-cool-demos-vs-real-revenue-china.md` | off-facet | China AI-agents-revenue content |
| `wiki/entities/MIT-Sloan-Executive-Education.md` | wrong-granularity | Entity stub; prefer the source pages directly |
| `wiki/sources/2026-02-11-shyamsundar-jain-organizational-strategies-collective-wisdom-nature.md` | off-facet | Nature-inspired/biomimicry framing, too abstract for a structured course |
| `wiki/entities/Lenny's-Podcast.md` | wrong-granularity | Entity stub whose parent source was already ignored |
| `wiki/concepts/industrial-ai-agents.md` | redundant | Synthesizes the already-USE'd Manditereza and Carrier sources |

## 5. Information used

| Page | type | effConf | contribution |
|------|------|---------|--------------|
| `wiki/concepts/dynamic-capabilities.md` | concept | 0.93 | Direct-phase strategy/digital-transformation anchor |
| `wiki/sources/2026-04-28-gomaa-lean-4-0.md` | source | n/a (source) | Direct hit — same paper as the LRD's Lean 4.0 chapter/DMAIC capstone; 23x23 tool mapping, 9-step framework, DMAIC table |
| `wiki/concepts/micro-productivity-trap.md` | concept | 0.85 | Deliver-phase planning-and-control value-leakage diagnostic |
| `wiki/sources/2026-02-01-manditereza-ontology-driven-industrial-ai.md` | source | n/a | Design-phase process-technology substrate (ontology/data fabric) |
| `wiki/sources/2026-03-31-carrier-mit-industrial-ai-that-works-strategy-survival-success.md` | source | n/a | Heineken Mexico changeover business case (Deliver-phase capacity/OEE) |
| `wiki/concepts/lean-4-0.md` | concept | 0.31 (decayed, unique — kept per policy) | Direct hit on the LRD's own Lean 4.0 chapter |
| `wiki/concepts/industry-4-0.md` | concept | 0.37 | Design-phase process-technology framing |
| `wiki/concepts/strategy.md` | concept | 0.79 | Direct-phase strategy vocabulary (theory of winning, value stick) |
| `wiki/concepts/warner-wager-process-model.md` | concept | 0.73 | Role-based digital-transformation spine |
| `wiki/concepts/systems-thinking.md` | concept | n/a (not re-fetched post-bump) | Names TQM/Six Sigma/BPR directly (Develop-phase quality) |
| `wiki/sources/2026-04-28-bansal-birkinshaw-systems-thinking.md` | source | n/a | Three-modes-of-innovation (improvement-approach selection) |
| `wiki/sources/2026-05-15-sterman-systems-thinking-for-leaders-designing-solutions-that-work.md` | source | n/a | Causal mapping, management flight simulators (quality/improvement toolkit) |
| `wiki/sources/2026-05-07-carucci-resistance-as-data.md` | source | n/a | Change-management/risk framework |
| `wiki/concepts/enterprise-ai-adoption.md` | concept | 0.93 | Meta-lens for Industry 5.0 critical-lens discussion |
| `wiki/syntheses/organizational-frameworks-for-ai-adoption.md` | synthesis | 0.88 | Capstone/critical-lens anchor (11 frameworks compared) |
| `wiki/concepts/automation-vs-augmentation.md` | concept | 0.93 | Excellence-vs-conformance distinction (LRD competency 9) |
| `wiki/sources/2026-04-28-werner-lebrun-octopus-organization.md` | source | n/a | Org-design/change-management archetypes |
| `wiki/sources/2026-05-24-erginbilgic-bloomberg-leaders-rolls-royce-turnaround-playbook.md` | source | n/a | Rolls-Royce non-digital turnaround business case |
| `wiki/sources/2026-06-18-dumra-mit-smr-dbs-everyone-an-innovator.md` | source | n/a | DBS Bank process-redesign business case |

**Scope note on USE-set size**: this run kept 19 pages in USE, above the skill's usual 4–8-page guideline. The question is explicitly enumerative — "make a list of topics/concepts/business cases" spanning an entire 15-week, four-phase course — so a wider USE set is a deliberate, reasoned deviation rather than an untriaged dump; the IGNORE set is comparably sized (19 pages) and every exclusion carries a specific reason-class.

## 6. Answer-element map

| Anchor | Answer element (claim) | Wiki page(s) | Section / span used |
|--------|------------------------|--------------|---------------------|
| [W1] | Teece's sense/seize/transform dynamic-capabilities framework anchors the Direct phase | [[concepts/dynamic-capabilities|dynamic-capabilities]] | ## Working definition |
| [W2] | Gomaa (2025) is the literal paper the LRD cites for Lean 4.0 and DMAIC | [[2026-04-28-gomaa-lean-4-0|Gomaa 2025]] | ## Key claims > The 23×23 mapping |
| [W3] | Micro-productivity trap names planning/control value leakage | [[concepts/micro-productivity-trap|micro-productivity-trap]] | ## Working definition |
| [W4] | Ontology-driven data fabric is the Design-phase process-technology substrate | [[2026-02-01-manditereza-ontology-driven-industrial-ai|Manditereza 2026]] | ## TL;DR |
| [W5] | Heineken Mexico changeover case is a quantified Deliver-phase capacity/OEE case | [[2026-03-31-carrier-mit-industrial-ai-that-works-strategy-survival-success|Carrier 2026]] | ## Key claims > The Heineken case study |
| [W6] | Lean 4.0 concept is the wiki's most direct hit on the LRD's own Lean 4.0 chapter | [[concepts/lean-4-0|lean-4-0]] | ## The 23×23 Lean ↔ Industry 4.0 mapping |
| [W7] | Industry 4.0 supplies digital-twin/cyber-physical/robotics Design-phase framing | [[concepts/industry-4-0|industry-4-0]] | ## Working definition |
| [W8] | Strategy concept maps to the LRD's Direct-phase kernel questions | [[concepts/strategy|strategy]] | ## Working definitions (two complementary lenses) |
| [W9] | Warner & Wäger process model gives a role-based digital-transformation spine | [[concepts/warner-wager-process-model|warner-wager-process-model]] | ## Microfoundations vocabulary (closed) |
| [W10] | Systems thinking names TQM/Six Sigma/BPR via Sterman's policy-resistance argument | [[concepts/systems-thinking|systems-thinking]] | ## Key claims > Policy resistance is the universal failure mode |
| [W11] | Bansal & Birkinshaw's three modes of innovation support improvement-approach selection | [[2026-04-28-bansal-birkinshaw-systems-thinking|Bansal & Birkinshaw 2025]] | ## Key claims > The three modes of innovation |
| [W12] | Sterman's causal mapping and flight simulators are quality/improvement toolkit content | [[2026-05-15-sterman-systems-thinking-for-leaders-designing-solutions-that-work|Sterman 2026]] | ## Key claims > Management flight simulators |
| [W13] | Carucci's resistance-as-data is Develop-phase change-management/risk content | [[2026-05-07-carucci-resistance-as-data|Carucci 2026]] | ## Four signal categories |
| [W14] | Enterprise AI adoption synthesizes frameworks useful for the critical-lens discussion | [[concepts/enterprise-ai-adoption|enterprise-ai-adoption]] | ## Working definition |
| [W15] | The frameworks synthesis compares 11 frameworks and names disagreements | [[syntheses/organizational-frameworks-for-ai-adoption|organizational-frameworks-for-ai-adoption]] | ### The frameworks operate on different layers |
| [W16] | Automation-vs-augmentation distinguishes redesign from conformance | [[concepts/automation-vs-augmentation|automation-vs-augmentation]] | ## Working definition |
| [W17] | Werner-Le-Brun's Tin Man/Octopus archetypes are Develop-phase change-management content | [[2026-04-28-werner-lebrun-octopus-organization|Werner & Le-Brun 2025]] | ### What's different about Octopus Orgs |
| [W18] | Rolls-Royce's non-digital turnaround is a strong complementary business case | [[2026-05-24-erginbilgic-bloomberg-leaders-rolls-royce-turnaround-playbook|Erginbilgiç 2026]] | ## TL;DR |
| [W19] | DBS Bank's Managing Through Journeys is the strongest Design-phase process-redesign case | [[2026-06-18-dumra-mit-smr-dbs-everyone-an-innovator|Dumra / DBS 2026]] | ## TL;DR > 3. Managing Through Journeys |

## 7. Final answer

The LRD structures the course on Slack/Brandon-Jones/Johnston's four-phase operations cycle — **Direct → Design → Deliver → Develop** — over 15 weeks, with a mandatory Lean 4.0 / Industry 5.0 "critical lens" paragraph at every checkpoint and a DMAIC capstone in week 15. The wiki's content maps onto this structure unevenly but with one genuinely load-bearing hit: `lean-4-0` and its source are built from the *same Gomaa (2025) paper* the LRD cites by name.

### Direct — operations strategy and digital transformation

- **Dynamic capabilities** [W1] — Teece's sense/seize/transform framework, the academic root for "how does this organisation compete, what can operations contribute."
- **Strategy** [W8] — Martin's theory-of-winning and Oberholzer-Gee's value-stick lenses, directly usable for the LRD's Direct-phase kernel questions and its Southwest Airlines / Best Buy worked cases.
- **Warner & Wäger process model** [W9] — a role-based digital-transformation vocabulary (sensing/seizing/transforming) that can serve as the spine of the mandatory Industry 5.0 critical-lens paragraph across all four phases, not just Direct.
- **Business case: Rolls-Royce turnaround** [W18] — a non-digital strategy-repositioning case (burning-platform speech, granular strategy, strategy-as-participation) that complements the LRD's book-sourced cases (IKEA, Toyota, Ryanair) with a 2023–2026 industrial example independent of AI.

### Design — process, technology and people

- **Industry 4.0** [W7] — cyber-physical systems, digital twins, industrial-robotics adoption data; the "process technology" backbone for Ch7–8.
- **Ontology-driven industrial AI** [W4] — the data/technology substrate (semantic model, knowledge graph) underneath industrial process automation, useful for the Ch8 process-technology and Human-CPS material.
- **Business case: DBS Bank** [W19] — the strongest single process-redesign case in the corpus: Managing Through Journeys reorients an operating model horizontally around customer intent rather than functional silos, with a named 90% feedback-uplift outcome from a single script change — a clean worked example for the LRD's process-design (Ch6) and people (Ch9) chapters.

### Deliver — planning, supply chain, and Lean operations

- **Lean 4.0** [W6] and its source, **Gomaa (2025)** [W2] — the direct hit. The 23×23 Lean-tool ↔ Industry 4.0 technology mapping (Gemba Walk↔Digital Twin, Kanban↔Digital Kanban Boards, Poka-Yoke↔Sensor-Based Error Detection, etc.), the 9-step Lean 4.0 implementation framework, and — notably — Gomaa's own **DMAIC-for-Lean-4.0 table** (Define/Measure/Analyze/Improve/Control mapped to digital tools) are directly reusable for the LRD's Ch14-15 and its week-15 DMAIC capstone. Note: `lean-4-0` was read-aged (`accessed_at` 2026-04-28) at query time — now refreshed by this run's retrieval bump — but its content is unchanged and remains the single most load-bearing page for this course.
- **Heineken Mexico case** [W5] — a quantified Deliver-phase capacity/changeover case (6 hours → 15 minutes, +1M cases/month via a simple AI agent) usable alongside classical OEE/capacity material.
- **Micro-productivity trap** [W3] — names where AI-driven "improvement" leaks value in planning and control (offering lock-in / process lock-in), a useful cautionary counterpoint when the course covers Industry 4.0/5.0 technology adoption in Ch10-13.

### Develop — improvement, quality, and risk

- **Systems thinking** [W10] — the wiki's deepest classical-management-theory page, and the one place TQM, Six Sigma, and BPR are named directly (via Sterman's "policy resistance" argument: the tools work, but far more attempts fail than succeed). Strong anchor for Ch17 (quality management) and the course's critical-thinking framing.
- **Bansal & Birkinshaw's three modes of innovation** [W11] and **Sterman's causal mapping / management flight simulators** [W12] — concrete pedagogy and toolkit content for selecting and teaching improvement approaches (LRD competency 5).
- **Carucci's resistance-as-data** [W13] and **Werner-Le-Brun's Tin Man/Octopus archetypes** [W17] — change-management and risk content for Ch18 (risk/recovery), with a 12% transformation-success baseline worth citing as a sobering statistic.

### DMAIC capstone and the Industry 5.0 critical lens

- Gomaa's DMAIC table [W2] is directly reusable for the week-15 capstone, since it is the same author/paper the LRD names.
- The **organizational-frameworks-for-ai-adoption synthesis** [W15] and its parent concept **enterprise AI adoption** [W14] compare 11 competing frameworks and explicitly name where they disagree — good scaffolding for the mandatory "which classical concepts remain valid, strengthen, or become obsolete under Lean 4.0/Industry 5.0" critical-lens paragraph.
- **Automation vs. augmentation** [W16] gives students a sharp analytical lens for the course's ninth learning outcome — distinguishing genuine operational excellence (multi-objective, sustainable improvement) from mere conformance or automation-without-redesign.

### Gaps to source outside the wiki

The wiki is a strong *complement* on digital transformation, AI-driven process redesign, and Lean 4.0/Industry 5.0 framing, but it does **not** cover several topics the LRD's book (Slack, Brandon-Jones & Johnston) presumably handles independently: no dedicated Six Sigma/DMAIC primary methodology text, no ISO 9001/TQM source, no classic Lean/Toyota Production System primary text (Ohno/Womack), no BPM/BPMN methodology page, no Balanced Scorecard content, and no classical change-management theory (Kotter/Lewin) — the synthesis at [W15] explicitly flags this last gap as unresolved. These are worth sourcing from the course's own textbook rather than the wiki.

## 8. Trace artifact

Machine-readable provenance: [`2026-07-11-operational-excellence-course-content-map-query-trace.json`](2026-07-11-operational-excellence-course-content-map-query-trace.json)
