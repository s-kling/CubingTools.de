# CubingTools.de — Corporate Design Instruction Manual

This manual defines the visual system of CubingTools.de based on the current production styles in:

- `public/css/global.css`
- `public/css/index.css`
- `public/html/tools/average/average.css`
- `public/html/tools/globalCalc/globalCalc.css`
- `public/html/tools/grouping/grouping.css`
- `public/html/tools/guildford/guildford.css`

Use this as the single source of truth for UI consistency.

---

## 1) Brand Foundation

### 1.1 Brand Personality

CubingTools.de should feel:

- Technical but approachable
- Fast and practical
- Focused on readability in dark mode
- Consistent across all tools

### 1.2 Logo Specification

- **Logotype font family:** Poppins
- **Logotype weight:** **Semibold (600)**
- **Primary usage:** Text logo in navigation (`.logo`) and brand references
- **Color:** `var(--main-text)` on dark/brand surfaces
- **Do not:** use other font families for the logo

---

## 2) Design Tokens

All new UI must use the existing CSS variables.

### 2.1 Radius

- `--main-radius: 5px`

### 2.2 Spacing Scale

- `--space-xxs: 4px`
- `--space-xs: 8px`
- `--space-sm: 12px`
- `--space-md: 20px`
- `--space-lg: 32px`
- `--space-xl: 52px`
- `--space-xxl: 84px`

### 2.3 Color System

Tokens are defined in `:root` (dark mode defaults) and overridden per `[data-theme]` attribute. Never hardcode hex values when a token exists.

**Base / Surface**
- `--main-background`
- `--secondary-background`
- `--main-lighter`
- `--card-bg` — semantic card surface (semi-transparent layered)
- `--card-border` — semantic card border (low-opacity)
- `--subtle-hover` — very low-opacity fill for pill tags and secondary hover states
- `--surface-overlay` — near-invisible overlay for stacked surface depth

**Text**
- `--main-text`
- `--secondary-text`
- `--hover-text`

**Interactive**
- `--hover-background`
- `--link-color`
- `--link-underline`
- `--input-background`
- `--input-border`
- `--button-background`
- `--button-color` — button label color (always white)
- `--button-hover` — button background on hover

**Elevation**
- `--shadow-sm: 0 2px 4px rgba(0,0,0,…)` — small lift
- `--shadow-md: 0 6px 20px rgba(0,0,0,…)` — card / panel elevation

**Popup / Overlay surfaces**
- `--popup-bg-from` — gradient start for modal/dialog backgrounds
- `--popup-bg-to` — gradient end for modal/dialog backgrounds

**Scrollbar**
- `--scrollbar-thumb` — scrollbar thumb color

**Semantic / Status**
- `--success` / `--error` / `--warning` — icon/fill-level status colors
- `--color-success-text` / `--color-warning-text` / `--color-info-text` — readable text-level variants for status messaging

#### Dark mode values (`:root` default)

| Token | Value |
|---|---|
| `--main-background` | `#000000` |
| `--secondary-background` | `#191923` |
| `--main-lighter` | `#2A2A31` |
| `--main-text` | `#F4F4F5` |
| `--secondary-text` | `#A1A1AA` |
| `--hover-text` | `#FFFFFF` |
| `--hover-background` | `#3B3B46` |
| `--link-color` | `#3FA7D6` |
| `--input-background` | `#32323E` |
| `--input-border` | `#4A4A5C` |
| `--button-background` | `#4F46E5` |
| `--button-hover` | `#3730a3` |
| `--card-bg` | `rgba(42,42,49,0.6)` |
| `--card-border` | `rgba(255,255,255,0.08)` |
| `--subtle-hover` | `rgba(255,255,255,0.05)` |
| `--surface-overlay` | `rgba(255,255,255,0.02)` |
| `--shadow-sm` | `0 2px 4px rgba(0,0,0,0.50)` |
| `--shadow-md` | `0 6px 20px rgba(0,0,0,0.40)` |
| `--scrollbar-thumb` | `rgba(255,255,255,0.15)` |
| `--success` | `#2ecc71` |
| `--error` | `#e74c3c` |
| `--warning` | `#f39c12` |
| `--color-success-text` | `#4ade80` |
| `--color-warning-text` | `#f6c15c` |
| `--color-info-text` | `#7dd3fc` |

