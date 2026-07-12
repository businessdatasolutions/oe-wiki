#!/usr/bin/env node
// traceable-wiki-answer support — multi-strategy retrieval + candidate ledger.
//
// This is the single retrieval entry point for the `traceable-wiki-answer` skill.
// Where `wiki-query.mjs` runs qmd and pretty-prints hits, this script FUSES two
// retrieval streams into one scored candidate ledger that the agent then triages
// (use / ignore) and turns into an auditable answer trace.
//
// Pipeline (see .claude/skills/traceable-wiki-answer/references/trace-schema.md):
//   1. qmd seeds   — `qmd query <q> --json -n <seeds>`  (hybrid BM25 + vector + rerank)
//   2. graph hop   — load wiki/.graph.json, walk <hops> of typed edges from each seed
//   3. RRF fuse    — Reciprocal Rank Fusion over the qmd-rank and graph-proximity streams
//   4. decay rank  — effective_confidence = confidence × exp(-days_since_access / tau)
//                    (tau: concept/synthesis 90, entity 365, source/thread ∞ → factor 1)
//   5. emit ledger — JSON; the script does NOT verdict candidates, the agent does
//   6. bump        — accessed_at on qmd-returned concept/entity/synthesis (reuse bump-accessed.mjs)
//
// Reuses the qmd invocation + slug-extraction patterns from wiki-query.mjs and the
// gray-matter frontmatter dependency already in package.json.
//
// Usage:
//   node scripts/wiki-retrieve.mjs --json -n 12 "your question"   # ledger as JSON (skill default)
//   node scripts/wiki-retrieve.mjs "your question"                # human-readable ledger summary
//   node scripts/wiki-retrieve.mjs --hops 2 "your question"       # widen graph traversal
//   node scripts/wiki-retrieve.mjs --no-bump --json "question"    # don't touch accessed_at
//   node scripts/wiki-retrieve.mjs --today 2026-06-05 "question"  # pin "today" for decay math
//
// Exit codes: 0 = success; 1 = qmd failure; 2 = bad args.

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import matter from 'gray-matter';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const GRAPH_PATH = join(REPO_ROOT, 'wiki', '.graph.json');

// Decay time-constants (days) per CLAUDE.md §Retention. Infinity → factor 1 (no decay).
const TAU = { concept: 90, synthesis: 90, entity: 365, source: Infinity, thread: Infinity };
// Fixed confidence factor for page types that carry no `confidence:` field, used only
// in the fused-ranking blend (sources are evidence; threads are provisional).
const NEUTRAL_CONF = { source: 0.85, thread: 0.6 };
const K_RRF = 60; // standard RRF damping constant
const GRAPH_W = 0.5; // graph-proximity stream weight (< 1 so it can't tie a genuine qmd hit)
// Currency enters fused ranking as a MULTIPLIER, not an additive partner: relevance
// (RRF) sets the order, confidence/decay dampens it. CONF_FLOOR keeps a decayed-but-
// relevant page from collapsing entirely. fused = rrf_norm × (CONF_FLOOR + (1-CONF_FLOOR)·confTerm)
const CONF_FLOOR = 0.6;

// ----- arg parsing -----
const argv = process.argv.slice(2);
let seeds = 12;
let hops = 1;
let bump = true;
let rawJson = false;
let today = new Date().toISOString().slice(0, 10);
const remaining = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '-n') {
    seeds = parseInt(argv[++i], 10);
    if (Number.isNaN(seeds) || seeds < 1) bail('-n requires a positive integer');
  } else if (a === '--hops') {
    hops = parseInt(argv[++i], 10);
    if (Number.isNaN(hops) || hops < 1 || hops > 2) bail('--hops must be 1 or 2');
  } else if (a === '--today') {
    today = argv[++i];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today || '')) bail('--today must be YYYY-MM-DD');
  } else if (a === '--no-bump') {
    bump = false;
  } else if (a === '--json') {
    rawJson = true;
  } else if (a === '--help' || a === '-h') {
    console.log(
      'Usage: wiki-retrieve.mjs [-n <seeds>] [--hops 1|2] [--no-bump] [--json] [--today YYYY-MM-DD] "your question"',
    );
    process.exit(0);
  } else {
    remaining.push(a);
  }
}
if (remaining.length === 0) bail('missing query string');
const query = remaining.join(' ');

