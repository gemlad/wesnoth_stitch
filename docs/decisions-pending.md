# Decisions pending — the ones that need Gemma, not code

The queue of calls that a human has to make. Nothing here blocks the build; it is what the
build is waiting on to be *finished*, and a couple of items have been sitting in "pending"
since Milestone 2.

Roughly in order of how much they matter. Tick things off as they're decided, and move the
outcome into `design.md` — this file is a queue, not a record.

---

## 1. The symbol set doesn't work, and the fix is a design choice — [#30]

UAT hasn't passed. The spike is open and loaded with everything we know, but it needs a
direction.

**The core problem is not the glyphs — it's the rule that hands glyphs to colours.** Symbols
are ordered by distinctness (solids first: ● ■ ▲ ◆) and the palette is sorted
biggest-colour-first, so **the colour covering the most stitches gets the inkiest glyph.** On
`merfolk/citizen` at 37 colours the chart collapses into a near-solid black field. Every rule
succeeded individually and the chart still came out wrong.

- **D1 — What should assignment optimise?** Distinctness (today), **ink density inversely to
  area** (big areas get light glyphs — the opposite of today), or stability. My instinct is
  inverse-density, but it's your chart to stitch.
- **D2 — Assign against the *base* palette instead of the reduced one?** Would kill the glyph
  churn on the slider (22 of 30 slider steps currently reassign a symbol even though the
  colours underneath don't move). Cost: a low-colour chart would no longer be guaranteed the
  boldest glyphs — which may be exactly what D1 wants anyway.
- **D3 — Does the set itself change?** Digits were dropped wholesale because `0/O`, `1/I`,
  `2/Z`, `5/S`, `6/G`, `8/B`, `9/P` collide with letters. If letters lose members to the print
  test below, are `3 4 7` worth bringing back?
- **D5 — Should the on-screen overlay and the printed chart use the same set at all?** The
  preview has colour under the glyph; a black-and-white print has nothing else. They may not
  be the same legibility problem.

> **Still needed from you:** what *specifically* failed UAT? There's a placeholder on #30
> rather than an invented answer. If it's the black-field problem, that's D1 confirmed. If
> it's specific glyph pairs, that's the print test below — and you can now actually take it.

---

## 2. The print test — needs a printer and your eyes — [#28]

**Now unblocked, and the artefacts exist.** `uat/chart-symbol.pdf` is a real
black-and-white chart from the real export path: embedded DejaVu, real A4, 2.361 mm cells,
4.82 pt glyphs. Print it at **100% / Actual Size** and #28 is takeable. (`npm run uat:chart`
regenerates it; `uat/README.md` says what to look for.)

Three letter pairs are unvalidated on paper: **`C`/`G`, `E`/`F`, `P`/`R`.**

This has real teeth: **the colour cap and the glyph count are the same number (37).** If a
pair fails, the maximum number of colours a pattern can use drops by one for each glyph lost.
A chart cannot show more colours than it has symbols to name.

---

## 3. Do we bundle an export font? — [#30's D4] — the safe half is taken

This is **the one lever that could raise the 37-colour cap.** The glyph set was restricted to
characters that render in *any* font, which rules out a lot of usable symbols. Bundling a font
reopens the whole pool — dingbats, box-drawing, better letterforms.

**Done (#32):** DejaVu Sans is bundled and embedded, chosen specifically because it *also*
covers the ranges we currently avoid. There's a test asserting that headroom is still there.
So it cost nothing and the door is open.

**Still yours:** whether to walk through it — redesigning the set around a wider pool, possibly
raising the cap. Bigger job than it sounds.

Worth knowing: **colour fidelity is not the reason for the cap.** Squeezing the richest sprites
down to 37 colours costs about half a just-noticeable difference. Nobody can see it. Glyph
legibility is the only thing holding the number down.

---

## 4. Two things marked "pending review with partner" since Milestone 2

Still unanswered — and one has quietly been decided by the code:

- **Default colour count.** The plan was "default to as many colours as the sprite actually
  uses, capped". You'd asked whether a **fixed small palette** would suit how you'd really
  stitch. The slider shipped with the "sprite's own count" behaviour, so it's decided *in
  practice* but never decided *on purpose*. Is that what you want? A pattern with 30 colours
  is a very different stitching project from one with 12.
- **Distribution timing.** When do you want a shareable installer, as opposed to dev-only
  builds? Doesn't change what gets built, but it changes what comes *after* Milestone 3 —
  whether packaging gets pulled forward.

---

## 5. Page-overlap margin (wait until you've seen a printed chart)

Should tiled chart pages **overlap** by a row or two? Right now a big pattern is cut into pages
with hard edges. Commercial charts usually repeat a row across the seam so you can line pages
up by eye. Easy either way — and it's a change to `planTiles` and nothing else.

Note the dwarvish fighter fits on **one** page at the reference scale, so this only bites on
larger sprites.

---

## Where things stand

- **Milestone 2:** done, bar the symbol spike (#30).
- **Milestone 3:** #32 (export font), #33 (PNG export), #34 (chart pages) built.
  Remaining: #35 (cover + floss key), #36 (export over IPC), then #28.
