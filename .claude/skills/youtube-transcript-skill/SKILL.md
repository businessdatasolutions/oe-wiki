---
name: youtube-transcript
description: Fetch a YouTube video's metadata and transcript via Playwright and save it as a Markdown file with a YAML front-matter header. Trigger on any request involving a YouTube URL where the user wants the spoken content as text — "get the transcript", "transcribe this video", "summarize this video" (fetch first, summarize after), or any time captions/subtitles are useful.
---

# youtube-transcript

Drives a real Chromium browser with Playwright to extract a YouTube video's metadata and auto-generated transcript. Works by riding YouTube's own engagement-panel loader instead of hitting the `timedtext` endpoint or the `youtubei/v1/get_transcript` RPC directly — the page's session already has the PoT tokens YouTube now requires, so the data falls out of the DOM.

Output is a Markdown file with a YAML header (all metadata) and a body with chapters interleaved as section headings around the transcript segments.

## When to use

- User shares a YouTube URL and asks for the transcript, captions, or subtitles
- User wants a written record of a talk, podcast, lecture, or interview
- User asks to summarize, quote from, or analyze the spoken content of a video — fetch the transcript first, *then* do the analysis

## Setup (one time)

```bash
pip install -r requirements.txt
python -m playwright install chromium
```

## How to invoke

Two output modes:

**Markdown (default) — for "give me the transcript" requests:**

```bash
python fetch_transcript.py "https://www.youtube.com/watch?v=VIDEO_ID" -o transcript.md
```

**JSON — when the user wants a *clean* transcript and you'll polish it yourself:**

```bash
python fetch_transcript.py "URL" --json > /tmp/raw.json
```

Then read the JSON, fix ASR errors (proper nouns, product names, mistranscribed acronyms, obvious stutters), and write the polished `.md` yourself. This is almost always what you want — auto-captions are noisy and the model does this cleanup well in one pass.

Other flags: `--headed` (show the browser, useful for debugging consent/sign-in walls), `--timeout MS` (per-step, default 30s).

## Output shape

```markdown
---
title: "Running an AI-native engineering org"
video_id: igO8iyca2_g
url: https://www.youtube.com/watch?v=igO8iyca2_g
channel: Claude
channel_id: UCV03SRZXJEz-hchIAogeJOg
channel_url: https://www.youtube.com/channel/UCV03SRZXJEz-hchIAogeJOg
publish_date: '2026-05-08T11:50:11-07:00'
upload_date: '2026-05-08T11:50:11-07:00'
category: Science & Technology
duration: '28:38'
length_seconds: 1718
view_count: 9179
default_language: en
is_live: false
thumbnail: https://i.ytimg.com/vi/igO8iyca2_g/maxresdefault.jpg
keywords:
  - claude
  - claude code
  - anthropic
caption_tracks:
  - language_code: en
    name: English (auto-generated)
    kind: asr
    is_translatable: true
thumbnails:
  - {url: 'https://i.ytimg.com/vi/igO8iyca2_g/default.jpg', width: 120, height: 90}
  - {url: 'https://i.ytimg.com/vi/igO8iyca2_g/mqdefault.jpg', width: 320, height: 180}
  - ...
chapters:
  - {title: Intro, start: '0:00', start_ms: 0}
  - {title: The shift, start: '2:11', start_ms: 131000}
description: |
  When agentic coding goes from individual tool to org-wide default, the tool isn't
  the hard part... your processes are.
---

## Transcript

[0:00] ...

## [2:11] The shift

[2:11] ...
```

## Metadata fields

| Field | Source | Notes |
|---|---|---|
| `title`, `video_id`, `url` | `videoDetails` | Canonical |
| `channel`, `channel_id`, `channel_url` | `videoDetails.author` / `.channelId` | URL is constructed |
| `publish_date` | `microformat.publishDate` | When YouTube made it visible |
| `upload_date` | `microformat.uploadDate` | When the file was uploaded — usually same as publish but differs for premieres / re-uploads |
| `category` | `microformat.category` | E.g. "Science & Technology", "Music" |
| `duration` / `length_seconds` | `videoDetails.lengthSeconds` | `duration` is a `mm:ss` / `h:mm:ss` string |
| `view_count` | `videoDetails.viewCount` | Precise integer (not the rounded "12K" displayed) |
| `default_language` | `microformat.defaultLanguage` / `defaultAudioLanguage` | Often null — many videos don't set it |
| `is_live`, `is_upcoming`, `is_private`, `is_family_safe` | flags | |
| `thumbnail` | `videoDetails.thumbnail.thumbnails[-1].url` | Highest-resolution single URL |
| `thumbnails` | `videoDetails.thumbnail.thumbnails` | All resolutions (default → maxresdefault), each with width/height |
| `keywords` | `videoDetails.keywords` | Creator-set tags, not always populated |
| `caption_tracks` | `captions.playerCaptionsTracklistRenderer.captionTracks` | Each: `language_code`, `name`, `kind` (`'asr'` for auto-generated, `'manual'` for creator-uploaded), `is_translatable` |
| `available_countries` | `microformat.availableCountries` | ISO country codes; long list — usually omitted from the YAML if empty |
| `chapters` | engagementPanels macroMarkersListRenderer | Each: `title`, `start` (label), `start_ms` |
| `description` | `videoDetails.shortDescription` | The **full** creator-written description (see note below) |

### A note on `description` vs `shortDescription`

- `<meta property="og:description">` returns a truncated ~160-char blurb meant for social-share previews
- `videoDetails.shortDescription` is misleadingly named — it's the **full** creator-written description with all line breaks, links, hashtags, and timestamps preserved
- The DOM element `#description-inline-expander` renders the same content as `shortDescription` but with elements made interactive