function bail(msg) {
  console.error(`error: ${msg}`);
  console.error(
    'Usage: wiki-retrieve.mjs [-n <seeds>] [--hops 1|2] [--no-bump] [--json] [--today YYYY-MM-DD] "your question"',
  );
  process.exit(2);
}

// Parse a qmd path / graph slug into { dir, slug, fullSlug, diskPath }.
// Accepts: "qmd://<collection>/concepts/foo.md", "wiki/concepts/foo.md", "concepts/foo.md", "concepts/foo".
const TYPE_DIRS = 'concepts|entities|syntheses|sources|threads';
const PATH_RE = new RegExp(`(?:^|/)(?:wiki/)?(${TYPE_DIRS})/([^/]+?)(?:\\.md)?$`);
function parseRef(raw) {
  if (!raw) return null;
  const m = raw.match(PATH_RE);
  if (!m) return null;
  const dir = m[1];
  const slug = m[2];
  const fullSlug = `${dir}/${slug}`;
  return { dir, slug, fullSlug, diskPath: join(REPO_ROOT, 'wiki', dir, `${slug}.md`) };
}

const DIR_TO_TYPE = {
  concepts: 'concept',
  entities: 'entity',
  syntheses: 'synthesis',
  sources: 'source',
  threads: 'thread',
};

// ----- Step 1: qmd seeds -----
const qmd = spawnSync(
  'npx',
  ['--yes', '@tobilu/qmd', 'query', query, '--json', '-n', String(seeds)],
  { cwd: REPO_ROOT, encoding: 'utf8' },
);
if (qmd.status !== 0) {
  console.error('qmd failed:');
  console.error(qmd.stderr || qmd.stdout);
  process.exit(1);
}
let parsed;
try {
  parsed = JSON.parse(qmd.stdout);
} catch (e) {
  console.error('failed to parse qmd JSON output:', e.message);
  console.error('--- raw stdout ---');
  console.error(qmd.stdout);
  process.exit(1);
}
const hits = Array.isArray(parsed) ? parsed : parsed.results || [];

// candidates keyed by fullSlug
const cand = new Map();
function ensure(ref) {
  if (!cand.has(ref.fullSlug)) {
    cand.set(ref.fullSlug, {
      slug: ref.fullSlug,
      path: `wiki/${ref.fullSlug}.md`,
      diskPath: ref.diskPath,
      type: DIR_TO_TYPE[ref.dir] || null,
      title: ref.slug,
      qmd_rank: null,
      qmd_score: null,
      graph: [],
      retrieval_reasons: [],
    });
  }
  return cand.get(ref.fullSlug);
}

// qmd stream: ordered list of fullSlugs (rank = position)
const qmdStream = [];
const qmdHitSlugs = new Set(); // for the default-bump set
for (let i = 0; i < hits.length; i++) {
  const h = hits[i];
  const ref = parseRef(h.file || h.path || h.uri || '');
  if (!ref) continue;
  const score =
    typeof h.score === 'number'
      ? h.score
      : typeof h.rerankScore === 'number'
        ? h.rerankScore
        : null;
  const c = ensure(ref);
  if (c.qmd_rank === null) {
    c.qmd_rank = qmdStream.length + 1;
    c.qmd_score = score;
    c.title = h.title || c.title;
    c.retrieval_reasons.push(
      `qmd rank ${c.qmd_rank}${score !== null ? ` (score ${score.toFixed(2)})` : ''}`,
    );
    qmdStream.push(ref.fullSlug);
    qmdHitSlugs.add(ref);
  }
}

