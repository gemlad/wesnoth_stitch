"""Image -> cross-stitch pattern conversion.

Pipeline: autocrop transparent margins -> downsample to the target
stitch grid -> cluster colors with k-means -> match each cluster to
the nearest DMC thread.
"""
import numpy as np
from PIL import Image

from dmc import nearest_dmc

ALPHA_THRESHOLD = 40  # pixels more transparent than this are left unstitched


def autocrop(img):
    """Crop away fully-transparent margins around the artwork."""
    arr = np.array(img.convert("RGBA"))
    alpha = arr[:, :, 3]
    rows = np.where(alpha.max(axis=1) > 0)[0]
    cols = np.where(alpha.max(axis=0) > 0)[0]
    if len(rows) == 0 or len(cols) == 0:
        return img
    return img.crop((int(cols[0]), int(rows[0]), int(cols[-1]) + 1, int(rows[-1]) + 1))


def kmeans(pixels, k, iterations=8, seed=0):
    """Simple, dependency-free k-means clustering in RGB space."""
    rng = np.random.default_rng(seed)
    n = len(pixels)
    k = max(1, min(k, n))
    idx = rng.choice(n, size=k, replace=False)
    centers = pixels[idx].astype(float)
    assignments = np.zeros(n, dtype=int)
    for _ in range(iterations):
        dists = ((pixels[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2)
        assignments = dists.argmin(axis=1)
        for c in range(k):
            mask = assignments == c
            if mask.any():
                centers[c] = pixels[mask].mean(axis=0)
    return centers, assignments


def build_pattern(image_path, stitch_width, num_colors, dmc_palette, autocrop_image=True):
    """Convert an image file into a stitch-pattern grid.

    Returns a dict with:
      grid        -- 2D int array, cluster index per stitch (-1 = unstitched)
      used_colors -- DMC entries actually used, most-frequent first
      counts      -- stitch count per entry in used_colors (same order)
      width/height -- stitch grid dimensions
    """
    img = Image.open(image_path).convert("RGBA")
    if autocrop_image:
        img = autocrop(img)

    stitch_height = max(1, round(stitch_width * img.height / img.width))
    small = img.resize((stitch_width, stitch_height), Image.LANCZOS)
    arr = np.array(small)

    rgb = arr[:, :, :3].reshape(-1, 3).astype(float)
    alpha = arr[:, :, 3].reshape(-1)
    stitched_mask = alpha > ALPHA_THRESHOLD

    if not stitched_mask.any():
        raise ValueError("This image has no non-transparent pixels to stitch.")

    centers, cluster_assignments = kmeans(rgb[stitched_mask], num_colors)
    dmc_matches = [nearest_dmc(tuple(c), dmc_palette) for c in centers]

    # Several clusters can land on the same nearest DMC thread (common when
    # num_colors is higher than the image's actual color variety) -- merge
    # those so the floss key doesn't list the same thread twice.
    counts_per_cluster = {}
    for a in cluster_assignments:
        counts_per_cluster[int(a)] = counts_per_cluster.get(int(a), 0) + 1

    code_to_clusters = {}
    for cluster_id, dmc_entry in enumerate(dmc_matches):
        code_to_clusters.setdefault(dmc_entry["code"], []).append(cluster_id)

    code_counts = {
        code: sum(counts_per_cluster.get(cid, 0) for cid in cluster_ids)
        for code, cluster_ids in code_to_clusters.items()
    }
    ordered_codes = sorted(code_counts, key=lambda c: -code_counts[c])
    used_colors = [dmc_matches[code_to_clusters[code][0]] for code in ordered_codes]
    used_counts = [code_counts[code] for code in ordered_codes]

    cluster_to_new_index = {}
    for new_idx, code in enumerate(ordered_codes):
        for cid in code_to_clusters[code]:
            cluster_to_new_index[cid] = new_idx

    full_assignments = np.full(rgb.shape[0], -1, dtype=int)
    full_assignments[stitched_mask] = cluster_assignments
    grid = full_assignments.reshape(stitch_height, stitch_width)
    grid = np.vectorize(lambda v: cluster_to_new_index.get(int(v), -1), otypes=[int])(grid)

    return {
        "grid": grid,
        "used_colors": used_colors,
        "counts": used_counts,
        "width": stitch_width,
        "height": stitch_height,
    }
