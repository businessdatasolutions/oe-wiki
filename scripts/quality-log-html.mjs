#!/usr/bin/env node
// v0.6 quality slice — static HTML report generator for the source-page eval log.
//
// Reads logs/quality-source-pages.jsonl and writes a self-contained HTML
// file (data embedded inline; no external libs; opens via file:// in any
// browser) to logs/quality-report.html.
//
// Security: all dynamic data is rendered via textContent / createElement in
// the client; the only HTML-string concatenation is for the static page
// chrome (headers, table skeleton). Inline JSON has </ escaped to <\/ to
// prevent script-context breakage.
//
// Usage:
//   node scripts/quality-log-html.mjs                    # default output path
//   node scripts/quality-log-html.mjs --out <path>       # custom output
//   node scripts/quality-log-html.mjs --open             # also open in default browser

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const LOG_FILE = join(REPO_ROOT, 'logs', 'quality-source-pages.jsonl');

// Report label — derived from package.json "name" (template-friendly; no
// hardcoded wiki name). WIKI_NAME env var overrides.
const WIKI_NAME =
  process.env.WIKI_NAME ||
  (() => {
    try {
      return JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).name || 'wiki';
    } catch {
      return 'wiki';
    }
  })();

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}
function has(flag) {
  return process.argv.includes(flag);
}

const OUT = arg('--out') || join(REPO_ROOT, 'logs', 'quality-report.html');
const OPEN = has('--open');

if (!existsSync(LOG_FILE)) {
  console.error(`No log at ${LOG_FILE.slice(REPO_ROOT.length + 1)}. Run quality-source-page.mjs first.`);
  process.exit(2);
}

const entries = readFileSync(LOG_FILE, 'utf8')
  .split(/\r?\n/)
  .filter((l) => l.trim().length > 0)
  .map((l, i) => {
    try {
      return JSON.parse(l);
    } catch {
      console.warn(`[warn] line ${i + 1} not valid JSON, skipping`);
      return null;
    }
  })
  .filter(Boolean);

if (entries.length === 0) {
  console.error('Log is empty.');
  process.exit(2);
}

entries.sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));

const lastUpdated = entries[entries.length - 1].ts || '';
const rubricVersion = entries[entries.length - 1].rubric_version || '?';
const distinctSlugs = new Set(entries.map((e) => e.slug));

// Data-driven dimension list: union of all `scores` keys across the log,
// sorted by the trailing integer. So when v1.2 adds D7, no script edits.
const dimSet = new Set();
for (const e of entries) {
  if (e.scores && typeof e.scores === 'object') {
    for (const k of Object.keys(e.scores)) dimSet.add(k);
  }
}
const DIMENSIONS = [...dimSet].sort((a, b) => {
  const an = parseInt(a.replace(/\D/g, ''), 10) || 0;
  const bn = parseInt(b.replace(/\D/g, ''), 10) || 0;
  return an - bn;
});

const latestPerPage = new Map();
for (const e of entries) {
  const cur = latestPerPage.get(e.slug);
  if (!cur || (e.ts || '') > (cur.ts || '')) latestPerPage.set(e.slug, e);
}
const dist = { ceiling: 0, workable: 0, belowFloor: 0 };
for (const e of latestPerPage.values()) {
  if (e.band === 'ceiling') dist.ceiling++;
  else if (e.band === 'workable') dist.workable++;
  else dist.belowFloor++;
}

