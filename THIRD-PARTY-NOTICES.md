# Third-Party Notices

Wesnoth Stitch's own source code is licensed under the MIT License (see
[`LICENSE`](LICENSE)). It also relies on the third-party components below, each under
its own licence. This file is the notice required by those licences, and it ships with
the distributed application.

## Bundled assets

### DejaVu Sans (font)
- **Where:** `resources/fonts/DejaVuSans.ttf`, embedded in every exported PDF chart.
- **Licence:** **Bitstream Vera Fonts License** (a permissive, redistribution-friendly
  licence — *not* the OFL, despite an old note once in this repo). The full text ships
  alongside the font at `resources/fonts/LICENSE.txt`.
- **Condition worth knowing:** a *modified* face may not keep the "DejaVu"/"Vera" names.
  We ship the font unmodified, so this does not apply.

### DMC floss colour reference data
- **Where:** compiled into `src/shared/colour/dmc-data.ts` (generated from
  `prototype/dmc_colors.csv` by `scripts/gen-dmc-data.mjs`).
- **Provenance:** a **community-sourced** table of DMC thread `code, name, hex`, carried
  over from the Python prototype. It is *not* an official DMC export. It is factual colour
  reference data used to match sprite pixels to purchasable floss. Treat thread **names** as
  indicative and trust the **code** printed on the skein. "DMC" is a trademark of its owner;
  Wesnoth Stitch is not affiliated with or endorsed by DMC.

## Processed artwork (downloaded at runtime, not bundled)

### Battle for Wesnoth unit sprites
- **Where:** downloaded on first run to the app's user-data folder (see
  [`docs/decisions-sprite-acquisition-2026-07-23.md`](docs/decisions-sprite-acquisition-2026-07-23.md));
  **not** shipped inside the installer.
- **Licence:** GNU **GPL v2 or later**, or **CC-BY-SA 4.0**, at your option — as published by
  the Wesnoth project. See <https://wiki.wesnoth.org/Wesnoth:Copyrights>.
- **Obligation:** cross-stitch charts exported from this art are derivative works and must
  credit the Battle for Wesnoth project. The app stamps this attribution on every chart page
  (`src/shared/licence.ts`).

## npm dependencies

The application is built on the npm ecosystem. Every dependency in the resolved tree is under
a **permissive** licence — a scan of the installed tree found only MIT, ISC, Apache-2.0, BSD
(2- and 3-Clause), BlueOak-1.0.0, 0BSD, WTFPL, Python-2.0 and CC-BY-4.0 (build-time data);
**no copyleft (GPL/LGPL) licences are present**, so none constrain Wesnoth Stitch's own MIT
licence. Notable runtime components include **Electron**, **React**, **Konva**, **culori**,
**pdf-lib**/**@pdf-lib/fontkit** and **pngjs**, all under the MIT License. Each package's full
licence text is in its own directory under `node_modules/` in a source checkout; regenerate a
complete manifest with a tool such as `npx license-checker --summary`.