// ----- Step 2: graph hop -----
let graphWarning = null;
let adjacency = new Map(); // slug -> [{ neighbour, type, via, dir }]
if (existsSync(GRAPH_PATH)) {
  try {
    const graph = JSON.parse(readFileSync(GRAPH_PATH, 'utf8'));
    for (const e of graph.edges || []) {
      if (e.target_resolved === false) continue;
      pushAdj(e.source, { neighbour: e.target, type: e.type, via: e.via || null, dir: 'out' });
      pushAdj(e.target, { neighbour: e.source, type: e.type, via: e.via || null, dir: 'in' });
    }
  } catch (e) {
    graphWarning = `graph load failed (${e.message}); proceeding qmd-only`;
  }
} else {
  graphWarning = `wiki/.graph.json not found; proceeding qmd-only (run: node scripts/graph-export.mjs)`;
}
if (graphWarning) console.error(`warning: ${graphWarning}`);

function pushAdj(slug, edge) {
  if (!adjacency.has(slug)) adjacency.set(slug, []);
  adjacency.get(slug).push(edge);
}

// BFS up to `hops` from each qmd seed. Record graph provenance on each neighbour.
const graphStream = []; // ordered by (hops asc, seedScore desc) for RRF ranking
const graphSeen = new Set(qmdStream);
const graphLevel = new Map(); // fullSlug -> min hop distance
for (const seedSlug of qmdStream) {
  const seedScore = cand.get(seedSlug)?.qmd_score ?? 0;
  let frontier = [seedSlug];
  const localSeen = new Set([seedSlug]);
  for (let h = 1; h <= hops; h++) {
    const next = [];
    for (const node of frontier) {
      for (const edge of adjacency.get(node) || []) {
        const ref = parseRef(edge.neighbour);
        if (!ref) continue;
        const nb = ref.fullSlug;
        if (localSeen.has(nb)) continue;
        localSeen.add(nb);
        next.push(nb);
        const c = ensure(ref);
        const arrow = edge.dir === 'out' ? '-->' : '<--';
        c.graph.push({
          from_seed: seedSlug,
          edge_type: edge.type,
          via: edge.via,
          hops: h,
        });
        c.retrieval_reasons.push(
          `graph: ${seedSlug} ${arrow}${edge.type}${arrow} this (${h} hop${h > 1 ? 's' : ''})`,
        );
        // record for graph stream ordering (first discovery wins on hop distance)
        if (!graphLevel.has(nb) || h < graphLevel.get(nb)) {
          graphLevel.set(nb, h);
          if (!graphSeen.has(nb)) {
            graphSeen.add(nb);
            graphStream.push({ slug: nb, hops: h, seedScore });
          }
        }
      }
    }
    frontier = next;
  }
}
// order graph stream: hops asc, then seedScore desc
graphStream.sort((a, b) => a.hops - b.hops || b.seedScore - a.seedScore);

// ----- Step 3: RRF fuse (graph stream down-weighted so it can't tie a qmd hit) -----
const rrf = new Map(); // fullSlug -> score
for (let i = 0; i < qmdStream.length; i++) {
  addRrf(qmdStream[i], i + 1, 1.0);
}
for (let i = 0; i < graphStream.length; i++) {
  addRrf(graphStream[i].slug, i + 1, GRAPH_W);
}
function addRrf(slug, rank, weight) {
  rrf.set(slug, (rrf.get(slug) || 0) + weight / (K_RRF + rank));
}
const maxRrf = Math.max(...rrf.values(), 1e-9);

// ----- Step 4: decay re-rank -----
function daysBetween(fromISO, toISO) {
  const a = Date.parse(fromISO);
  const b = Date.parse(toISO);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}