// Escape for safe inclusion inside <script> tag (only sequence that breaks
// a script context is </ which closes the tag).
function jsonForScript(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

// HTML-escape for use inside server-side template literals where the value
// might (in principle) contain markup. The numeric/identifier fields below
// are safe by construction but escaping is cheap and defensive.
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Quality eval report — ${WIKI_NAME}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root {
    --bg: #fafafa;
    --fg: #1a1a1a;
    --muted: #666;
    --border: #ddd;
    --row-hover: #f0f0f0;
    --row-expanded: #eef4ff;
    --chip-bg: #f0f0f0;
    --ceiling: #2e7d32;
    --workable: #c97400;
    --below: #b22222;
    --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1a1a1a;
      --fg: #e6e6e6;
      --muted: #999;
      --border: #333;
      --row-hover: #262626;
      --row-expanded: #1e2738;
      --chip-bg: #2a2a2a;
      --ceiling: #6cc36c;
      --workable: #e0a443;
      --below: #e57373;
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--fg); font-family: var(--sans); }
  main { max-width: 1200px; margin: 0 auto; padding: 2rem 1.5rem; }
  h1 { margin: 0 0 .25rem; font-size: 1.4rem; font-weight: 600; }
  h2 { margin: 2rem 0 .75rem; font-size: 1.1rem; font-weight: 600; padding-bottom: .25rem; border-bottom: 1px solid var(--border); }
  .meta { color: var(--muted); font-size: .85rem; margin: 0 0 1rem; }
  .meta code { font-family: var(--mono); background: var(--chip-bg); padding: 1px 5px; border-radius: 3px; font-size: .8rem; }
  .chips { display: flex; gap: .5rem; flex-wrap: wrap; margin: .5rem 0 1.5rem; }
  .chip { display: inline-flex; align-items: center; gap: .35rem; padding: .25rem .65rem; border-radius: 999px; background: var(--chip-bg); font-size: .85rem; font-family: var(--mono); }
  .chip .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .chip.ceiling .dot { background: var(--ceiling); }
  .chip.workable .dot { background: var(--workable); }
  .chip.below .dot { background: var(--below); }
  .filter { width: 100%; max-width: 340px; padding: .45rem .6rem; border: 1px solid var(--border); background: var(--bg); color: var(--fg); border-radius: 4px; font-family: var(--mono); font-size: .85rem; margin-bottom: .75rem; }
  table { width: 100%; border-collapse: collapse; font-size: .85rem; }
  th, td { padding: .5rem .6rem; text-align: left; vertical-align: middle; border-bottom: 1px solid var(--border); }
  th { font-weight: 600; font-size: .75rem; text-transform: uppercase; letter-spacing: .03em; color: var(--muted); cursor: pointer; user-select: none; }
  th .arrow { color: var(--fg); margin-left: .2rem; opacity: .6; }
  td.mono, td.num, th.num { font-family: var(--mono); }
  td.num, th.num { text-align: right; }
  td.slug { font-family: var(--mono); font-size: .8rem; word-break: break-all; }
  tr.row { cursor: pointer; }
  tr.row:hover { background: var(--row-hover); }
  tr.row.expanded { background: var(--row-expanded); }
  tr.detail { display: none; background: var(--row-expanded); }
  tr.detail.show { display: table-row; }
  tr.detail > td { padding: .75rem 1rem 1.25rem; }
  .band-cell { white-space: nowrap; }
  .band-cell .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; vertical-align: middle; margin-right: .25rem; }
  .band-cell.ceiling .dot { background: var(--ceiling); }
  .band-cell.workable .dot { background: var(--workable); }
  .band-cell.below-floor .dot { background: var(--below); }
  .spark { display: block; }
  .detail .history { width: 100%; margin-top: .5rem; }
  .detail .history th, .detail .history td { font-size: .78rem; padding: .3rem .5rem; }
  .detail h3 { font-size: .9rem; margin: .25rem 0 .5rem; word-break: break-all; }
  .detail h4 { font-size: .8rem; margin: .85rem 0 .35rem; color: var(--muted); text-transform: uppercase; letter-spacing: .03em; }
  .detail .notes { list-style: none; padding: 0; margin: 0; font-family: var(--mono); font-size: .78rem; }
  .detail .notes li { padding: .15rem 0 .15rem .9rem; position: relative; }
  .detail .notes li::before { content: "—"; position: absolute; left: 0; color: var(--muted); }
  .detail .depth { font-family: var(--mono); font-size: .78rem; color: var(--muted); padding: .25rem .5rem; background: var(--bg); border: 1px solid var(--border); border-radius: 3px; display: inline-block; max-width: 100%; word-break: break-word; }
  .detail .spark-group { display: inline-block; margin-right: .75rem; font-family: var(--mono); font-size: .78rem; color: var(--muted); }
  .delta-up { color: var(--ceiling); }
  .delta-down { color: var(--below); }
  .delta-flat { color: var(--muted); }
  .kind-badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-family: var(--mono); font-size: .72rem; font-weight: 600; }
  .kind-badge.judged { background: var(--ceiling); color: white; }
  .kind-badge.floor { background: var(--chip-bg); color: var(--muted); }
  .detail .floor-row, .detail .judgment-row { font-family: var(--mono); font-size: .78rem; }
  .detail .floor-row td { color: var(--muted); }
  .detail .reasoning { font-size: .82rem; line-height: 1.45; margin: .35rem 0 0; }
  .detail .reasoning .dim { font-family: var(--mono); font-weight: 600; padding-right: .35rem; color: var(--fg); }
  .detail .reasoning li { padding: .25rem 0; border-bottom: 1px dashed var(--border); }
  .detail .judge-summary { font-style: italic; color: var(--muted); margin: .25rem 0 .5rem; line-height: 1.45; }
  .timeline { list-style: none; padding: 0; margin: 0; font-size: .82rem; font-family: var(--mono); }
  .timeline li { padding: .35rem 0; border-bottom: 1px solid var(--border); display: grid; grid-template-columns: 11rem 6.5rem 4.5rem 9rem 1fr; gap: .5rem; align-items: center; }
  .timeline .ts { color: var(--muted); font-size: .78rem; }
  .timeline .slug-cell { word-break: break-all; }
  footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--muted); font-size: .8rem; line-height: 1.5; }
  footer code { font-family: var(--mono); background: var(--chip-bg); padding: 1px 5px; border-radius: 3px; }
