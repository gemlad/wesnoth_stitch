# Decision — project licence (#76)

Spike outcome for Milestone 4. Chooses the licence for **Wesnoth Stitch's own source code**
and confirms compatibility with everything the project bundles or processes. Recorded here so
the conformance work (#77) has a settled target.

> **Update (2026-07-23): the licence is GPL-3.0-or-later.** This doc originally settled on MIT
> (autonomously, under "no decisions for me"). Gemma then chose **GPL v3+**. The change is
> recorded below; the original MIT rationale is kept at the end for the record. Both licences
> are viable — the compatibility analysis holds for either — so this was a preference call,
> and Gemma made it.

## The problem

The repo had **no `LICENSE` and no `license` field in `package.json`** — which defaults to
"all rights reserved" and directly contradicts the intent to distribute the app (§3).

## Decision: **GPL-3.0-or-later**

Wesnoth Stitch's code is licensed **GNU GPL v3 or later**, © 2026 Gemma Wright.

### Why GPL v3+
- **It aligns with Wesnoth.** Battle for Wesnoth is itself GPL v2+ software with GPL/CC-BY-SA
  art; a copyleft licence keeps Wesnoth Stitch in the same free-software spirit as the project
  it builds on, and ensures downstream forks stay free.
- **"or later"** matches Wesnoth's own "v2+" convention and the FSF's recommendation, keeping
  the door open to future GPL versions.
- The cost of copyleft over MIT — more obligation on anyone who redistributes a modified
  version — is acceptable for a hobby app whose author wants derivatives to stay open.

## Compatibility — confirmed (holds for GPLv3)

- **npm dependency tree:** all permissive (2026-07-23 scan: MIT, ISC, Apache-2.0, BSD-2/3,
  BlueOak, 0BSD, WTFPL, Python-2.0, and build-time CC-BY-4.0) — **no copyleft**. All are
  **GPLv3-compatible**; Apache-2.0 and CC-BY-4.0 are one-way compatible *into* a GPLv3 work,
  which is the direction that matters here. ✔
- **Bundled DejaVu Sans** — Bitstream Vera Fonts License: redistribution/bundling permitted;
  shipped unmodified so the name condition does not bite. A permissive font bundled with a
  GPLv3 app is fine. ✔
- **DMC dataset** — community-sourced factual colour reference (`code,name,hex`); reference
  data with provenance noted. No code-licence conflict. ✔

## The art boundary still holds — and now points the same way

Battle for Wesnoth art is **GPL v2+ / CC-BY-SA 4.0**, attaching to *distribution* of the art
and to *derivative works*. Because the acquisition decision (#69) has the app **download**
sprites at runtime rather than **bundle** them, Wesnoth Stitch does not redistribute Wesnoth
art; the art licence governs the **exported PDF charts** (derivative works), which already
carry per-page attribution (`src/shared/licence.ts`). Under MIT this boundary was what *freed*
the code from the art's copyleft; under GPL v3+ it no longer needs to, but it still matters —
the app's licence (who may reuse the *code*) and the art's attribution (crediting the
*sprites*) remain two different questions and must not be conflated.

## Hand-off to conformance (#77)

- `LICENSE` (full GPLv3 text + notice) at repo root; `"license": "GPL-3.0-or-later"` in
  `package.json`. ✔
- `THIRD-PARTY-NOTICES.md` covering DejaVu Sans, the DMC data, and the dependency tree
  (now stating GPLv3 compatibility), confirmed to ship in the packaged build. ✔
- App footer surfaces the app's own GPL licence, kept distinct from the artwork attribution. ✔

---

## Appendix — the original MIT rationale (superseded)

Kept for the record. MIT was initially chosen because the dependency tree is uniformly
permissive (nothing forces copyleft), it is the least-friction choice for a small
freely-distributed app, and the download-not-bundle boundary meant the art's copyleft never
reached the code — so the code was *free* to be MIT. That reasoning was sound; Gemma simply
preferred copyleft for alignment with Wesnoth, which the same boundary analysis also permits.