#### Light mode values (`[data-theme="light"]`)

| Token | Value |
|---|---|
| `--main-background` | `#FFFFFF` |
| `--secondary-background` | `#F5F5F7` |
| `--main-lighter` | `#EFEFEF` |
| `--main-text` | `#1A1A1A` |
| `--secondary-text` | `#666666` |
| `--hover-text` | `#000000` |
| `--hover-background` | `#E8E8E8` |
| `--link-color` | `#0066CC` |
| `--input-background` | `#F0F0F0` |
| `--input-border` | `#D0D0D0` |
| `--button-background` | `#4F46E5` |
| `--button-hover` | `#3730a3` |
| `--card-bg` | `rgba(255,255,255,0.85)` |
| `--card-border` | `rgba(0,0,0,0.08)` |
| `--subtle-hover` | `rgba(0,0,0,0.04)` |
| `--surface-overlay` | `rgba(0,0,0,0.02)` |
| `--shadow-sm` | `0 2px 4px rgba(0,0,0,0.08)` |
| `--shadow-md` | `0 6px 20px rgba(0,0,0,0.10)` |
| `--scrollbar-thumb` | `rgba(0,0,0,0.18)` |
| `--success` | `#16a34a` |
| `--error` | `#dc2626` |
| `--warning` | `#d97706` |
| `--color-success-text` | `#15803d` |
| `--color-warning-text` | `#b45309` |
| `--color-info-text` | `#0369a1` |

### 2.4 Typography Tokens

- `--font-main: 'Poppins', sans-serif`
- `--font-size-base: clamp(14px, 16px, 18px)`
- `--font-size-lg: clamp(16px, 18px, 20px)`
- `--font-size-xl: clamp(28px, 32px, 36px)`

### 2.5 Layout Tokens

- `--main-padding: 16px`
- `--main-margin: 8px`

### 2.6 Theming Mechanism

Theme is applied via a `data-theme` attribute on the root element:

- `[data-theme="dark"]` — explicit dark mode
- `[data-theme="light"]` — light mode
- `:root` defaults are dark mode (used when no attribute is set)

All tokens are overridden at the `[data-theme]` layer; never target `.dark-mode` classes or `prefers-color-scheme` directly — always go through the `data-theme` attribute.

When writing theme-aware CSS for a component, scope overrides inside `[data-theme="light"] { … }`. Only list tokens whose values actually differ — do not duplicate the full token set.

The logo `img` inside `nav a.logo` uses `filter: invert(1)` in light mode and `filter: invert(0)` in dark mode to adapt the icon without maintaining two separate assets.

---

## 3) Typography Rules

### 3.1 Font Usage

- Use **Poppins** globally
- Keep body text at `var(--font-size-base)`
- Use `var(--font-size-lg)` for section headings and important controls
- Use `var(--font-size-xl)` for page titles and key KPIs

### 3.2 Heading Hierarchy

- `h1`: feature/page title, strong prominence
- `h2`: section-level label
- `h3`: card/module heading
- Body/support text: `var(--secondary-text)` for lower emphasis

### 3.3 Link Style

- Color: `var(--link-color)`
- Underline animation on hover using pseudo-element
- Keep links clean and high contrast on dark surfaces

### 3.4 Eyebrow / Label Text

- Used above headings to introduce a section or feature
- Style: `font-weight: 700`, `text-transform: uppercase`, `letter-spacing: 0.12em`, `font-size: ~0.82rem`
- Color: `var(--link-color)` for brand-accent eyebrows
- Never use a second font; always Poppins