</style>
</head>
<body>
<main>
  <h1>Quality eval report — ${WIKI_NAME}</h1>
  <p class="meta">
    <strong>${esc(entries.length)}</strong> entries
    · <strong>${esc(distinctSlugs.size)}</strong> distinct page${distinctSlugs.size === 1 ? '' : 's'}
    · latest <code>${esc(lastUpdated || '—')}</code>
    · rubric <code>v${esc(rubricVersion)}</code>
  </p>

  <div class="chips">
    <span class="chip ceiling"><span class="dot"></span>${esc(dist.ceiling)} ceiling (≥0.85)</span>
    <span class="chip workable"><span class="dot"></span>${esc(dist.workable)} workable (0.65–0.85)</span>
    <span class="chip below"><span class="dot"></span>${esc(dist.belowFloor)} below floor (&lt;0.65)</span>
  </div>

  <h2>Pages (latest state per page)</h2>
  <p class="meta"><strong>J</strong> badge: latest entry includes an LLM-judgment overlay (scores/total reflect judgment). Pages without J show mechanical-floor scores only.</p>
  <input id="filter" class="filter" placeholder="Filter by slug…" autocomplete="off">
  <table id="pages-table">
    <thead>
      <tr>
        <th data-sort="band">band <span class="arrow">↕</span></th>
        <th>kind</th>
        <th data-sort="total" class="num">total <span class="arrow">↕</span></th>
        ${DIMENSIONS.map((d) => `<th data-sort="${esc(d)}" class="num">${esc(d)} <span class="arrow">↕</span></th>`).join('\n        ')}
        <th>D3 trend</th>
        <th data-sort="ts">latest <span class="arrow">↕</span></th>
        <th data-sort="slug">slug <span class="arrow">↕</span></th>
      </tr>
    </thead>
    <tbody id="pages-body"></tbody>
  </table>

  <h2>Recent activity (last 50 entries)</h2>
  <ul id="timeline" class="timeline"></ul>

  <footer>
    Generated by <code>scripts/quality-log-html.mjs</code> from <code>logs/quality-source-pages.jsonl</code> on <code>${esc(new Date().toISOString())}</code>.
    The log is append-only — re-run the generator to refresh this report. The CLI counterpart is <code>node scripts/quality-log-summary.mjs</code>.
    Rubric anchors live in <code>.claude/skills/scientific-papers-processing/quality-rubric.md</code>.
  </footer>
