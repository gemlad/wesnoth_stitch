# Documentation

## Current

| Doc | What it's for |
| --- | --- |
| [design.md](design.md) | **The** design document. Architecture, the conversion pipeline, and the decisions behind it — including the measurements those decisions were made from. Section numbers (§5.2, §5.3, …) are referenced from code comments and issues, so they're worth keeping stable. |
| [v1.1-plan.md](v1.1-plan.md) | The plan of action for the **v1.1** release: what each milestone issue means in code, the order, and what must not break. |
| [RELEASING.md](RELEASING.md) | The release runbook — version bump, local checks, `build:win`, publish. |

## The decision record

Dated records of calls that were made deliberately, kept because the code cites them by name
(`src/shared/licence.ts`, `src/main/sprites-source.ts`, `THIRD-PARTY-NOTICES.md`). Decisions
that shaped the *design* also live in `design.md`; these are the "why, and when, and on what
evidence" behind them.

| Doc | Decided |
| --- | --- |
| [decisions-agreed-2026-07-23.md](decisions-agreed-2026-07-23.md) | The human-verdict calls from Milestones 2–3 — symbol assignment, the colour cap, the M4 gate. Was `decisions-pending.md`; all of it is now settled. |
| [decisions-sprite-acquisition-2026-07-23.md](decisions-sprite-acquisition-2026-07-23.md) | How an installed app gets the sprite set: a self-hosted slim `units.tar.gz`, cached to `userData`. Killed the full-repo tarball (1.15 GB) and per-file download (7,266 requests) with measurements. |
| [decisions-licence-2026-07-23.md](decisions-licence-2026-07-23.md) | The project's own code licence, and the boundary between it and the Wesnoth artwork attribution the exports carry. |

## History

| Doc | What it's for |
| --- | --- |
| [reviews/](reviews/) | Sprint reviews, as self-contained HTML — open one in a browser straight from a checkout, no build and no network. |
| [archive/](archive/) | Superseded working documents: the v1 milestone task breakdowns (v1 shipped) and the prototype-era design doc. Not maintained. |

## Conventions

Design decisions live in `design.md`, not in scattered notes. When a decision is
made or revised, update the relevant section there and reference it by number
(e.g. "§5.3") from the code and the issue that changed it. Open questions that
need deciding belong in a GitHub issue labelled `spike`, not in a standalone
document — a design doc that disagrees with the code is worse than no doc.

Release plans (`v1.1-plan.md` and its successors) carry *rationale and sequencing* only.
**Live status is GitHub Issues** — no done/in-progress ticks in these files, because a
checklist in a doc goes stale the first time it isn't updated.
