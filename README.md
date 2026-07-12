# LLM Wiki Template

A starting point for a **persistent, LLM-maintained knowledge wiki** — a structured collection of interlinked markdown notes that an LLM agent builds and keeps current from the raw sources you curate. Copy this repository, point your agent at it, and start adding documents.

The pattern: knowledge is **compiled once and kept current**, not re-derived on every query. You own sourcing and direction; the agent owns the wiki — summarizing, cross-referencing, filing, and bookkeeping. The wiki is published as a browsable static site with [Quartz](https://quartz.jzhao.xyz/).

## What's in the box

- **`CLAUDE.md`** — the schema / operating contract the agent follows (ingest, query, lint, synthesize; lifecycle, retention, quality, search, graph, hooks).
- **`llm-wiki.md`** — the self-contained system blueprint: the idea, the architecture, and the full inventory of skills, scripts, and extensions.
- **`wiki/`** — your knowledge layer: `sources/`, `entities/`, `concepts/`, `threads/`, `syntheses/`, `artifacts/`, plus `index.md` and `log.md`. Ships empty, ready to fill.
- **`raw/`** — immutable source material, organized by type (`articles/`, `papers/`, `videos/`, `reports/`, `books/`, `images/`, …).
- **`.claude/`** — skills (paper ingestion, YouTube transcripts, Zotero acquire, traceable answers, …), the `/wq` query command, and hooks.
- **`scripts/`** — lint, quality-scoring, search, retention, and graph-export helpers.
- **`quartz/`, `extensions/`, `quartz.config.ts`, `quartz.layout.ts`** — the static-site generator and the custom plugins that teach it the wiki's schema.

## Get started

Requires Node ≥ 22.

1. Copy this repository and run `npm install`.
2. (Optional) Make it yours: set `name` in `package.json`, and `pageTitle` / `baseUrl` in `quartz.config.ts`; point the GitHub Pages remote at your repo.
3. Add a source — drop a file into the matching `raw/<type>/` folder, or give the agent a URL / PDF / YouTube link.
4. Ask the agent to ingest it. It reads `CLAUDE.md`, verifies the source, writes the wiki pages, and updates the index and log.

## Run

- `npm run serve` — build and serve the wiki locally with live reload.
- `npm run build` — build the static site into `public/`.
- `npm run check` — TypeScript type-check.

## Read more

Start with **`llm-wiki.md`** for the why and the full design, then **`CLAUDE.md`** for the day-to-day conventions. Browse the wiki in [Obsidian](https://obsidian.md/) alongside your agent for graph view and backlinks.
