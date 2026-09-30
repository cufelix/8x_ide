# Meanwhile panel

The half-tab shown while a Cursor coding agent runs. This is the black stage in `extension/media/panel.html`, measured and split into React components with Tailwind utilities.

The preview state is **both**: a centered column on a black field. Nothing else is on screen until video or a question is present.

## Regions

- **Stage.** Full-bleed black panel. A soft grey wash sits behind the column: a radial ellipse (80% by 60%, centered at 50% 35%) from `rgba(80, 80, 80, 0.28)` through `rgba(30, 30, 30, 0.12)` to transparent, plus a vertical gradient `#0a0a0a` → `#000` at 55% → `#050505`.
- **Column.** One vertical stack, centered in the stage. Max width 420px, padding 28px, gap 16px. Children fade up 10px over 420ms when they appear.
- **Video.** 16:9, only in Video and Both.
- **Question card.** Only in Ask and Both.
- **Mark.** “Meanwhile”, bottom left. 11px, letter-spacing 0.04em, color `rgba(228, 228, 228, 0.37)` at 55% opacity. Position 14px from the left, 12px from the bottom.
- **Preview toggles.** Bottom right, not shipping UI. Empty, Video, Ask, Both. 10px uppercase, 35% opacity, 90% on hover.

## Color

| Role | Value |
| --- | --- |
| Stage | `#000000` |
| Primary text | `rgba(228, 228, 228, 0.92)` |
| Secondary text | `rgba(228, 228, 228, 0.55)` |
| Muted text | `rgba(228, 228, 228, 0.37)` |
| Border | `rgba(228, 228, 228, 0.1)` |
| Hover fill | `rgba(228, 228, 228, 0.08)` |
| Card surface | `rgba(12, 12, 12, 0.82)`, 12px backdrop blur |
| Video well | `rgba(0, 0, 0, 0.55)` with a `rgba(255, 255, 255, 0.02)` wash |

Borders that brighten on hover go to `rgba(228, 228, 228, 0.2)` on choices and `rgba(228, 228, 228, 0.22)` on the preview toggles.

## Type

Font stack: `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `system-ui`, `sans-serif`. Base size 13px, line-height 1.45. Antialiased.

| Element | Size | Weight | Tracking |
| --- | --- | --- | --- |
| Kicker “Meanwhile asks” | 10px | 600 | 0.1em, uppercase |
| Card title | 15px | 600 | −0.02em |
| Body and choices | 13px | inherit | normal |
| Video title | 12px | 500 | normal, secondary color |
| Video meta | 12px | normal | muted |
| Corner mark | 11px | normal | 0.04em |
| Preview toggles | 10px | inherit | 0.04em, uppercase |

## Spacing

- Column padding 28px, gap 16px.
- Card padding 16px 16px 14px, radius 10px, shadow `0 16px 48px rgba(0, 0, 0, 0.45)`.
- Kicker, title, and body each have 8px below them; the body has 14px before the choices.
- Choices stack with a 6px gap. Each button is 10px 12px padding, radius 7px, full width, left aligned.
- Video radius 8px, 1px border, shadow `0 20px 60px rgba(0, 0, 0, 0.55)`.
- Preview buttons: 5px 8px padding, radius 4px, 6px gap, 12px from the right and 10px from the bottom.

## Components

`MeanwhileStage` owns the stage, the mode, the mark, and the toggles. Mode is `none`, `video`, `question`, or `both`. Video shows for `video` and `both`. The card shows for `question` and `both`.

`VideoBlock` is the 16:9 well. Placeholder copy:

- **Stripe vs Lemon Squeezy**
- comparison · 6:12

`QuestionCard` is the glass card.

- Kicker: Meanwhile asks
- Title: Only you can decide
- Body: While the agent wires Stripe, pick the constraint it cannot infer from the repo alone.
- Ship the thinnest vertical slice
- Preserve existing behavior even if slower
- Prefer clean internals; polish later

## States

| Toggle | On screen |
| --- | --- |
| Empty | Black stage and the grey wash only. Mark and toggles stay. |
| Video | The 16:9 placeholder, centered. |
| Ask | The question card, centered. |
| Both | Video, then the card, 16px apart. This is the reference frame. |

## What stays out of the product

The four preview toggles are a demo control (`title`: “Preview toggles — not shipping UI”). The empty stage is the real default until a session brings video or a question. The column does not show a header, stack chips, or a timer. Those belong to later slices, not this frame.