---

## 4) Core Surfaces & Layout

### 4.1 App Shell

- Main app layout uses a grid container with areas:
	- `nav`
	- `sidebar`
	- `main`
	- `version`
	- `footer`
- Cards and shell sections use rounded corners with `--main-radius`
- Background strategy:
	- Body: black (`--main-background`)
	- Panels/cards: `--secondary-background` or `--main-lighter`
	- Main content area: dark gradient for depth

### 4.2 Card Language

Use card panels with:

- Subtle borders (`--card-border` or `--input-border`)
- Background via `--card-bg` (semantic alias) or explicit dark layered gradients
- Elevation via `--shadow-sm` (tight lift) or `--shadow-md` (floating panel)
- Consistent inner spacing (`--space-sm` to `--space-md`)
- Minimal shadow depth, never bright or colorful shadows
- Corner radii may scale from `--main-radius` (5px) up to 12–18px for larger, prominent cards; round to the nearest meaningful step

### 4.4 Hero / Feature Surfaces

Hero sections and prominent feature panels use a layered gradient approach:

- **Radial accent glows** positioned in corners to add visual depth (use `rgba` of brand accent colors at low opacity: 0.10–0.26)
- **Linear gradient base** for the main surface, dark and near-opaque
- **Decorative blob** via `::after` pseudo-element — positional radial gradient, `pointer-events: none`, never interactive
- Consistent `border-radius` of 16–18px for the outermost container
- `overflow: hidden` on the container to clip the blob inside

In light mode, reduce accent opacities significantly (0.08–0.10 range) and switch the base gradient to light surface tokens (`--secondary-background`, `--main-lighter`). Shadows become subtler automatically via `--shadow-sm` / `--shadow-md`.

### 4.3 Scroll Behavior

- Vertical scrolling is handled inside `main`
- Body is fixed-height and overflow hidden in app shell contexts
- Scrollbars are visually minimal and dark-theme aligned

---

## 5) Components

### 5.1 Buttons

Default button behavior:

- Shape: rounded (`--main-radius`)
- Fill: `--button-background`
- Text: high contrast
- Hover: `--hover-background`
- Transition: short and subtle (around 0.15–0.3s)

Specialized tool buttons (penalty/edit states) may use semantic colors, but only for direct status meaning.

### 5.2 Inputs & Selects

- Background: `--input-background`
- Border: `1px solid --input-border`
- Text: `--main-text`
- Focus: visible ring/glow in brand accent family
- Corner radius: `--main-radius`

### 5.3 Checkboxes

- Custom appearance with dark background and bordered square
- Checked state uses brand gradient/accent
- Must maintain visible focus treatment for accessibility

### 5.4 Navigation

- Top navigation bar uses `--button-background` as primary brand strip
- Logo on the left, nav links on the right
- Active/hover nav item uses `--hover-background`
- Mobile navigation shifts to slide-in panel

### 5.5 Lists

- Generic list style uses custom bullet and boxed dark surface
- In special contexts (nav, structured lists), bullets are disabled
- Keep spacing and separators subtle to reduce visual noise

### 5.6 Modal / Overlay

- Dark, centered modal with high z-index
- Backdrop blur/dim to isolate foreground context
- Border and shadow remain subtle and consistent with dark theme

### 5.7 Pill Links / Ghost Buttons

Fully rounded action links used in hero areas and feature call-to-action rows:

- `border-radius: 999px` (fully round)
- Minimum height `~2.6–2.7rem`; horizontal padding `var(--space-md)`
- Default: subtle border (`var(--card-border)`), transparent fill, `var(--main-text)` label
- Hover: accent-tinted border (`rgba(--link-color, 0.6)`) and background (`rgba(--link-color, 0.14)`), `transform: translateY(-2px)`
- Accent variant (primary CTA): solid `rgba(--link-color, 0.14)` fill, `rgba(--link-color, 0.45)` border, `var(--link-color)` text, `font-weight: 600`
- Suppress default link underline pseudo-element on pill links (`::before { display: none }`)

