---
name: Devtools viewer dark theme
colors:
  background: '#0a0a0a'
  surface: '#1c1c1c'
  popover: '#303030'
  text: '#fafafa'
  muted-text: '#b8b8b8'
  border: '#808080'
typography:
  body:
    fontFamily: Geist Sans
  code:
    fontFamily: Geist Mono
rounded:
  md: 6px
spacing:
  unit: 4px
---

# Devtools viewer dark theme

## Visual direction

Keep the existing compact, neutral trace inspector. Improve scanning through
contrast and predictable interaction rather than adding decoration or changing
layout. This dark palette works independently of the existing light theme.

## Color roles

`styles.css` is the implementation source of truth; background and primary text
above are approximate hex equivalents of its OKLCH values. Raised cards use
#1c1c1c, while opaque tooltips use #303030, a visible #808080 border, and a shadow.
Muted text uses #b8b8b8 so small metadata remains readable. Timeline grid lines
use the full border color, without opacity reduction. Preserve the existing
semantic colors for tools, reasoning, errors, and agent calls, along with labels
and icons so color is not the only indicator.

## Typography and layout

Preserve Geist Sans for labels and Geist Mono for data. Retain existing 10–12px
metadata and 14px primary labels, compact spacing, split input/output panels,
and horizontal timeline scrolling. Use 4px spacing increments and existing
rounded containers; avoid expanding trace density merely for decoration.

## Interaction rules

- Put disclosure chevrons before header text, on the left. Right means collapsed;
  down means expanded. Keep duration and token metadata on the right.
- Tools, provider options, and usage drawer triggers are bordered, filled buttons,
  not text links. Give them consistent padding and hover/focus feedback.
- Show keyboard focus on buttons and button-role controls. Disabled controls must
  not suggest an available action.
- Tooltips must have an opaque background distinct from the page and a visible
  border. Target 4.5:1 text contrast and 3:1 control/grid boundary contrast.

## Future changes

Reuse semantic CSS tokens instead of introducing one-off dark colors in JSX.
Preserve existing light-theme tokens. Verify dense traces, keyboard navigation,
and tooltip readability with browser tests whenever changing these roles.