for (const c of cand.values()) {
  let confidence = null;
  let accessed_at = null;
  let last_confirmed = null;
  let status = null;
  let superseded_by = null;
  if (existsSync(c.diskPath)) {
    try {
      const fm = matter(readFileSync(c.diskPath, 'utf8')).data || {};
      if (!c.type && fm.type) c.type = fm.type;
      if (fm.title) c.title = fm.title;
      confidence = typeof fm.confidence === 'number' ? fm.confidence : null;
      accessed_at = fm.accessed_at ? String(fm.accessed_at).slice(0, 10) : null;
      last_confirmed = fm.last_confirmed ? String(fm.last_confirmed).slice(0, 10) : null;
      status = fm.status || null;
      superseded_by = fm.superseded_by ? String(fm.superseded_by) : null;
    } catch {
      /* leave nulls */
    }
  } else {
    c.missing = true;
  }
  c.stored_confidence = confidence;
  c.accessed_at = accessed_at;
  c.last_confirmed = last_confirmed;
  if (status) c.status = status;
  if (superseded_by) c.superseded_by = superseded_by;

  // effective_confidence (null for pages without a stored confidence, e.g. sources)
  const tau = TAU[c.type] ?? 90;
  if (confidence !== null && tau !== Infinity) {
    const ref = accessed_at || last_confirmed;
    const days = ref ? daysBetween(ref, today) : null;
    c.days_since_access = days;
    c.effective_confidence =
      days === null
        ? confidence
        : Math.round(confidence * Math.exp(-days / tau) * 1000) / 1000;
  } else {
    c.days_since_access = null;
    c.effective_confidence = confidence; // sources/threads: null unless they carry confidence
  }

  // confidence term for fused ranking
  const confTerm =
    c.effective_confidence !== null
      ? c.effective_confidence
      : (NEUTRAL_CONF[c.type] ?? 0.7);

  c.rrf_score = Math.round((rrf.get(c.slug) || 0) * 1e6) / 1e6;
  const relNorm = (rrf.get(c.slug) || 0) / maxRrf; // 0..1 relevance
  c.fused_score =
    Math.round(relNorm * (CONF_FLOOR + (1 - CONF_FLOOR) * confTerm) * 1000) / 1000;
}

// ----- assemble ledger -----
const candidates = [...cand.values()]
  .map(({ diskPath, ...rest }) => rest) // drop absolute diskPath from output
  .sort((a, b) => b.fused_score - a.fused_score);

const ledger = {
  query,
  generated_at: new Date().toISOString(),
  params: { seeds, hops, k_rrf: K_RRF, graph_w: GRAPH_W, conf_floor: CONF_FLOOR, today },
  graph_available: !graphWarning,
  graph_warning: graphWarning,
  qmd_hit_count: qmdStream.length,
  candidate_count: candidates.length,
  candidates,
};

// ----- Step 5: emit -----
if (rawJson) {
  console.log(JSON.stringify(ledger, null, 2));
} else {
  console.log(`Query: "${query}"`);
  console.log(
    `${candidates.length} candidates (${qmdStream.length} qmd + ${candidates.length - qmdStream.length} graph), hops=${hops}`,
  );
  if (graphWarning) console.log(`(graph: ${graphWarning})`);
  console.log('');
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const ec = c.effective_confidence !== null ? c.effective_confidence.toFixed(2) : '—';
    console.log(
      `  ${i + 1}. [fused ${c.fused_score.toFixed(2)}] ${c.slug}  (${c.type || '?'}, effConf ${ec})`,
    );
    console.log(`     ${c.retrieval_reasons.join(' · ')}`);
  }
  console.log('');
}

// ----- Step 6: bump accessed_at on qmd-returned concept/entity/synthesis -----
if (bump) {
  const bumpSlugs = [...qmdHitSlugs]
    .filter((r) => ['concepts', 'entities', 'syntheses'].includes(r.dir))
    .map((r) => r.slug);
  if (bumpSlugs.length > 0) {
    const res = spawnSync('node', [join(REPO_ROOT, 'scripts/bump-accessed.mjs'), ...bumpSlugs], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    // bump output goes to stderr so it never pollutes --json stdout
    if (res.stdout) process.stderr.write(res.stdout);
    if (res.stderr) process.stderr.write(res.stderr);
  }
}

process.exit(0);