### 5.8 Pill Tag List

Used to display a compact set of feature labels or category chips:

- Layout: `display: flex; flex-wrap: wrap; gap: var(--space-xs)`; no list markers, no background on the container
- Each item: `padding: 6px 10px`, `border-radius: 999px`, `border: 1px solid var(--card-border)`, `background: var(--subtle-hover)`, `color: var(--secondary-text)`
- `::before` bullet suppressed on all pill items

### 5.9 Carousel / Slider

Slide-based content rotator with controls:

- **Window/viewport:** `overflow: hidden`, rounded (`14px`)
- **Track:** `display: flex`, animated via `transform: translateX(...)` with `transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)` and `will-change: transform`
- **Slides:** `min-width: 100%` so one slide fills the viewport at a time
- **Slide grid:** two-column layout (`~1.2fr / 0.8fr`) for copy + side panel; collapses to single column below ~880px
- **Side panel:** dark inset surface (`rgba(0,0,0,0.25)`), rounded (`12px`), flexbox column
- **Controls row:** prev/next buttons + dot indicators, spaced with `justify-content: space-between`
  - Buttons: `min-width: 2.8rem`, `min-height: 2.5rem`, `background: var(--subtle-hover)`, bordered
  - Dots: `0.9rem` circle, transparent fill with `var(--card-border)` border; active dot fills with `var(--link-color)`
- Status/error slide variant: single-column, centered text, uses semantic border color for error state

### 5.10 Info Grid

Three-column card grid for surfacing structured information at a glance:

- Layout: `display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-md)`
- Each card: `padding: var(--space-md)`, `border-radius: 12px`, `border: 1px solid var(--card-border)`, `background: var(--card-bg)`
- Heading (`h3`): `font-size: 1.1rem`, `margin-bottom: var(--space-xs)`
- Body copy: `color: var(--secondary-text)`, `margin: 0`
- Responsive: 3-col → 2-col at ~880px → 1-col at ~650px

### 5.11 Accent Notice Card

Highlighted informational card using brand-accent tint:

- Background: `rgba(--button-background, 0.12)` (e.g. `rgba(79, 70, 229, 0.12)`)
- Border: `1px solid rgba(--button-background, 0.35)`
- Corner radius: `12px`
- Heading: `margin-top: 0` to avoid double spacing
- Reserve for important notices only; do not overuse

### 5.12 Status / Feedback Indicators

For inline status text, use the semantic text-level tokens which are readable on both dark and light surfaces:

- Success: `var(--color-success-text)`
- Warning: `var(--color-warning-text)`
- Info: `var(--color-info-text)`

For fill-level indicators (icons, badges, borders):

- Success: `var(--success)`
- Error: `var(--error)`
- Warning: `var(--warning)`

These tokens resolve to different values in light vs dark mode — never hardcode status hex values.

---

## 6) Tool-Specific UI Patterns

### 6.1 Average Tool

- Split layout: history panel + central timing area
- Large numeric input as visual focal point
- Action-on-hover solve row with compact round icon buttons
- Mobile behavior: stacks vertically, reduces control and button sizes

### 6.2 Global Calculator

- Panel-based grid with consistent border/radius system
- Toggle groups use selected/unselected states in dark context
- Stats and chart modules prioritize readability and compact density
- Chart area adapts by viewport with clamped heights

### 6.3 Grouping Tool

- Structured workflow sections: setup → event selection → competitor setup → results
- Event tiles support checked/unchecked visual states
- Group outputs use responsive cards with overflow protection
- Dense data tables use subtle separators, no heavy grid styling

### 6.4 Guildford Tool