</main>

<script>
const ALL_ENTRIES = ${jsonForScript(entries)};
const DIMENSIONS = ${jsonForScript(DIMENSIONS)};
// Detail-row colspan: band + kind + total + N dimensions + trend + ts + slug
const DETAIL_COLSPAN = 6 + DIMENSIONS.length;
const JUDGED_KIND = "mechanical-floor + llm-judgment";

// ----- Tiny DOM helper -----
// el(tag) | el(tag, "text") | el(tag, {attrs}, ...children) where children
// are strings (treated as textContent) or Nodes.
function el(tag, second, ...rest) {
  const node = tag === "svg" || tag === "polyline"
    ? document.createElementNS("http://www.w3.org/2000/svg", tag)
    : document.createElement(tag);
  let children = rest;
  if (second && typeof second === "object" && !(second instanceof Node) && !Array.isArray(second)) {
    for (const [k, v] of Object.entries(second)) {
      if (k === "class") node.className = v;
      else if (k === "dataset") for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
      else if (k === "on") for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
      else if (k === "html") node.innerHTML = ""; // ignore — never set HTML from data
      else if (node.namespaceURI && node.namespaceURI.includes("svg")) node.setAttribute(k, v);
      else node.setAttribute(k, v);
    }
  } else if (second !== undefined) {
    children = [second, ...rest];
  }
  for (const c of children) {
    if (c === null || c === undefined) continue;
    if (c instanceof Node) node.appendChild(c);
    else node.appendChild(document.createTextNode(String(c)));
  }
  return node;
}
function text(s) { return document.createTextNode(String(s)); }

// ----- Data preparation -----
const latestMap = new Map();
const historyMap = new Map();
for (const e of ALL_ENTRIES) {
  if (!historyMap.has(e.slug)) historyMap.set(e.slug, []);
  historyMap.get(e.slug).push(e);
  const cur = latestMap.get(e.slug);
  if (!cur || (e.ts || "") > (cur.ts || "")) latestMap.set(e.slug, e);
}

const BAND_ORDER = { "below-floor": 0, "workable": 1, "ceiling": 2 };
function cmp(a, b, key) {
  if (key === "band") return (BAND_ORDER[a.band] ?? -1) - (BAND_ORDER[b.band] ?? -1);
  if (key === "total") return (a.total ?? 0) - (b.total ?? 0);
  if (key === "ts") return (a.ts || "").localeCompare(b.ts || "");
  if (key === "slug") return a.slug.localeCompare(b.slug);
  if (DIMENSIONS.includes(key)) {
    const av = a.scores?.[key]; const bv = b.scores?.[key];
    if (av === null || av === undefined) return -1;
    if (bv === null || bv === undefined) return 1;
    return av - bv;
  }
  return 0;
}

let sortKey = "total";
let sortDir = "asc";

function fmtTotal(t) { return typeof t === "number" ? t.toFixed(2) : "—"; }
function fmtScore(s) { return s === null || s === undefined ? "—" : String(s); }
function shortTs(ts) { return (ts || "").slice(0, 19).replace("T", " "); }

