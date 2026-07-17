# Decisions pending — the ones that need Gemma, not code

The queue of calls that a human has to make. Nothing here blocks the build; it is what the
build is waiting on to be *finished*, and a couple of items have been sitting in "pending"
since Milestone 2.

Roughly in order of how much they matter. Tick things off as they're decided, and move the
outcome into `design.md` — this file is a queue, not a record.

> **Everything you need to look at is in [`../uat/`](../uat/), and `uat/README.md` tells you
> what to do with it.** You should never need to dig through a chat log to pick this up.
> Regenerate the artefacts any time with `npm run uat`.

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

### 1.A Gemma's answer — recorded in `design.md` §5.3

 - **D1** Can you give us some tests for inverse-density and stability? Also worth trying, interleaving distinct with inverse-density (so most distinct glyph, then least dense, then second most distinct, etc.)
 - **D2** Don't really care about churn
 - **D3** Worth bringing back distinct numerals, and other glyphs from question 3.
 - **D4** (was there a D4 question somewhere?) — yes: it's question 3 below. Bundling the export font (#32) is done; the still-open half of D4 is whether to redesign the glyph set around the wider pool that opens, which is exactly question 3.
 - **D5** Yes, it should use the same set.

 What failed UAT: we are not happy with the range of glyphs - it should be bigger but still distinct. I think this is dealt with in question 3.

**Status:** D2, D3, D5 decided; the **shade-ramp idea is now rejected** (see 1.B); **D1 is
the one open call** (see 1.C).

### 1.B Decided — no shade ramps (2026-07-17)

**We are not using different shades as symbols.** Symbols must be told apart by **shape**.
Distinct *fills* are fine when each reads as its own mark (solid vs outline, half-fill `◐`,
crosshatch `▦`), but a graded ink ramp — `░ ▒ ▓ █`, or circle fill-states used as a scale —
is out: reading *how much* ink a cell has while counting stitches is exactly the work a
symbol should save. This also kills value-shading (glyph darkness standing in for the
colour). A demonstration is what settled it. Logged in `design.md` §5.3 (membership rule 1).
Consequence: inverse-density (below) can't lean on a ramp to fix its faint glyphs — it stands
or falls on the shape glyphs it already has.

### 1.C ▶ OPEN DECISION — which assignment rule? (D1)

Built, measured and rendered on the real citizen (k=49) and scout (k=20) charts, in the
export font, at true cell size. **Pick one:**

| option | what it does | measured (citizen, worst 10×10 block) | the catch |
| --- | --- | --- | --- |
| **distinctness** (today) | boldest glyph → biggest area | 0.239 — the blob | crisp per-glyph, but rich sprites go solid-black |
| **inverse-density** | faintest glyph → biggest area | **0.099** (~2.4× flatter) | big areas get faint, letter-like glyphs that are less distinct from each other |
| **interleaved** | most-distinct, then least-dense, alternating | 0.302 — no better | keeps a bold anchor but doesn't fix the worst block |

The metric favours **inverse-density**; the open question is whether its faint glyphs stay
comfortable to *stitch from* now that the ramp fallback is gone. That's an eyes-on judgement
— the comparison artifact is the thing to look at. Regenerate the data with
`npm run assign:compare`.

