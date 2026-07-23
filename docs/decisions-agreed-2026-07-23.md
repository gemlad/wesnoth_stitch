# Decisions agreed — 2026-07-23

This was `decisions-pending.md`, the queue of calls only a human could make. **All of them
are now made.** It is kept as a dated record of *what* was decided and *why*; the live design
lives in [`design.md`](design.md), and this file no longer drives any open work.

The five items map to the five sections of the old pending queue. The headline is the last two:
the **print test (#28) has been taken and passed**, which — together with the symbol/assignment
work (#30) — clears the last human blockers on Milestones 2 and 3.

> The artefacts that informed these are in [`../uat/`](../uat/), regenerable with
> `npm run uat`. `uat/README.md` explains them.

---

## 1. Symbol set and assignment rule — #30 — **agreed**

The assignment rule and the shape-not-shade principle were settled on 2026-07-17 and are
recorded in `design.md` §5.3:

- **Assignment rule: `interleaved`** (`DEFAULT_ASSIGNMENT_STRATEGY`). Chosen against the ink
  metric deliberately — it keeps a bold anchor on the dominant colour while pushing the
  next-largest areas to faint glyphs. See §5.3, "Decided: `interleaved`".
- **Symbols differ by shape, not shade.** Graded ink ramps (`░ ▒ ▓ █`, circle fill-states)
  and value-shading are rejected. Distinct *fills* are fine where each reads as its own mark.
- **D2 (churn), D5 (one set for both overlay and print)** folded into §5.3.

## 2. Print test — #28 — **taken and passed**, with two glyphs cut

The chart printed at the correct physical size (the pdf-lib rewrite fixed the print-scale
problem). Judged on paper, **every letter pair passed** — including the three marginals
`C`/`G`, `E`/`F`, `P`/`R` — and so did the restored digits and the print marks. `♠` vs `▲`
passed too, contrary to the earlier guess.

**Two glyphs were cut:**

- **`◆` (geometric filled diamond) — dropped.** Indistinct from the card-suit `♦` on paper.
  `♦` is kept and **promoted into tier 1** as the set's filled diamond (the role `◆` held).
- **`▦` (crosshatch square) — dropped.** Not distinct enough from solid `■` and open `□`.

The set therefore settles at **47 glyphs** (was a provisional 49). `MAX_COLOUR_COUNT` tracks
the array length, so the colour cap is now 47. Implemented in `pipeline/symbols.ts` /
`glyph-ink.ts`; recorded in `design.md` §5.3 and §8. **#28 and #30 close.**

## 3. Glyph set is settled *for now* — revisit post-launch — #57 — **agreed**

Happy with the 47-glyph set for first release. A wider pool (more of the bundled DejaVu Sans)
would make the stitching more enjoyable, but it is **post-launch** work, tracked as **#57
("Add in more symbols from the full DejaVu Sans typeface")** in the *Quality of life features*
milestone. A full re-rank of the settled set by distinctness rides along with that ticket; the
two print-test survivors kept their appended positions for now.

## 4. Default colour count and distribution timing — **agreed** (was §4)

Unchanged from the 2026-07-17 resolution, recorded in `design.md` §5.2 and §9:

- **Default colour count:** the app's current behaviour is what's wanted — the sprite's own
  distinct-DMC count is the slider's cap and default, no separate fixed-small-palette mode.
- **Distribution / packaging (Milestone 4):** gated on Milestones 2 and 3 passing UAT and
  closing. First release is Milestones 1–4; everything else is a post-release GitHub milestone.

## 5. Page-overlap margin — **agreed** (was §5)

Deferred to after first release. Tracked as **#49** in the *Quality of life features*
milestone. No change to what gets built for first release.

---

## What this unblocks

With #28 and #30 resolved, Milestone 2's last open design issue is cleared and Milestone 3's
print-legibility question is answered. The remaining open issues on M2/M3 are
implementation, not decisions:

| | | |
| --- | --- | --- |
| **#53** | Trim transparent border before charting | Milestone 2 |
| **#45–#48, #54** | Export polish (drop PNG export, preview in front matter, licence on every page, chart-mode in filename, centre markers) | Milestone 3 |

Once those land and the milestones close, **Milestone 4 — packaging** is unblocked (decision 4).

## Convention

Anything that needed a human verdict got an artefact in [`../uat/`](../uat/) and a line in the
pending queue. That queue is now this record. New decisions, if any arise, start a fresh dated
`decisions-*.md`.
