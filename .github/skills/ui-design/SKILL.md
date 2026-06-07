---
name: ui-design
description: "Use when building or styling UI in this React app: creating components, adding pages, writing CSS, choosing colors/spacing, or improving accessibility. Enforces the project's design tokens, dark theme, semantic class naming, button conventions, and a11y rules so new UI matches the existing look and feel."
---

# UI & Design Guidelines

Apply these conventions whenever you add or modify any user-facing UI in this app
(React 19 + TypeScript + Vite, plain CSS).

## When to Use

- Creating a new page (`src/pages/`) or component (`src/components/`)
- Adding or changing styles in `src/index.css`
- Picking colors, spacing, borders, or radii
- Reviewing UI for visual consistency or accessibility

## Core Principles

1. **Tokens over literals** — never hardcode colors. Use the CSS custom properties from `:root`.
2. **One stylesheet** — all styles live in `src/index.css`. No inline styles, no CSS-in-JS, no per-component `.css` files.
3. **Semantic class names** — describe the thing, not the look (`.message-row`, not `.gray-box`).
4. **Dark theme only** — the app is dark (`color-scheme: dark`). Design for the dark palette.
5. **Accessible by default** — see the a11y checklist below.

## Design Tokens

Defined in `:root` in `src/index.css`. Always reference these instead of raw values.

| Token                           | Use for                                                               |
| ------------------------------- | --------------------------------------------------------------------- |
| `--bg`                          | Page background                                                       |
| `--surface`                     | Cards, inputs, rows, header                                           |
| `--surface-2`                   | Hover state / nested raised surface                                   |
| `--border`                      | All borders and dividers                                              |
| `--text`                        | Primary text                                                          |
| `--muted`                       | Secondary text, labels, placeholders                                  |
| `--primary` / `--primary-hover` | Primary action, focus border                                          |
| `--accent` / `--gradient`       | Brand accent + blue→purple gradient (logo, primary buttons, headings) |
| `--error` / `--success`         | Status messaging                                                      |

If a genuinely new semantic color is needed, add a token to `:root` first, then use it.

## Spacing, Borders & Type

- **Spacing**: use `rem` units in steps already in use (`0.2`, `0.35`, `0.5`, `0.6`, `0.75`, `1`, `1.5`, `2`).
- **Radius**: `4px` (inline code), `6px` (nav pills), `8px` (buttons, inputs, cards).
- **Borders**: `1px solid var(--border)`.
- **Font**: inherit the root `font-family`; inputs/textareas use `font-family: inherit`.
- **Font sizes**: body defaults; secondary text `0.85rem`; small labels/meta `0.8–0.85rem`.
- **Content width**: page content is capped at `max-width: 760px` centered (`.content`).

## Component Conventions

- Functional components with hooks; **named exports** (`export function Compose() {}`).
- Class strings are static `className="..."`; toggle visibility with `{condition && <…>}`.
- Buttons: base `.btn` plus a variant — `.btn-primary` (primary action) or `.btn-ghost` (secondary).
- Always handle `disabled` states (`.btn:disabled` is pre-styled); reflect async state in the label
  (e.g. `Sending…` while pending).
- Status text uses `.success` / `.error` / `.muted`.
- Brand: use the `Logo` component (`src/components/Logo.tsx`) for the mark; the
  wordmark uses `--gradient` clipped to text.
- Forms use `.compose-form` with `<label>` wrapping its input; inputs get a `placeholder`.

See [patterns.md](./references/patterns.md) for copy-paste snippets (button, form field, card row, status).

## Accessibility Checklist

- Every interactive element is a real `<button>`, `<a>`/`<Link>`, or labeled input — never a clickable `<div>`.
- Inputs are associated with a `<label>` (wrap or `htmlFor`); add `required` / correct `type` (e.g. `type="email"`).
- Decorative images use `alt=""`; meaningful images get descriptive `alt` text.
- Keep visible focus: inputs set `border-color: var(--primary)` on `:focus` — don't remove focus cues without a replacement.
- Don't rely on color alone for meaning; pair status colors with text/icon (e.g. `Sent ✓`).
- Use semantic landmarks (`<header>`, `<nav>`, `<main>`) and a logical heading order.

## Procedure for New UI

1. Build markup with semantic elements and existing class names; reuse `.btn`, `.content`, `.message-*`, etc.
2. If new styles are needed, add a semantic class to `src/index.css` using tokens — check no existing class fits first.
3. Run the a11y checklist above.
4. Verify with `yarn lint` and `yarn build`.
