#!/usr/bin/env python3
"""
Thread & Pixel: convert Battle for Wesnoth art assets into cross-stitch patterns.

Wesnoth's artwork is open source (GPL v2+ / CC-BY-SA 4.0) -- see
https://wiki.wesnoth.org/Wesnoth:Copyrights. This tool reads public files
from the official github.com/wesnoth/wesnoth repository; no account or
API key needed (an optional GITHUB_TOKEN env var just raises the rate limit).

Usage:
    python main.py            # interactive: pick a category, then a file
    python main.py --refresh  # force re-fetch the GitHub file list
"""
import argparse
import os

import wesnoth_fetch
from dmc import load_dmc_colors
from convert import build_pattern
from chart import render_preview_png, render_full_chart_pdf

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")


def choose_from_list(items, prompt, formatter=str, page_size=25):
    """Numbered picker with paging ('m') and substring search ('s<text>')."""
    all_items = items
    filtered = items
    i = 0
    while True:
        page = filtered[i:i + page_size]
        if not page and i > 0:
            i = 0
            page = filtered[i:i + page_size]
        for n, item in enumerate(page, start=i + 1):
            print(f"  {n}. {formatter(item)}")
        more = i + page_size < len(filtered)
        hint = "'m' for more, " if more else ""
        choice = input(f"{prompt} ({hint}'s<text>' to search): ").strip()
        if choice.lower() == "m" and more:
            i += page_size
            continue
        if choice.lower().startswith("s"):
            term = choice[1:].strip().lower()
            filtered = [it for it in all_items if term in formatter(it).lower()] if term else all_items
            i = 0
            if not filtered:
                print("No matches -- showing the full list again.")
                filtered = all_items
            continue
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(filtered):
                return filtered[idx]
        except ValueError:
            pass
        print("Please enter a valid number, 'm', or 's<search term>'.")


def interactive_flow():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    dmc_palette = load_dmc_colors()
    print(f"Loaded {len(dmc_palette)} DMC reference colors.\n")

    paths = wesnoth_fetch.get_image_paths()
    categories = wesnoth_fetch.list_categories(paths)
    print(f"Found {len(paths)} image assets across {len(categories)} categories.\n")

    cat_name, _ = choose_from_list(
        categories, "Pick a category", formatter=lambda kv: f"{kv[0]} ({kv[1]} files)"
    )

    prefix = wesnoth_fetch.IMAGE_ROOT + cat_name + "/"
    matches = [p for p in paths if p.startswith(prefix)]
    print(f"\n{len(matches)} files in '{cat_name}':")
    chosen_path = choose_from_list(
        matches, "Pick a file", formatter=lambda p: p[len(wesnoth_fetch.IMAGE_ROOT):]
    )

    print(f"\nDownloading {chosen_path} ...")
    local_path = wesnoth_fetch.download(chosen_path)
    print("Saved to", local_path)

    width_in = input("\nStitch width [default 50]: ").strip()
    width = int(width_in) if width_in else 50
    colors_in = input("Number of thread colors [default 20]: ").strip()
    num_colors = int(colors_in) if colors_in else 20

    print("\nBuilding pattern...")
    pattern = build_pattern(local_path, width, num_colors, dmc_palette)

    base_name = os.path.splitext(os.path.basename(chosen_path))[0]
    preview_path = os.path.join(OUTPUT_DIR, f"{base_name}_preview.png")
    render_preview_png(pattern, preview_path)
    print(f"\nQuick preview saved: {preview_path}")
    print(f"({pattern['width']} x {pattern['height']} stitches, {len(pattern['used_colors'])} colors)")

    export = input("\nExport the full printable chart (PDF with symbols + floss key)? [Y/n]: ").strip().lower()
    if export != "n":
        pdf_path = os.path.join(OUTPUT_DIR, f"{base_name}_pattern.pdf")
        render_full_chart_pdf(
            pattern, pdf_path,
            title=base_name.replace("-", " ").replace("_", " ").title(),
        )
        print(f"Full chart saved: {pdf_path}")


def main():
    parser = argparse.ArgumentParser(description="Convert Wesnoth art into cross-stitch patterns.")
    parser.add_argument(
        "--refresh", action="store_true",
        help="Re-fetch the GitHub file list instead of using the day-old cache.",
    )
    args = parser.parse_args()

    if args.refresh:
        wesnoth_fetch.get_image_paths(force_refresh=True)

    again = True
    while again:
        try:
            interactive_flow()
        except KeyboardInterrupt:
            print("\nInterrupted.")
            break
        except Exception as e:
            print(f"\nSomething went wrong: {e}")
        again = input("\nConvert another image? [y/N]: ").strip().lower() == "y"


if __name__ == "__main__":
    main()