**Your call:** _______________  ·  _(my recommendation: inverse-density, but it's your chart)_

---

## 2. The print test — needs a printer and your eyes — [#28]

**Now unblocked, and everything you need is sitting in `uat/`:**

- **`uat/chart-symbol.pdf`** — a real black-and-white chart from the real export path:
  embedded DejaVu, real A4, 2.361 mm cells, 4.82 pt glyphs. **This is the authoritative one.**
- **`uat/glyph-legibility-test.pdf`** — the systematic drill: a 100mm calibration ruler, the
  set at four sizes, the marginal pairs side-by-side *and* separated, a blind test with a key.
  Predates the export, so it renders in Chromium's fonts — treat it as the drill, not the
  authority.

**Print at 100% / Actual Size.** Anything else rescales the page and voids the whole exercise.
`uat/README.md` walks through what to judge.

Three letter pairs are unvalidated on paper: **`C`/`G`, `E`/`F`, `P`/`R`.**

This has real teeth: **the colour cap and the glyph count are the same number (37).** If a
pair fails, the maximum number of colours a pattern can use drops by one for each glyph lost.
A chart cannot show more colours than it has symbols to name.

### 2.A Gemma's answer

We will revisit the print test with the new design tests for question 3.

**Status: deferred, not decided.** #28 stays open but blocked behind question 3's
glyph-pool work — no point judging marginal pairs in a set about to be redesigned. Noted
in `design.md` §8.

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

### 3.A Gemma's answer

We would like to see more glyphs, as it makes the stitching project more enjoyable. If there is some design work that Claude can help with before going into coding that would be good for us to experiment with different ideas. If it's easier to code though rather than present mock-ups, then do that.

**Status: partly done.** The **D3 glyph additions are implemented** on branch
`feature/widen-glyph-set` — the set grew from 37 to a provisional **49** (restored numerals
`3 4 7`, card suits `♥ ♣ ♦ ♠`, one hatched square `▦`, print marks `† ‡ § ¶`), which lifted
default coverage from 93.0% to 99.4% of sprites. Added generously on the understanding that
the print test (#28) culls the blob-collisions (`♦`/`◆`, `♠`/`▲`) later. The interactive
glyph‑pool explorer that informed the picks is the artefact from this session.

**Ruled out (2026-07-17): shade/ink ramps.** The other big seam the bundled font opened was
graded ramps (`░ ▒ ▓ █`, circle fill-states). Gemma has rejected these — symbols must differ
by shape, not by amount of ink (see 1.B). So the remaining growth is a slow hunt for
genuinely distinct marks, not a ramp switch. **What's left open here** is only whether to keep
hunting for more distinct silhouettes, which can wait for the print test (#28) to first tell
us which of the current 49 survive.

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

### 4.A Gemma's answers

 - **Default colour count** We like the way the app does it currently. The sprite's maximum colours should be the cap for the slider.
 - **Distribution** I've updated github project to have some more milestones. The non-numbered milestones are for after first release. First release is Milestones 1-4. So packaging can come after we have passed UAT for milestones 2 and 3 and closed them off.

**Status: resolved.** Recorded in `design.md` §5.2 (default colour count) and §9
(packaging gated on M2/M3 UAT). GitHub already has the milestone structure this
describes — "Quality of life features" and "Pattern Keeper export" are the two
non-numbered post-release milestones, Milestones 1–4 are first release. Nothing further
needed here.

---

## 5. Page-overlap margin (wait until you've seen a printed chart)

Should tiled chart pages **overlap** by a row or two? Right now a big pattern is cut into pages
with hard edges. Commercial charts usually repeat a row across the seam so you can line pages
up by eye. Easy either way — and it's a change to `planTiles` and nothing else.

Note the dwarvish fighter fits on **one** page at the reference scale, so this only bites on
larger sprites.

### 5.A Gemma's answer

I've added this to the Quality of Life milestone for after first release.

**Status: resolved.** Confirmed on GitHub — #49 sits in the "Quality of life features"
milestone already. Nothing further needed here.

---

## Where things stand

**Milestones 2 and 3 are built**, but not yet closed. Every coding task is merged; the app
browses sprites, converts them to DMC floss, reduces the palette live on a slider, and
exports both a PNG and a printable PDF chart. See the
[sprint review](reviews/sprint-review-m2-m3.html).

Items 4 and 5 above are now resolved and folded into `design.md`. What's left open:

| | | |
| --- | --- | --- |
| **#30** | Design-explore the symbol set and its assignment rule (D1 comparative renders + D3/D4 wider glyph pool) | **the next thing to work on** — question 3 |
| **#28** | Print the chart, judge `C`/`G`, `E`/`F`, `P`/`R` | deferred until #30's glyph work lands |
| **#53** | Trim transparent border before charting | small, unrelated to the above — still open on Milestone 2 |
| #45–#48, #54 | Assorted Milestone 3 export polish | open, unrelated to the decisions above |

Milestones 2 and 3 close once their open issues are cleared, which unblocks **Milestone 4 —
packaging** (an installer, decided in item 4 above to wait for exactly this).

## Convention

Anything needing a human verdict gets an artefact in **`uat/`**, regenerable with
`npm run uat`, and a line in this file. Neither should ever require reading a chat log to
make sense of.