// ----- Visual helpers (all build DOM, never set innerHTML from data) -----
function bandCell(band) {
  const label = band === "ceiling" ? "ceiling" : band === "workable" ? "workable" : "below-floor";
  const span = el("span", { class: "band-cell " + (band || "below-floor") });
  span.appendChild(el("span", { class: "dot" }));
  span.appendChild(text(label));
  return span;
}

function sparklineEl(history, dim) {
  const pts = history.map((e) => e.scores?.[dim]).filter((v) => v !== null && v !== undefined);
  if (pts.length === 0) return el("span", { style: "color:var(--muted)" }, "—");
  if (pts.length === 1) return el("span", { style: "font-family:var(--mono);font-size:.78rem" }, pts[0] + " (1pt)");
  const W = 80, H = 18, PAD = 2;
  const xStep = (W - 2 * PAD) / (pts.length - 1);
  const yMin = 0, yMax = 3;
  const points = pts.map((v, i) => {
    const x = PAD + i * xStep;
    const y = H - PAD - ((v - yMin) / (yMax - yMin)) * (H - 2 * PAD);
    return x.toFixed(1) + "," + y.toFixed(1);
  }).join(" ");
  const last = pts[pts.length - 1];
  const first = pts[0];
  const stroke = last > first ? "var(--ceiling)" : last < first ? "var(--below)" : "var(--muted)";
  const svg = el("svg", { class: "spark", width: W, height: H, viewBox: "0 0 " + W + " " + H });
  svg.appendChild(el("polyline", { fill: "none", stroke: stroke, "stroke-width": "1.5", points: points }));
  return svg;
}

function numCell(value) {
  return el("td", { class: "num" }, fmtScore(value));
}
function totalCell(value) {
  return el("td", { class: "num" }, fmtTotal(value));
}

// ----- Table rendering -----
function renderPagesTable() {
  const filter = document.getElementById("filter").value.toLowerCase().trim();
  const rows = [...latestMap.values()].sort((a, b) => {
    const c = cmp(a, b, sortKey);
    return sortDir === "asc" ? c : -c;
  });
  const body = document.getElementById("pages-body");
  body.replaceChildren();
  for (const e of rows) {
    if (filter && !e.slug.toLowerCase().includes(filter)) continue;
    const s = e.scores || {};
    const history = historyMap.get(e.slug) || [];
    const isJudged = e.kind === JUDGED_KIND;
    const kindBadge = isJudged
      ? el("span", { class: "kind-badge judged", title: "LLM-judgment overlay applied" }, "J")
      : el("span", { class: "kind-badge floor", title: "Mechanical floor only" }, "F");
    const tr = el("tr", { class: "row", dataset: { slug: e.slug } },
      el("td", {}, bandCell(e.band)),
      el("td", {}, kindBadge),
      totalCell(e.total),
      ...DIMENSIONS.map((d) => numCell(s[d])),
      el("td", {}, sparklineEl(history, "D3")),
      el("td", { class: "mono" }, shortTs(e.ts)),
      el("td", { class: "slug" }, e.slug),
    );
    const detail = el("tr", { class: "detail", dataset: { for: e.slug } },
      el("td", { colspan: String(DETAIL_COLSPAN) }),
    );
    tr.addEventListener("click", () => toggleDetail(tr, detail, e));
    body.appendChild(tr);
    body.appendChild(detail);
  }
  document.querySelectorAll("th[data-sort]").forEach((th) => {
    const k = th.dataset.sort;
    const arrow = th.querySelector(".arrow");
    if (!arrow) return;
    if (k === sortKey) arrow.textContent = sortDir === "asc" ? "↑" : "↓";
    else arrow.textContent = "↕";
  });
}

function toggleDetail(rowEl, detailEl, latest) {
  const isOpen = detailEl.classList.contains("show");
  document.querySelectorAll("tr.detail.show").forEach((el) => el.classList.remove("show"));
  document.querySelectorAll("tr.row.expanded").forEach((el) => el.classList.remove("expanded"));
  if (isOpen) return;
  detailEl.classList.add("show");
  rowEl.classList.add("expanded");
  populateDetail(detailEl.firstChild, latest);
}