- Form-heavy layout with wrapped sections and result cards
- Tag chips indicate categories/highlights
- Combination history uses horizontally scrollable table container

---

## 7) Motion & Interaction Guidelines

- Use short transitions (roughly 0.08s–0.5s depending on interaction)
- Prefer micro-interactions:
	- hover color shifts
	- slight scale/translate feedback (`transform: translateY(-2px)` on pill links)
	- subtle opacity transitions
- For slide/panel transitions use **`cubic-bezier(0.22, 1, 0.36, 1)`** — fast exit, natural deceleration into final position
- Use `will-change: transform` only on elements that animate frequently (e.g. carousel tracks); remove once animation ends if possible
- Avoid dramatic animations except designated hero/intro context

---

## 8) Responsive Design Rules

### Breakpoint intent in current system

- ~890px: nav behavior switches to mobile menu pattern
- ~880px: two-column content layouts (carousel slides, info grids) begin collapsing; supplementary header copy hides
- ~768px: compact interaction and stacked layouts for tool UIs
- ~650px: app-shell converts to simplified single-column structure; page-level grids become single column; spacing scale steps down
- ~480px / 360px: dense mobile scaling for inputs, lists, and controls

### Responsive principles

- Keep content readable before preserving desktop structure
- Stack columns to single column on narrow screens
- Reduce control size gradually, not abruptly
- Preserve touch targets for all interactive elements

---

## 9) Accessibility & Readability

- Maintain high contrast text on dark backgrounds
- Preserve focus outlines/rings for keyboard navigation
- Use clear text hierarchy (`main-text` vs `secondary-text`)
- Keep interaction states distinct: default / hover / active / disabled

---

## 10) Implementation Guardrails

### Always Do

- Reuse existing tokens from `:root`
- Reuse established card, input, and button patterns
- Keep all new UI in the same dark visual language; ensure it also works in light mode
- Ensure mobile behavior is defined for new modules
- Apply elevation via `--shadow-sm` / `--shadow-md` so shadows adapt across themes
- Use semantic status tokens (`--color-success-text`, `--color-warning-text`, `--color-info-text`) for text-level status copy
- Scope light-mode-only overrides inside `[data-theme="light"] { … }`

### Never Do

- Do not hardcode new brand colors if an existing token fits
- Do not introduce a second font family for UI or logo
- Do not use sharp corners unless functionally required
- Do not add bright/light backgrounds that break theme consistency
- Do not use `prefers-color-scheme` media queries — always go through the `data-theme` attribute
- Do not hardcode status hex colors (`#2ecc71`, `#e74c3c`, etc.) — use `--success`, `--error`, `--warning`
- Do not duplicate the full token set in light-mode overrides — only list tokens that actually change

---

## 11) Quick Reference (Copy/Paste)

### Logo

- **Poppins 600 (Semibold)**

### Primary Colors

- Background: `--main-background` (`#000000` dark / `#FFFFFF` light)
- Surface: `--secondary-background` / `--main-lighter`
- Text: `--main-text` (`#F4F4F5` dark / `#1A1A1A` light)
- Accent/Button: `--button-background` (`#4F46E5`, same in both modes)
- Link: `--link-color` (`#3FA7D6` dark / `#0066CC` light)
- Card surface: `--card-bg`
- Card border: `--card-border`
- Subtle hover fill: `--subtle-hover`

### Elevation

- Small: `--shadow-sm`
- Medium: `--shadow-md`

### Status Colors

- Text-level: `--color-success-text` / `--color-warning-text` / `--color-info-text`
- Fill-level: `--success` / `--error` / `--warning`

### Core UI Shape

- Default radius: `5px` (`--main-radius`)
- Pill / fully-round: `border-radius: 999px`
- Card / panel: `12px` – `18px` depending on prominence
- Standard spacing: 8 / 12 / 20 / 32

---

This document is intentionally aligned to the current production CSS and should be updated whenever global tokens or core component rules change.