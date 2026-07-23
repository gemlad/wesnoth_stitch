/**
 * The Wesnoth artwork licence notice, in one place (#47).
 *
 * Wesnoth's unit art is GPL v2+ / CC-BY-SA 4.0, and the licence frequently *requires* credit
 * on anything derived from it. It has to appear on every exported page and on-screen in the
 * app — so the wording lives here, shared, rather than being retyped per surface where two
 * copies could drift out of sync.
 */

/** The notice, as two lines: the statement, then where to read the terms. */
export const LICENCE_LINES: readonly string[] = [
  'Wesnoth artwork is licensed GPL v2+ / CC-BY-SA 4.0 by the Battle for Wesnoth project.',
  'https://wiki.wesnoth.org/Wesnoth:Copyrights'
]

/** The copyrights page the notice points at, on its own for a link. */
export const LICENCE_URL = 'https://wiki.wesnoth.org/Wesnoth:Copyrights'

/**
 * The app's *own* licence, shown in-app alongside the artwork notice (#77).
 *
 * Kept separate from {@link LICENCE_LINES} on purpose: the code licence (who may reuse
 * Wesnoth Stitch itself) and the artwork attribution (crediting Wesnoth's sprites) answer
 * two different questions and must not be conflated — see docs/decisions-licence-2026-07-23.md.
 * The app is GPL v3+, which sits comfortably alongside Wesnoth's own GPL art.
 */
export const APP_LICENCE_LINES: readonly string[] = [
  'Wesnoth Stitch is free software under the GNU GPL v3 or later — see LICENSE and THIRD-PARTY-NOTICES.',
  'Bundled DejaVu Sans is under the Bitstream Vera Fonts License; DMC colour data is community-sourced.'
]
