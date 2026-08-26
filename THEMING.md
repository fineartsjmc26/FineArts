Attendance App — Theming Guide

Overview
--------
This repository includes a single, shared tokens stylesheet at `themes/design-tokens.css`.
It declares both Light and Dark theme tokens via `:root` and `:root[data-theme="dark"]`.
The app should include `theme-toggle.js` (already present) to persist and switch the theme by
setting `data-theme="dark"` on the `<html>` element.

Files
-----
- `themes/design-tokens.css` — color tokens, spacing scale (4pt grid), typography scale,
  component defaults (buttons, inputs, cards, tables), accessibility rules, and utilities.
- `dark-theme.css` — legacy dark theme file generated earlier; you can remove or keep it.

Design decisions
----------------
- Grid: 4pt base grid (keeps parity with existing design-system). Use `--space-#` tokens.
- Typographic scale: modular, fluid for larger sizes using `clamp()`; body uses 1.5 line-height.
- Color contrast: colors selected so body text meets WCAG AA (>=4.5:1) against surface tokens.
- Motion: micro-interaction durations: 150–300ms; `prefers-reduced-motion` honored.
- Theme toggle: `theme-toggle.js` persists pref in `localStorage` under key `attendance-studio-theme`.

How to wire into the app
------------------------
Add this to your `<head>` (before other CSS that depends on tokens):

<link rel="stylesheet" href="themes/design-tokens.css">

If you prefer to keep theme CSS separate, you can split tokens into `tokens.css` and
component styles into a `components.css` that consumes those tokens.

Theme toggling
--------------
`theme-toggle.js` already sets `data-theme` on `<html>`. The tokens file uses that attribute
for the dark theme. The toggle also applies a `.theme-transitioning` class during animated
switches; the tokens file provides cross-fade transitions for color-bearing properties.

Component specs (summary)
-------------------------
- Buttons: clear states for default, hover, active, focus, disabled; use `--accent` for primary.
- Inputs: 1px border with `--border-strong`, focus ring uses `--accent-soft` for accessibility.
- Cards: `--radius-lg`, subtle shadow, raise on hover with `--shadow-md`.
- Tables: responsive: horizontal scroll below 900px, stacked rows below 560px via `.table-stack`.
- Chips: distinguish present/absent via `--success` / `--danger` with clear contrast and text color.

Accessibility notes
-------------------
- Focus indicators use layered soft ring + accent to remain visible on all surfaces.
- `prefers-reduced-motion` disables non-essential transitions/animations.
- Maintain max line-length via `--measure` (approx. 60–75 characters).

Next steps
----------
- I can wire `themes/design-tokens.css` into `index.html` and remove the older `dark-theme.css`.
- If you want a visual preview, I can start a quick local HTTP server and open the app.
- I can also generate a component reference page (HTML) that shows tokens and component states.

If you'd like me to proceed with any of those next steps, tell me which one to do.
