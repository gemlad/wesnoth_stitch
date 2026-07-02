"""Fetch and cache Battle for Wesnoth art assets from the official GitHub repo.

Wesnoth's artwork is licensed under the GNU GPL v2+ or Creative Commons
BY-SA 4.0 -- see https://wiki.wesnoth.org/Wesnoth:Copyrights. This module
only reads public files from github.com/wesnoth/wesnoth; it doesn't need
any credentials.

Note on scope: this only looks at data/core/images/, which is where the
mainline unit, terrain, portrait, item, etc. art lives. Campaign-specific
art (data/campaigns/<name>/images/) isn't included -- that's a
deliberate scope cut to keep the category list manageable, but the same
fetch_paths/download functions would work for it with a different
IMAGE_ROOT if you want to extend this later.
"""
import json
import os
import time

import requests

REPO = "wesnoth/wesnoth"
BRANCH = "master"
TREE_API = f"https://api.github.com/repos/{REPO}/git/trees/{BRANCH}?recursive=1"
RAW_BASE = f"https://raw.githubusercontent.com/{REPO}/{BRANCH}/"
IMAGE_ROOT = "data/core/images/"
IMAGE_EXTS = (".png", ".webp")

CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "wesnoth_cache")
TREE_CACHE_FILE = os.path.join(CACHE_DIR, "tree_cache.json")
TREE_CACHE_MAX_AGE = 60 * 60 * 24  # 1 day, the asset list doesn't change often


def _ensure_cache_dir():
    os.makedirs(CACHE_DIR, exist_ok=True)


def _auth_headers():
    token = os.environ.get("GITHUB_TOKEN")
    return {"Authorization": f"token {token}"} if token else {}


def get_image_paths(force_refresh=False):
    """Return a sorted list of every image path under data/core/images/.

    The repo's full file tree is cached locally for a day so repeated
    runs don't hit GitHub's unauthenticated rate limit (60 requests/hour).
    """
    _ensure_cache_dir()
    if not force_refresh and os.path.exists(TREE_CACHE_FILE):
        age = time.time() - os.path.getmtime(TREE_CACHE_FILE)
        if age < TREE_CACHE_MAX_AGE:
            with open(TREE_CACHE_FILE, encoding="utf-8") as f:
                return json.load(f)

    print("Fetching the Wesnoth repository file list from GitHub (cached for a day after this)...")
    resp = requests.get(TREE_API, headers=_auth_headers(), timeout=30)
    if resp.status_code == 403:
        raise RuntimeError(
            "GitHub API rate limit hit (60 unauthenticated requests/hour). "
            "Wait a while and try again, or set a GITHUB_TOKEN environment "
            "variable with a personal access token to raise the limit."
        )
    resp.raise_for_status()
    tree = resp.json().get("tree", [])
    paths = sorted(
        item["path"]
        for item in tree
        if item.get("type") == "blob"
        and item["path"].startswith(IMAGE_ROOT)
        and item["path"].lower().endswith(IMAGE_EXTS)
    )
    if not paths:
        raise RuntimeError("No images found -- the repository layout may have changed.")
    with open(TREE_CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(paths, f)
    return paths


def list_categories(paths):
    """Top-level folders directly under data/core/images/, with file counts."""
    counts = {}
    for p in paths:
        rest = p[len(IMAGE_ROOT):]
        top = rest.split("/")[0]
        counts[top] = counts.get(top, 0) + 1
    return sorted(counts.items(), key=lambda kv: kv[0])


def download(path, force_refresh=False):
    """Download one asset (repo-relative path), caching it locally.

    Returns the local file path.
    """
    _ensure_cache_dir()
    local_path = os.path.join(CACHE_DIR, path.replace("/", os.sep))
    if not force_refresh and os.path.exists(local_path):
        return local_path
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    url = RAW_BASE + path
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    with open(local_path, "wb") as f:
        f.write(resp.content)
    return local_path
