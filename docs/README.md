# Documentation

| Doc | What it's for |
| --- | --- |
| [design.md](design.md) | **The** design document. Architecture, the conversion pipeline, and the decisions behind it — including the measurements those decisions were made from. Section numbers (§5.2, §5.3, …) are referenced from code comments and issues, so they're worth keeping stable. |
| [milestone-1-tasks.md](milestone-1-tasks.md) | Task breakdown for Milestone 1 (Electron + Vite + React scaffold, sprite browser). Complete. |
| [milestone-2-tasks.md](milestone-2-tasks.md) | Task breakdown for Milestone 2 (conversion pipeline: DMC mapping, colour reduction, Konva preview). Complete bar the symbol spike (#30). |
| [milestone-3-tasks.md](milestone-3-tasks.md) | Task breakdown for Milestone 3 (export: PNG + printable PDF chart with floss key). In progress. |
| [decisions-pending.md](decisions-pending.md) | The queue of calls that need a human, not code. Nothing in it blocks the build; it's what the build is waiting on to be *finished*. A queue, not a record — decided things move into `design.md`. |
| [reviews/](reviews/) | Sprint reviews, as self-contained HTML — open one in a browser straight from a checkout, no build and no network. |
| [archive/design-v1.md](archive/design-v1.md) | The superseded Python-prototype-era design doc. History only. |

## Conventions

Design decisions live in `design.md`, not in scattered notes. When a decision is
made or revised, update the relevant section there and reference it by number
(e.g. "§5.3") from the code and the issue that changed it. Open questions that
need deciding belong in a GitHub issue labelled `spike`, not in a standalone
document — a design doc that disagrees with the code is worse than no doc.
