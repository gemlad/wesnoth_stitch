# Decision — project licence (#76)

Spike outcome for Milestone 4. Chooses the licence for **Wesnoth Stitch's own source code**
and confirms compatibility with everything the project bundles or processes. Made autonomously
(Gemma: "no decisions for me"), recorded here so the conformance work (#77) has a settled
target.

## The problem

The repo had **no `LICENSE` and no `license` field in `package.json`** — which defaults to
"all rights reserved" and directly contradicts the intent to distribute the app (§3).

## Decision: **MIT**

Wesnoth Stitch's code is licensed **MIT**, © 2026 Gemma Wright.

### Why MIT over copyleft (e.g. GPL)
- **It matches the ecosystem.** A scan of the installed dependency tree (2026-07-23) is
  uniformly permissive — 440× MIT, plus ISC, Apache-2.0, BSD-2/3-Clause, BlueOak, 0BSD,
  WTFPL — with **no GPL/LGPL anywhere**. Nothing forces or even nudges toward copyleft.
- **It is the least-friction choice for a small, freely-distributed hobby app**: maximum
  reusability, minimal obligation on anyone who builds on it, and no compatibility analysis
  needed against future permissive dependencies.
- Copyleft (GPL) would align with Wesnoth's *spirit*, but there is no obligation to adopt it
  (see the boundary below), and it would impose more on contributors/reusers than this
  project needs.

## Compatibility — confirmed

- **npm dependency tree:** all permissive, no copyleft (scan above). MIT is compatible. ✔
- **Bundled DejaVu Sans** — Bitstream Vera Fonts License: redistribution/bundling permitted;
  we ship it unmodified so the name condition does not bite. Compatible with an MIT app. ✔
- **DMC dataset** — community-sourced factual colour reference (`code,name,hex`); reproduced
  as reference data with provenance noted. No code-licence conflict. ✔

## The boundary that keeps the code MIT: sprites are downloaded, not bundled

Battle for Wesnoth art is **GPL v2+ / CC-BY-SA 4.0**. That licence attaches to *distribution*
of the art and to *derivative works* of it. Because the acquisition decision (#69) has the app
**download** sprites at runtime rather than **bundle** them:

- Wesnoth Stitch **does not redistribute** Wesnoth art, so the art's copyleft does **not**
  reach back onto the application's own source. The code is free to be MIT.
- What the art licence **does** govern is the **exported PDF charts**, which *are* derivative
  works — hence the per-page attribution the export already carries (`src/shared/licence.ts`).

Stating this boundary explicitly is the point: the app's licence and the art's attribution
answer two different questions (who may reuse the *code* vs crediting the *sprites*), and they
must not be conflated.

## Hand-off to conformance (#77)

- `LICENSE` (MIT) at repo root; `"license": "MIT"` in `package.json`. ✔ (this change)
- `THIRD-PARTY-NOTICES.md` covering DejaVu Sans, the DMC data, and the dependency tree, and
  confirmed to ship in the packaged build. ✔ (this change)
- Surface the app's own licence + notices somewhere reachable **in-app** (About) — remaining
  #77 work, since it needs a UI touch.
