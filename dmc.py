"""DMC floss color reference table and nearest-match lookup.

The bundled dmc_colors.csv is a community-sourced chart, not an
official DMC export -- treat thread NAMES as indicative and double
check the printed DMC CODE on your floss skein at checkout, since
that's the part that actually has to match. If you have a more
complete/official list (e.g. exported from cross-stitch software),
just replace dmc_colors.csv with the same three columns
(code,name,hex) and everything else keeps working.
"""
import csv
import os

DMC_CSV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dmc_colors.csv")


def load_dmc_colors(path=DMC_CSV_PATH):
    """Load the DMC reference table into a list of color dicts.

    If the same code appears more than once in the CSV, the LAST row
    wins (a plain dict assignment does this naturally). That's a
    simple, uniform rule rather than per-row guesswork.
    """
    colors = {}
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            code = row["code"].strip()
            name = row["name"].strip()
            hexval = row["hex"].strip().lstrip("#")
            r, g, b = int(hexval[0:2], 16), int(hexval[2:4], 16), int(hexval[4:6], 16)
            colors[code] = {
                "code": code,
                "name": name,
                "hex": "#" + hexval.upper(),
                "rgb": (r, g, b),
            }
    return list(colors.values())


def _redmean_distance(c1, c2):
    """Approximate perceptual color distance (the "redmean" formula).

    Noticeably better than plain Euclidean RGB distance for picking
    matching thread colors, without needing a full Lab conversion.
    """
    r1, g1, b1 = c1
    r2, g2, b2 = c2
    rmean = (r1 + r2) / 2
    dr, dg, db = r1 - r2, g1 - g2, b1 - b2
    return (
        (2 + rmean / 256) * dr * dr
        + 4 * dg * dg
        + (2 + (255 - rmean) / 256) * db * db
    )


def nearest_dmc(rgb, palette):
    """Return the palette entry closest to the given (r, g, b)."""
    best, best_dist = None, float("inf")
    for entry in palette:
        d = _redmean_distance(rgb, entry["rgb"])
        if d < best_dist:
            best_dist, best = d, entry
    return best