function populateDetail(slot, latest) {
  slot.replaceChildren();
  const history = (historyMap.get(latest.slug) || []).slice().sort((a, b) => (a.ts || "").localeCompare(b.ts || ""));

  slot.appendChild(el("h3", {}, latest.slug));
  slot.appendChild(el("div", { class: "depth" }, latest.depth_claim || "(no depth_claim)"));

  // Judgment block — only when the latest entry has the LLM-judge overlay.
  if (latest.kind === JUDGED_KIND) {
    slot.appendChild(el("h4", {}, "LLM judgment — summary"));
    slot.appendChild(el("p", { class: "judge-summary" }, latest.judgment_summary || "(no summary)"));

    slot.appendChild(el("h4", {}, "Floor vs judgment (mechanical floor is the lower bound)"));
    const compareTable = el("table", { class: "history" });
    const compareHead = el("thead");
    const compareHeadRow = el("tr");
    compareHeadRow.appendChild(el("th", {}, "layer"));
    compareHeadRow.appendChild(el("th", { class: "num" }, "total"));
    for (const d of DIMENSIONS) compareHeadRow.appendChild(el("th", { class: "num" }, d));
    compareHead.appendChild(compareHeadRow);
    compareTable.appendChild(compareHead);
    const compareBody = el("tbody");
    const floorRow = el("tr", { class: "floor-row" },
      el("td", {}, "floor"),
      el("td", { class: "num" }, fmtTotal(latest.floor_total)),
      ...DIMENSIONS.map((d) => el("td", { class: "num" }, fmtScore((latest.floor || {})[d]))),
    );
    const judgmentRow = el("tr", { class: "judgment-row" },
      el("td", {}, "judgment"),
      el("td", { class: "num" }, fmtTotal(latest.judgment_total)),
      ...DIMENSIONS.map((d) => el("td", { class: "num" }, fmtScore((latest.judgment || {})[d]))),
    );
    compareBody.appendChild(floorRow);
    compareBody.appendChild(judgmentRow);
    compareTable.appendChild(compareBody);
    slot.appendChild(compareTable);

    const reasoning = latest.judgment_reasoning || {};
    if (Object.keys(reasoning).some((k) => reasoning[k])) {
      slot.appendChild(el("h4", {}, "Judgment reasoning"));
      const ul = el("ul", { class: "reasoning" });
      for (const d of DIMENSIONS) {
        const r = reasoning[d];
        if (!r) continue;
        const li = el("li", {});
        li.appendChild(el("span", { class: "dim" }, d));
        li.appendChild(text(r));
        ul.appendChild(li);
      }
      slot.appendChild(ul);
    }

    if ((latest.judgment_warnings || []).length > 0) {
      slot.appendChild(el("h4", {}, "Judgment warnings"));
      const ul = el("ul", { class: "notes" });
      for (const w of latest.judgment_warnings) ul.appendChild(el("li", {}, w));
      slot.appendChild(ul);
    }

    slot.appendChild(el("p", { class: "meta", style: "margin-top:.5rem" },
      "Judge model: ", el("code", {}, latest.judge_model || "(unknown)")
    ));
  }

  slot.appendChild(el("h4", {}, "Dimension sparklines"));
  const sparksWrap = el("div");
  for (const d of DIMENSIONS) {
    const grp = el("div", { class: "spark-group" }, d + " ");
    grp.appendChild(sparklineEl(history, d));
    sparksWrap.appendChild(grp);
  }
  slot.appendChild(sparksWrap);

  slot.appendChild(el("h4", {}, "Full history (" + history.length + " eval" + (history.length === 1 ? "" : "s") + ")"));
  const histTable = el("table", { class: "history" });
  const thead = el("thead");
  const headRow = el("tr");
  const fixedHeads = ["timestamp","band","total","Δ"];
  const trailingHeads = ["notes"];
  const numericSet = new Set(["total","Δ","notes",...DIMENSIONS]);
  for (const h of [...fixedHeads, ...DIMENSIONS, ...trailingHeads]) {
    headRow.appendChild(el("th", numericSet.has(h) ? { class: "num" } : {}, h));
  }
  thead.appendChild(headRow);
  histTable.appendChild(thead);
  const tbody = el("tbody");
  let prev = null;
  for (const e of history) {
    const s = e.scores || {};
    let deltaNode;
    if (prev === null) deltaNode = text("—");
    else if (e.total > prev) deltaNode = el("span", { class: "delta-up" }, "↑" + (e.total - prev).toFixed(2));
    else if (e.total < prev) deltaNode = el("span", { class: "delta-down" }, "↓" + (prev - e.total).toFixed(2));
    else deltaNode = el("span", { class: "delta-flat" }, "──");
    prev = e.total;
    const row = el("tr",
      {},
      el("td", { class: "mono" }, shortTs(e.ts)),
      el("td", {}, bandCell(e.band)),
      totalCell(e.total),
      el("td", { class: "num" }, deltaNode),
      ...DIMENSIONS.map((d) => numCell(s[d])),
      el("td", { class: "num" }, (e.notes || []).length),
    );
    tbody.appendChild(row);
  }
  histTable.appendChild(tbody);
  slot.appendChild(histTable);

  slot.appendChild(el("h4", {}, "Latest notes"));
  const notes = latest.notes || [];
  if (notes.length === 0) {
    slot.appendChild(el("p", { style: "color:var(--muted);font-size:.85rem;margin:.2rem 0" }, "No notes."));
  } else {
    const ul = el("ul", { class: "notes" });
    for (const n of notes) ul.appendChild(el("li", {}, n));
    slot.appendChild(ul);
  }
}

