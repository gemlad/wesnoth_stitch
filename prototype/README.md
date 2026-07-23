# Wesnoth Stitch — Python prototype

This is the **original Python prototype**, kept for reference. The project has been rewritten
as an Electron + TypeScript desktop app — see the [top-level README](../README.md) and
[`docs/`](../docs/) for the real thing. This CLI still runs, but it is not the shipped app.

## Setup

```bash
cd prototype
pip install -r requirements.txt
```

Needs Python 3.9+.

## Run

```bash
python main.py
```

This will:
1. Fetch the list of art files from GitHub (cached for a day after the first run).
2. Let you pick a **category** — `units`, `terrain`, `portraits`, `items`,
   `buildings`, `halo`, etc. (whatever folders exist under `data/core/images/` in the
   Wesnoth repo).
3. Let you pick a specific **file** within that category (type `s<text>` to search by name,
   `m` to see more).
4. Ask for a **stitch width** (how many stitches wide the finished pattern should be — try
   40–60 for a small sprite, more for detailed art) and a **number of thread colors**
   (10–25 is typical).
5. Save a quick `_preview.png` so you can see the result immediately.
6. Ask whether to export the full `_pattern.pdf` — a multi-page printable chart with stitch
   symbols, gridlines (bold every 10th line), a floss key listing every DMC color used and
   how many stitches it covers, and an estimated finished size at a few common Aida counts.

Both files land in `prototype/output/`.

Run `python main.py --refresh` to force a fresh fetch of the file list instead of using the
cached one (e.g. after a big Wesnoth art update).

## Notes & limitations

- **Scope**: this only looks at `data/core/images/` — the mainline game art. Campaign-specific
  art (`data/campaigns/<name>/images/`) isn't included; see the comment at the top of
  `wesnoth_fetch.py` to extend it.
- **DMC colors**: `dmc_colors.csv` is a community-sourced chart, not an official DMC export,
  and may have a few minor naming quirks. The hex/RGB values drive the color matching; treat
  the thread *names* as a convenience and double-check the printed **code** on the skein.
  Swap in a fuller list any time — the loader just needs three columns: `code,name,hex`.
- **GitHub rate limits**: unauthenticated requests are capped at 60/hour. The file-list fetch
  is cached for a day, so this is rarely an issue; if you do hit it, set a `GITHUB_TOKEN`
  environment variable with a personal access token (no special permissions needed).
- **Color matching** uses a perceptual "redmean" distance rather than plain RGB distance —
  noticeably better at picking sensible thread matches for skin tones and dark colors.
