#!/usr/bin/env node
// v0.6 quality slice — CLI viewer for the source-page eval log.
//
// Reads logs/quality-source-pages.jsonl (appended by quality-source-page.mjs)
// and shows trends per page over time. Read-only — never modifies the log.
//
// Each log entry is either:
//   kind="mechanical-floor"           — floor scores only ([F] badge)
//   kind="mechanical-floor + llm-judgment" — floor + LLM judgment ([J] badge,
//                                            primary scores/total point at judgment)
//
// Usage:
//   node scripts/quality-log-summary.mjs                       # latest per page
//   node scripts/quality-log-summary.mjs --page <slug>         # full history of one page
//   node scripts/quality-log-summary.mjs --latest N            # last N entries across all pages
//   node scripts/quality-log-summary.mjs --since YYYY-MM-DD    # entries since a date (inclusive)
//   node scripts/quality-log-summary.mjs --dim D3              # focus on one dimension trend
//   node scripts/quality-log-summary.mjs --floor-only          # filter to floor-only entries
//   node scripts/quality-log-summary.mjs --judgment-only       # filter to judged entries
//   node scripts/quality-log-summary.mjs --json                # raw JSONL pass-through (filtered)

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const LOG_FILE = join(REPO_ROOT, 'logs', 'quality-source-pages.jsonl');

const JUDGED_KIND = 'mechanical-floor + llm-judgment';

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}
function has(flag) {
  return process.argv.includes(flag);
}

const PAGE = arg('--page');
const LATEST = arg('--latest') ? parseInt(arg('--latest'), 10) : null;
const SINCE = arg('--since');
const DIM = arg('--dim');
const JSON_OUT = has('--json');
const FLOOR_ONLY = has('--floor-only');
const JUDGMENT_ONLY = has('--judgment-only');

if (FLOOR_ONLY && JUDGMENT_ONLY) {
  console.error('--floor-only and --judgment-only are mutually exclusive.');
  process.exit(2);
}

if (!existsSync(LOG_FILE)) {
  console.error(`No log yet at ${LOG_FILE.slice(REPO_ROOT.length + 1)}.`);
  console.error('Run `node scripts/quality-source-page.mjs` first to seed it.');
  process.exit(2);
}

const lines = readFileSync(LOG_FILE, 'utf8')
  .split(/\r?\n/)
  .filter((l) => l.trim().length > 0);

const entries = [];
for (const [i, line] of lines.entries()) {
  try {
    entries.push(JSON.parse(line));
  } catch (err) {
    console.warn(`[warn] line ${i + 1} not valid JSON, skipping: ${err.message}`);
  }
}

// ----- Filter -----
let filtered = entries;
if (PAGE) filtered = filtered.filter((e) => e.slug && e.slug.includes(PAGE));
if (SINCE) filtered = filtered.filter((e) => e.ts && e.ts >= SINCE);
if (FLOOR_ONLY) filtered = filtered.filter((e) => e.kind !== JUDGED_KIND);
if (JUDGMENT_ONLY) filtered = filtered.filter((e) => e.kind === JUDGED_KIND);

if (filtered.length === 0) {
  console.log('No matching entries.');
  process.exit(0);
}

// ----- Output modes -----
if (JSON_OUT) {
  for (const e of filtered) console.log(JSON.stringify(e));
  process.exit(0);
}

const fmtScore = (s) => (s === null || s === undefined ? '—' : String(s));
const fmtTotal = (t) => (typeof t === 'number' ? t.toFixed(2) : '—');
const fmtBand = (b) => (b === 'ceiling' ? '✓' : b === 'workable' ? '~' : '✗');
const shortTs = (ts) => (ts || '').slice(0, 19).replace('T', ' ');
const kindBadge = (e) => (e.kind === JUDGED_KIND ? 'J' : 'F');

// MODE: --latest N → flat chronological list of last N entries
if (LATEST !== null) {
  const recent = filtered.slice(-LATEST);
  console.log(`Latest ${recent.length} eval entr${recent.length === 1 ? 'y' : 'ies'} (of ${filtered.length} matched):`);
  console.log('');
  console.log('  timestamp           kind  band  total | D1 D2 D3 D4 D5 D6 | slug');
  console.log('  ------------------- ----  ----  ----- + ----------------- + ----');
  for (const e of recent) {
    const s = e.scores || {};
    console.log(
      `  ${shortTs(e.ts)}  ${kindBadge(e).padStart(2)}   ${fmtBand(e.band).padStart(4)}  ${fmtTotal(e.total).padStart(5)} | ${fmtScore(s.D1).padStart(2)} ${fmtScore(s.D2).padStart(2)} ${fmtScore(s.D3).padStart(2)} ${fmtScore(s.D4).padStart(2)} ${fmtScore(s.D5).padStart(2)} ${fmtScore(s.D6).padStart(2)} | ${e.slug}`,
    );
  }
  process.exit(0);
}

