# UAT artefacts

Things that need a human, a printer, and a verdict — not a test runner.

Regenerate with `npm run uat:chart` (optionally `npm run uat:chart -- path/to/sprite.png`).
They are checked in so you can look at them without a build, but they are **outputs, not
sources**: if the chart code changes, regenerate rather than trusting these.

## The charts

Both are the dwarvish fighter (`units/dwarves/fighter.png`), 72×72, at its own 31 distinct
DMC colours — one A4 page, **2.361 mm per cell, 4.82 pt glyphs**.

| File | What it is |
| --- | --- |
| `chart-both.pdf` | The working chart you'd actually stitch from — colour underneath, glyph on top. |
| `chart-symbol.pdf` | The **black-and-white** chart. This is the one that matters for #28. |

## What to judge (#28)

**Print at 100% / Actual Size.** Any "fit to page" and the scale — the entire point — is
void. Then check the printed cell really is ~2.36 mm; if it isn't, the print scaled and the
verdict is worthless.

On `chart-symbol.pdf`, where the glyph is the *only* thing naming a floss colour:

1. **The marginal pairs.** `C`/`G`, `E`/`F`, `P`/`R` are the unvalidated survivors of the
   symbol set (§5.3). Can you tell them apart in a cell, at speed, without squinting?
2. **Anything else that muddies.** The set was checked at 9 px on screen, never on paper.
3. **The chart-level question** (this is #30, not #28): the four solid glyphs land on the
   four largest colour areas, so the densest regions go darkest. Does the chart read as a
   picture, or as a smudge?

**If a pair fails, `MAX_COLOUR_COUNT` drops by one for each glyph removed** — §8 is blunt
that the glyph count and the colour cap are the same number. Record the verdict on #28 and
feed it into #30.
