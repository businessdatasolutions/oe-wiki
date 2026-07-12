# Log

Reverse-chronological record of wiki operations — **newest entry at the top, oldest at the bottom**. New entries are *prepended* immediately under the `---` separator below. Strict prefix format so `grep "^## \[" wiki/log.md | head -10` returns the ten most recent. Format (indented to keep grep clean):

    ## [YYYY-MM-DD] <op> | <title>

Permitted operations: `ingest`, `acquire`, `query`, `lint`, `synthesize`, `refactor`, `bulk-refactor` (for any operation touching >10 wiki pages, with affected slug list and reversibility note). `acquire` is used for sessions that land raw files but defer processing to a later session; the umbrella `ingest` op covers the typical Acquire+Process-in-the-same-session case. See [`CLAUDE.md`](../CLAUDE.md) (§The four operations, §Current state) for details.

---

_No entries yet — your first ingest will prepend here._