// MODE: --page <slug> → full history of that page (chronological)
if (PAGE) {
  console.log(`History for "${PAGE}" (${filtered.length} eval${filtered.length === 1 ? '' : 's'}):`);
  console.log('');
  console.log('  timestamp           kind  band  total | D1 D2 D3 D4 D5 D6 | notes');
  console.log('  ------------------- ----  ----  ----- + ----------------- + -----');
  const sorted = [...filtered].sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
  let prevTotal = null;
  for (const e of sorted) {
    const s = e.scores || {};
    const delta =
      prevTotal === null
        ? '    '
        : e.total > prevTotal
          ? ` ↑${(e.total - prevTotal).toFixed(2)}`
          : e.total < prevTotal
            ? ` ↓${(prevTotal - e.total).toFixed(2)}`
            : '  ──';
    const notesCount = (e.notes || []).length;
    console.log(
      `  ${shortTs(e.ts)}  ${kindBadge(e).padStart(2)}   ${fmtBand(e.band).padStart(4)}  ${fmtTotal(e.total).padStart(5)}${delta} | ${fmtScore(s.D1).padStart(2)} ${fmtScore(s.D2).padStart(2)} ${fmtScore(s.D3).padStart(2)} ${fmtScore(s.D4).padStart(2)} ${fmtScore(s.D5).padStart(2)} ${fmtScore(s.D6).padStart(2)} | ${notesCount} note${notesCount === 1 ? '' : 's'}`,
    );
    prevTotal = e.total;
  }
  const latest = sorted[sorted.length - 1];

  // For judged entries, show floor vs judgment side by side + summary + warnings
  if (latest.kind === JUDGED_KIND) {
    console.log(`\n  Latest (judged at ${shortTs(latest.ts)}):`);
    const f = latest.floor || {};
    const j = latest.judgment || {};
    console.log(`    floor    total=${fmtTotal(latest.floor_total)} | D1=${fmtScore(f.D1)} D2=${fmtScore(f.D2)} D3=${fmtScore(f.D3)} D4=${fmtScore(f.D4)} D5=${fmtScore(f.D5)} D6=${fmtScore(f.D6)}`);
    console.log(`    judgment total=${fmtTotal(latest.judgment_total)} | D1=${fmtScore(j.D1)} D2=${fmtScore(j.D2)} D3=${fmtScore(j.D3)} D4=${fmtScore(j.D4)} D5=${fmtScore(j.D5)} D6=${fmtScore(j.D6)}`);
    if (latest.judge_model) console.log(`    judge:   ${latest.judge_model}`);
    if (latest.judgment_summary) console.log(`    summary: ${latest.judgment_summary}`);
    if ((latest.judgment_warnings || []).length > 0) {
      console.log('    warnings:');
      for (const w of latest.judgment_warnings) console.log(`      - ${w}`);
    }
    if (latest.judgment_reasoning) {
      console.log('    reasoning per dim:');
      for (const d of ['D1', 'D2', 'D3', 'D4', 'D5', 'D6']) {
        const r = latest.judgment_reasoning[d];
        if (r) console.log(`      ${d}: ${r}`);
      }
    }
  } else if (latest.notes && latest.notes.length > 0) {
    console.log(`\n  Latest notes (${shortTs(latest.ts)}):`);
    for (const n of latest.notes) console.log(`    - ${n}`);
  }

  // Dimension trend if --dim specified
  if (DIM) {
    console.log(`\n  ${DIM} trend:`);
    const seq = sorted
      .map((e) => (e.scores && e.scores[DIM] !== undefined ? `${shortTs(e.ts).slice(0, 10)}=${fmtScore(e.scores[DIM])}[${kindBadge(e)}]` : null))
      .filter(Boolean);
    console.log(`    ${seq.join(' → ')}`);
  }
  process.exit(0);
}

// DEFAULT MODE: latest entry per page (current state)
const latestPerPage = new Map();
for (const e of filtered) {
  const existing = latestPerPage.get(e.slug);
  if (!existing || (e.ts || '') > (existing.ts || '')) latestPerPage.set(e.slug, e);
}
const rows = [...latestPerPage.values()].sort((a, b) => (a.total ?? 0) - (b.total ?? 0));

console.log(`Latest eval per page (${rows.length} page${rows.length === 1 ? '' : 's'}, log has ${entries.length} total entr${entries.length === 1 ? 'y' : 'ies'}):`);
console.log('');
console.log('  kind  band  total | D1 D2 D3 D4 D5 D6 | latest ts          | slug');
console.log('  ----  ----  ----- + ----------------- + ------------------ + ----');
for (const e of rows) {
  const s = e.scores || {};
  console.log(
    `  ${kindBadge(e).padStart(4)}  ${fmtBand(e.band).padStart(4)}  ${fmtTotal(e.total).padStart(5)} | ${fmtScore(s.D1).padStart(2)} ${fmtScore(s.D2).padStart(2)} ${fmtScore(s.D3).padStart(2)} ${fmtScore(s.D4).padStart(2)} ${fmtScore(s.D5).padStart(2)} ${fmtScore(s.D6).padStart(2)} | ${shortTs(e.ts)} | ${e.slug}`,
  );
}

const dist = { ceiling: 0, workable: 0, belowFloor: 0 };
const layerCounts = { judged: 0, floor: 0 };
for (const e of rows) {
  if (e.band === 'ceiling') dist.ceiling++;
  else if (e.band === 'workable') dist.workable++;
  else dist.belowFloor++;
  if (e.kind === JUDGED_KIND) layerCounts.judged++;
  else layerCounts.floor++;
}
console.log(
  `\nBand distribution (latest): ✓ ceiling=${dist.ceiling}, ~ workable=${dist.workable}, ✗ below-floor=${dist.belowFloor}`,
);
console.log(
  `Layer distribution: J judged=${layerCounts.judged}, F floor-only=${layerCounts.floor}`,
);
console.log(
  `\nUseful queries:\n  Trend of one page:    node scripts/quality-log-summary.mjs --page <slug>\n  Last N entries:       node scripts/quality-log-summary.mjs --latest 20\n  Filter to judged:     node scripts/quality-log-summary.mjs --judgment-only\n  Raw JSONL filtered:   node scripts/quality-log-summary.mjs --json --page <slug>`,
);
