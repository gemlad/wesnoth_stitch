"""Render a quick PNG preview and a full, printable PDF chart."""
from PIL import Image, ImageDraw
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages

SYMBOLS = list("\u25cf\u25b2\u25a0\u25c6\u2605\u271a\u2726\u273a\u273c\u25d6\u25d7\u2736"
               "\u25bc\u25e3\u25e2\u2666\u2715\u25cb\u25a1\u25c7\u2606\u271b\u2731\u2733"
               "\u25d0\u25d1\u273f\u2756\u25aa\u25b4\u25be\u25c2") + [chr(c) for c in range(0x2460, 0x2480)]

PAGE_MAX_STITCHES = 55  # keep each printed chart page readable


def render_preview_png(pattern, out_path, cell_px=12):
    """Fast colored-square preview, no symbols -- for a quick first look."""
    grid = pattern["grid"]
    h, w = grid.shape
    img = Image.new("RGB", (w * cell_px, h * cell_px), "#F4EFE3")
    draw = ImageDraw.Draw(img)
    for y in range(h):
        for x in range(w):
            idx = grid[y, x]
            if idx < 0:
                continue
            color = pattern["used_colors"][idx]["hex"]
            x0, y0 = x * cell_px, y * cell_px
            draw.rectangle([x0, y0, x0 + cell_px - 1, y0 + cell_px - 1], fill=color)
    img.save(out_path)
    return out_path


def _draw_chart_tile(ax, grid, x0, x1, y0, y1, used_colors, symbol_for):
    ax.set_xlim(x0, x1)
    ax.set_ylim(y1, y0)  # invert so row 0 is at the top
    ax.set_aspect("equal")
    ax.set_xticks(range(x0, x1 + 1, 10))
    ax.set_yticks(range(y0, y1 + 1, 10))
    ax.tick_params(labelsize=6)
    for y in range(y0, y1):
        for x in range(x0, x1):
            idx = grid[y, x]
            if idx < 0:
                continue
            ax.add_patch(plt.Rectangle((x, y), 1, 1, facecolor=used_colors[idx]["hex"], edgecolor="none"))
            ax.text(x + 0.5, y + 0.5, symbol_for[idx], ha="center", va="center", fontsize=5)
    for x in range(x0, x1 + 1):
        ax.axvline(x, color="black", linewidth=0.9 if x % 10 == 0 else 0.25, alpha=0.6)
    for y in range(y0, y1 + 1):
        ax.axhline(y, color="black", linewidth=0.9 if y % 10 == 0 else 0.25, alpha=0.6)


def render_full_chart_pdf(pattern, out_path, title="Wesnoth Cross-Stitch Pattern", aida_counts=(11, 14, 16, 18)):
    """Multi-page printable PDF: cover/stats, floss key, then tiled chart pages."""
    grid = pattern["grid"]
    h, w = grid.shape
    used_colors = pattern["used_colors"]
    counts = pattern["counts"]
    symbol_for = {i: SYMBOLS[i % len(SYMBOLS)] for i in range(len(used_colors))}

    with PdfPages(out_path) as pdf:
        # cover / stats page
        fig = plt.figure(figsize=(8.5, 11))
        fig.text(0.1, 0.92, title, fontsize=18, weight="bold")
        fig.text(0.1, 0.87, f"{w} x {h} stitches, {len(used_colors)} thread colors", fontsize=11)
        sizes = "\n".join(f"  {c}-count Aida: {w / c:.1f}\" x {h / c:.1f}\"" for c in aida_counts)
        fig.text(0.1, 0.6, "Approx. finished size:\n" + sizes, fontsize=10, va="top")
        fig.text(
            0.1, 0.05,
            "Wesnoth artwork is licensed GPL v2+ / CC-BY-SA 4.0 by the Battle for\n"
            "Wesnoth project (https://wiki.wesnoth.org/Wesnoth:Copyrights).",
            fontsize=7, color="gray",
        )
        pdf.savefig(fig)
        plt.close(fig)

        # floss key page(s)
        rows_per_page = 35
        for page_start in range(0, len(used_colors), rows_per_page):
            fig, ax = plt.subplots(figsize=(8.5, 11))
            ax.axis("off")
            ax.set_title("Floss Key", fontsize=14, weight="bold", loc="left")
            chunk = list(enumerate(used_colors))[page_start:page_start + rows_per_page]
            for row, (i, c) in enumerate(chunk):
                yy = 0.95 - row * (0.9 / rows_per_page)
                ax.add_patch(plt.Rectangle(
                    (0.02, yy - 0.01), 0.03, 0.02, transform=ax.transAxes,
                    facecolor=c["hex"], edgecolor="black", linewidth=0.3,
                ))
                ax.text(0.07, yy, symbol_for[i], transform=ax.transAxes, fontsize=8)
                ax.text(
                    0.12, yy, f"DMC {c['code']} - {c['name']} ({counts[i]} st.)",
                    transform=ax.transAxes, fontsize=8, va="center",
                )
            pdf.savefig(fig)
            plt.close(fig)

        # chart pages, tiled so each page prints legibly
        for y0 in range(0, h, PAGE_MAX_STITCHES):
            y1 = min(y0 + PAGE_MAX_STITCHES, h)
            for x0 in range(0, w, PAGE_MAX_STITCHES):
                x1 = min(x0 + PAGE_MAX_STITCHES, w)
                fig, ax = plt.subplots(figsize=(8.5, 11))
                _draw_chart_tile(ax, grid, x0, x1, y0, y1, used_colors, symbol_for)
                ax.set_title(f"Rows {y0}-{y1} / Cols {x0}-{x1}", fontsize=10)
                pdf.savefig(fig)
                plt.close(fig)
    return out_path