This skill uses `shortDescription` and exposes it as `description` in the YAML, with a `|` literal block scalar so multi-line text round-trips cleanly.

### Chapters in the body

When YouTube provides chapters, the script emits each chapter as a `## [mm:ss] Title` heading and groups the transcript segments under it. When there are no chapters, the body is a flat `## Transcript` section.

## Workflow recommendation

1. Run with `--json` to get structured data (metadata + raw segments with timestamps).
2. Read the JSON.
3. ASR-clean the transcript (fix product/people names, drop obvious stutters, light punctuation), preserve timestamps.
4. Build the YAML header from the metadata block as-is and write the final `.md`. The script's own `--md` output is fine as a fallback if you don't need cleaning.

## What this skill does *not* capture: visual content

This skill produces a **speech-only** record. Slides, screen recordings, demonstrations, code on screen, on-screen captions, whiteboard work, gestural emphasis — none of these appear in the transcript. The transcript may *refer* to them ("as you can see on this slide", "[slide change]", "here's the chart"), but the visuals themselves do not survive.

**Implication for Process.** A video source is not exclusively text-based, so its wiki source page **must** carry a `## Visual content` section per [CLAUDE.md §Visual content extraction](../../../CLAUDE.md#visual-content-extraction). Operationally:

1. During pre-flight Check 4 (visual inventory), state the recovery path explicitly in the source page's `notes:` field — typically *"slides described from transcript verbal cues; no frame capture"*, or *"keyframes fetched via Chrome DevTools MCP at chapter boundaries"*, or *"slide deck linked in description; ingested as separate source"*.
2. Scan the transcript for visual cues — `[slide change]` markers (if the ASR caught them), `as you can see`, `this chart shows`, `here on screen`, `let me demonstrate`, `look at this`, chapter markers when present.
3. Estimate the visual budget — for slide-based talks, slides-per-minute × duration gives a rough lower bound (e.g. a 40-minute talk with ~1 slide per minute → ~38 slides; surface this in the pre-write summary).
4. Write the `## Visual content` section using the transcript references as anchors. Be honest about the recovery method — *"inferred from speaker references"* is acceptable when frame capture isn't possible; *"viewed at <timestamp> in the source"* is acceptable when keyframes are fetched.

For talking-head interviews with no slides / demos / screen content, the section is minimal but **still required**: `> Single fixed shot of two speakers throughout; no slides, demos, screen content, or on-screen text shown.` That *is* the auditable absence — silently omitting the section is indistinguishable from forgetting to write it.

## Failure modes

- **`error: "no transcript section"`** — Video has no captions (common for music videos, very short clips, some unlisted videos). The skill still writes the markdown file with metadata only and a placeholder `## Transcript` section. Exit code is `1` so callers can branch on transcript availability without losing metadata.
- **`error: "transcript panel did not render"`** — Trigger fired but the segment renderers didn't appear in time. Bump `--timeout` to 60000 and retry. If it still fails the video may be region-locked, age-gated, or hitting a panel-render path the skill doesn't handle yet — observed on some long-format talks (≥20 min) even when captions exist. The skill still writes a metadata-only file.

  *2026-05-13 incident note.* YouTube's `/youtubei/v1/get_transcript` endpoint started rejecting WebDriver-flagged sessions with HTTP 400 `"Precondition check failed"`, which surfaces in the skill as this same `panel did not render` symptom (the spinner spins forever, the segments never load). The fix is automation-signal masking, not auth: `--disable-blink-features=AutomationControlled` at launch, `navigator.webdriver` overridden to `undefined`, plus a non-`HeadlessChrome` user-agent. All three are now in place in `fetch()`. If you see this symptom return, the diagnostic to confirm it's the same root cause is: `page.on('response', ...)` and look for `/get_transcript` responses with status 400 and a `failedPrecondition` body.
- **Consent or sign-in wall** — Pass `--headed` once, click through manually. For long-term reuse, `BrowserContext.storage_state(path="state.json")` and reload it on subsequent runs.
- **Trusted Types CSP rejection (fixed 2026-05-09)** — YouTube ships a strict CSP that rejects string-form JS evaluation in `wait_for_function` / `evaluate`. The skill registers `bypass_csp=True` on the browser context **and** injects a default Trusted Types policy via `page.add_init_script(...)` (defense in depth). If string-evaluation errors return, verify both are still in place.
- **YouTube DOM drift** — The skill no longer relies on a stable engagement-panel `target-id`; it queries `ytd-transcript-segment-renderer` elements directly anywhere on the page (also fixed 2026-05-09). Metadata is read with optional chaining throughout, so partial drift just nulls a field instead of crashing. If `ytd-transcript-segment-renderer` itself ever gets renamed, the `innerText` fallback on the first expanded engagement panel still works.

## Why not a simpler library?

`youtube-transcript-api` and `yt-dlp` both fetch the `timedtext` endpoint directly. Since 2024, YouTube has been gating that endpoint behind a Proof-of-Origin token tied to a real browser session — so those libraries work intermittently and fail silently (empty 200 responses) on a growing share of videos. Driving a real Chromium with Playwright inherits the session automatically and is the most reliable approach for a "just works" tool inside an agent.

## Why not BeautifulSoup?

Everything useful on a YouTube watch page is JS-rendered, so you have to wait for hydration anyway, and once you've waited, `page.evaluate()` reads from the live DOM more directly than handing HTML to bs4. If you specifically want bs4 in the loop, `await page.content()` gives you the post-hydration HTML string to parse — but for this skill it adds complexity without a payoff.
