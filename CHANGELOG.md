# Changelog

Notable changes to Wesnoth Stitch, newest first. Written for the people who use the app —
what changed on screen and on the printed chart — rather than for the code.

Versions follow [semver](https://semver.org); the format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Add to **Unreleased** as work lands
on `main`, and rename that heading to the version and date when the release is cut
(see [`docs/RELEASING.md`](docs/RELEASING.md)).

## [Unreleased]

_Nothing yet._

## [1.4.1] — 2026-09-08

One fix, for anyone who takes a chart out of the app and into other cross-stitch software.

### Fixed

- **OXS exports now start at 0,0** (#114). Every stitch in a `.oxs` file was written one column
  right and one row down, so the chart sat off by one against the size the file itself declares.
  Programs that read the file place the pattern correctly now.

## [1.4.0] — 2026-08-23

Three small things at the desk: the fabric you picked stays picked, there is a way back to
the default, and you can finally see what turning the colour slider down actually costs.

### Added

- **See the colour reduction at sprite size** (#108). Turn the Colours slider down and a second
  little picture appears next to the sprite in the right-hand panel: the pattern, drawn at the
  same size the unit is drawn at in the game, captioned with how many floss colours are left.
  The chart in the middle is magnified ten times or more, where every reduction looks like
  butchery — this is the same reduction at the size you will actually be looking at it, so you
  can decide whether the loss is one you mind. It only appears when there is a reduction to
  see; at full colour the panel shows the sprite alone, as before.
- **A "Reset" beside the fabric swatch** (#51). Puts the fabric back to unbleached Aida, the
  colour the app starts on, without you having to hunt for it in the colour picker. It greys
  out while you are already on that colour, so it is always there to be found but never
  pretends to do something.

### Changed

- **The fabric colour now stays put when you pick another sprite** (#50). Choosing your cloth
  is a decision about the piece you are making, not about one unit, and it used to be thrown
  away the moment you clicked a different sprite. It no longer is. How you are _reading_ the
  chart — Colour/Symbol/Both, and the flip — still starts fresh on each sprite, because those
  are decisions about the chart in front of you.

## [1.3.0] — 2026-08-21

One feature: the chart can be stitched from your phone, with the symbols you already know.

### Added

- **Export a chart for the Pattern Keeper app** (#55). A third export button, "Chart PDF (PK)",
  saving `<sprite>_chart_PK.pdf` — a PDF laid out so the Android app
  [Pattern Keeper](https://patternkeeper.app/) can import it, so you can stitch off a phone and
  tick the stitches off as you go, **with the symbols you see on your printed chart**. That is
  what it adds over the `.oxs` export, which reaches the same app but lets it pick its own
  symbols. It is a plain black-and-white chart — symbols on bare paper, then a floss key of
  symbol, DMC number and colour name — because the app paints the colours itself. Your
  printable chart is untouched and still exports exactly as before; this is a second file, not
  a setting. When Pattern Keeper asks about page overlap on import, the answer is **none**: the
  pages do not repeat a row or a column.

## [1.2.0] — 2026-08-20

One feature: the chart can leave the app as data, not just as paper.

### Added

- **Export the chart as `.oxs`** (#94). A second export button, beside "Chart PDF", saving the
  pattern in the open cross-stitch format that Pattern Keeper, KXStitch, WinStitch and friends
  read — so you can stitch from the app you already use and tick the stitches off as you go,
  instead of only from paper. The file is named after the sprite, and carries what the chart
  carries: the fabric colour, every DMC code, and the flip if you have it on. Whole cross
  stitches only, which is all a sprite ever is. The symbols, though, will be that program's own
  and not the ones on your PDF — each program draws from its own symbol set and there is no way
  to hand it ours, so the file numbers the colours instead and lets it choose. Every colour
  still gets a symbol of its own, and the Wesnoth Stitch one is noted against it in the file if
  you need to match the two up.

## [1.1.0] — 2026-07-29

A quality-of-life release against the shipped app: the printed chart got the furniture it was
missing, and the app got two things you asked for at the desk. No change to how patterns are
generated — a chart exported by 1.0.0 and one exported by 1.1.0 tell you to stitch the same
thing.

### Added

- **Search the sprite set** (#66). A search box above the sprite list, filtering as you type
  over both the sprite name and its faction folder. Terms are ANDed, so `dwarv fight` finds the
  dwarvish fighter without you having to know which part comes first. Empty folders drop out of
  the list, `Escape` clears the box, and a sprite that scrolls out of view because of a search
  stays selected and stays charted.
- **Flip the pattern left-to-right** (#56). A toggle beside "Fit" in the pattern view, for a
  unit that should face the other way — into the page, or towards its pair in a set of two. The
  preview and the exported PDF always agree, and the floss key is unaffected: mirroring moves
  stitches, not colours.
- **The sprite's name on every page but the cover** (#91). A loose sheet of glyphs off the
  floor now says what it belongs to. It shares the existing heading line, so the chart tiles
  and page count are exactly as before; long names are ellipsised rather than allowed to
  collide with the heading.
- **Page numbers on every page but the cover** (#92). The cover counts as page 1 but carries no
  number, so the key reads "Page 2 of 12" and the printed numbers match your PDF viewer's
  counter — which is what you reach for when reprinting the page you dropped.

### Changed

- **The floss key is sorted by DMC code** (#90) instead of by how much of each colour the
  pattern uses. Codes sort by value, so 310 comes before 422 comes before 3865, and the three
  named flosses (`B5200`, `BLANC`, `ECRU`) sort alphabetically at the end. Each row keeps the
  symbol its colour has on the chart — the ordering is display-only and cannot re-letter
  anything.
- **The cover preview prints at true size on 14-count Aida** (#68) — hold the page against a
  square of fabric and you are looking at the finished piece. Patterns too large for the space
  fall back to fitting the page as before, and the cover now states which of the two you are
  looking at, beside the Preview heading. It never enlarges a small sprite. Preview resolution
  now follows the drawn size (~300dpi) so a full-page preview stays sharp.

### Fixed

- **The cover stated the sprite's dimensions rather than the pattern's** (#99) when a chart was
  produced by the UAT scripts. A pattern trimmed to its content could advertise itself as
  72 × 72 when it was 39 × 31, and the four finished-size figures beneath it were wrong to
  match — telling you to buy nearly twice as much fabric in each direction. The cover now
  measures the pattern it is drawing and cannot be handed a size at all. The app itself always
  passed the correct dimensions, so no chart exported from the app was affected.
- **Symbol-only charts printed white glyphs on white paper** when a dark fabric was selected
  (#75). A symbol-only chart is a black-and-white print, so its glyphs are now always black;
  colour-and-symbol charts still contrast against the floss.
- **"Update sprites" gave no sign it had worked** — it now confirms with "Sprites up to date
  (Wesnoth _version_)".
- **First-run wording** corrected in-app and in the README: sprites are downloaded from this
  project's own hosted copy of the Wesnoth art, not from the Wesnoth project directly.

### Documentation

- Screenshot of the app added to the README (#74), plus a statement on how the project was
  developed and tested.
- [`docs/v1.1-plan.md`](docs/v1.1-plan.md) added; the four v1 milestone breakdowns moved to
  [`docs/archive/`](docs/archive/) as unmaintained history.

## [1.0.0] — 2026-07-23

First public release — a Windows installer on the Releases page.

### Added

- Convert any Battle for Wesnoth unit sprite into a cross-stitch pattern: transparent border
  trimmed, pixels matched to the DMC floss catalogue, and one distinct symbol assigned per
  colour.
- Sprite browser over the full Wesnoth unit set, grouped by faction folder, with the set
  downloaded on first run and an "update sprites" action thereafter.
- Live pattern preview alongside the raw sprite, with fabric-colour and chart-mode
  (colour, symbol, or both) settings.
- Printable PDF chart: cover page with the finished sizes at four fabric counts and an embedded
  colour preview, a floss key, and the chart tiled across A4 pages at a 52-cell grid with
  centre markers.
- Licensing throughout: GPL-3.0-or-later, with the Wesnoth art attribution on every printed
  page, on screen, and in `THIRD-PARTY-NOTICES.md`.

[Unreleased]: https://github.com/gemlad/wesnoth_stitch/compare/v1.4.1...HEAD
[1.4.1]: https://github.com/gemlad/wesnoth_stitch/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/gemlad/wesnoth_stitch/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/gemlad/wesnoth_stitch/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/gemlad/wesnoth_stitch/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/gemlad/wesnoth_stitch/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/gemlad/wesnoth_stitch/releases/tag/v1.0.0
