# Log

Reverse-chronological record of wiki operations — **newest entry at the top, oldest at the bottom**. New entries are *prepended* immediately under the `---` separator below. Strict prefix format so `grep "^## \[" wiki/log.md | head -10` returns the ten most recent. Format (indented to keep grep clean):

    ## [YYYY-MM-DD] <op> | <title>

Permitted operations: `ingest`, `acquire`, `query`, `lint`, `synthesize`, `refactor`, `bulk-refactor` (for any operation touching >10 wiki pages, with affected slug list and reversibility note). `acquire` is used for sessions that land raw files but defer processing to a later session; the umbrella `ingest` op covers the typical Acquire+Process-in-the-same-session case. See [`CLAUDE.md`](../CLAUDE.md) (§The four operations, §Current state) for details.

---

## [2026-07-12] ingest | Task 1 -- wiki-content-laag operationeel (19 boekconcepten, 5 bedrijfscases, 23 Lean-tool-referenties, 19 AI-Wiki-contentmap-pagina's, 4D-diagram, 4 week-landingspagina's)

* **Ingest (1.2)**: 19 boekconcept-pagina's (`wiki/concepts/ch01-*.md` .. `ch19-*.md`), `type: boek-concept`, elk met `stage`/hoofdstuktag per LRD Deel 8 en citaties naar Slack, Brandon-Jones & Burgess (2022) 10e editie.
* **Ingest (1.3)**: 5 bedrijfscase-pagina's (`wiki/sources/ikea.md`, `toyota.md`, `michelin.md`, `ryanair.md`, `amazon.md`), `type: bedrijfscase-bron` -- alle vijf zijn REAL content (geen stubs): IKEA (Ch2 hoofdcase, volledige case study) en Amazon (drie boxen: Ch13/15/16) zijn ook gevonden buiten de 77-pp preview-PDF via een gerichte, targeted read van de volledige epub (zie [[ikea]], [[toyota]], [[michelin]], [[ryanair]], [[amazon]] voor de precieze citaties en paginalocaties).
* **Ingest (1.4)**: 23 Lean-tool<->Industrie-4.0-referentiepagina's (`wiki/concepts/lean-i40-01-*.md` .. `lean-i40-23-*.md`), `type: concept`, tags `[lean-tool, industrie4.0]`, uit Gomaa (2025) Tabel VII -- Kaizen->ch15/develop en Kanban->ch16/develop bevestigd als anker; de overige 21 chapter-tags beargumenteerd per pagina (zie elke pagina's "Chapter-tag en redenering"-sectie). **Bekende beperking**: FR-14 noemt ook een "Lean 4.0-paradoxen"-pagina; die staat niet in de letterlijke buildplan-subtaak 1.4 en is dus niet gebouwd -- gerapporteerd als open punt, niet stilzwijgend weggelaten.
* **Ingest (1.5)**: 19 AI-Wiki-contentmap-pagina's (`wiki/concepts/ai-wiki/*.md`), `type: ai-wiki-contentmap`, per de fase-mapping in LRD Deel 8.1, geëxtraheerd uit de echte query-trace (nu ook geacquireerd als raw-bron: `raw/reports/2026-07-11-operational-excellence-course-content-map-query-trace.md`). Dit zijn pointer/contentmap-pagina's naar een aparte, niet-publieke AI-Wiki -- geen gefabriceerde kopie van die wiki's paginabodies.
* **Build (1.6)**: nieuwe Quartz-extensie `extensions/inject-stage-diagram.ts` (transformer, htmlPlugin-patroon van `inject-confidence-badge.ts`) rendert het 4D-"je-bent-hier"-cirkeldiagram op elke `type: week-landing`-pagina, met de huidige `stage` gemarkeerd; gestileerd in `quartz/styles/custom.scss`; geregistreerd in `quartz.config.ts`. 4 week-landingspagina's aangemaakt (`wiki/weeks/direct.md`, `design.md`, `deliver.md`, `develop.md`) als scaffolding.
* **Verify (1.7)**: `.github/workflows/deploy.yml` ongewijzigd bevestigd werkend (generieke `npx quartz build -d wiki` + GitHub Pages-deploy, geen repo-specifieke aannames). `quartz.config.ts`/`quartz.layout.ts` template-placeholders (`baseUrl`, `pageTitle`, footer-GitHub-link) gecorrigeerd naar `businessdatasolutions/oe-wiki` zodat de gedeployde site daadwerkelijk correct linkt.
* **Index/log**: `index.md` herbouwd met alle nieuwe pagina's per categorie; deze log-entry toegevoegd.