function renderTimeline() {
  const tl = document.getElementById("timeline");
  tl.replaceChildren();
  const recent = ALL_ENTRIES.slice(-50).reverse();
  for (const e of recent) {
    const s = e.scores || {};
    const dimStr = DIMENSIONS.map((k) => k + "=" + (s[k] === null || s[k] === undefined ? "—" : s[k])).join(",");
    const isJudged = e.kind === JUDGED_KIND;
    const kindBadge = el("span", { class: "kind-badge " + (isJudged ? "judged" : "floor") }, isJudged ? "J" : "F");
    const li = el("li",
      {},
      el("span", { class: "ts" }, shortTs(e.ts)),
      el("span", {}, bandCell(e.band)),
      el("span", { class: "num", style: "text-align:right" }, fmtTotal(e.total)),
      el("span", {}, dimStr),
      el("span", { class: "slug-cell" }, kindBadge, " ", e.slug),
    );
    tl.appendChild(li);
  }
}

document.querySelectorAll("th[data-sort]").forEach((th) => {
  th.addEventListener("click", () => {
    const k = th.dataset.sort;
    if (k === sortKey) sortDir = sortDir === "asc" ? "desc" : "asc";
    else { sortKey = k; sortDir = "asc"; }
    renderPagesTable();
  });
});
document.getElementById("filter").addEventListener("input", renderPagesTable);

renderPagesTable();
renderTimeline();
</script>
</body>
</html>
`;

writeFileSync(OUT, html);
const outRel = OUT.startsWith(REPO_ROOT) ? OUT.slice(REPO_ROOT.length + 1) : OUT;
console.log(`Wrote ${outRel} (${(html.length / 1024).toFixed(1)} KB; ${entries.length} entries, ${distinctSlugs.size} pages).`);
console.log(`Open in browser: file://${OUT}`);

if (OPEN) {
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  spawn(opener, [OUT], { detached: true, stdio: 'ignore' }).unref();
  console.log(`(Launching ${opener} ${outRel}…)`);
}
