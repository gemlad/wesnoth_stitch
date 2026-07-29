# Changelog

Notable changes to Wesnoth Stitch, newest first. Written for the people who use the app —
what changed on screen and on the printed chart — rather than for the code.

Versions follow [semver](https://semver.org); the format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Add to **Unreleased** as work lands
on `main`, and rename that heading to the version and date when the release is cut
(see [`docs/RELEASING.md`](docs/RELEASING.md)).

## [Unreleased]

_Nothing yet._

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

[Unreleased]: https://github.com/gemlad/wesnoth_stitch/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/gemlad/wesnoth_stitch/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/gemlad/wesnoth_stitch/releases/tag/v1.0.0
