# CubingTools.de — Corporate Design Instruction Manual

This manual defines the visual system of CubingTools.de based on the current production styles in:

- `public/css/global.css`
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

- `--main-background: #000000`
- `--secondary-background: #191923`
- `--main-lighter: #2A2A31`
- `--main-text: #F4F4F5`
- `--secondary-text: #A1A1AA`
- `--hover-text: #FFFFFF`
- `--hover-background: #3B3B46`
- `--link-color: #3FA7D6`
- `--link-underline: #D6D6D6`
- `--input-background: #32323E`
- `--input-border: #4A4A5C`
- `--button-background: #4F46E5`

### 2.4 Typography Tokens

- `--font-main: 'Poppins', sans-serif`
- `--font-size-base: clamp(14px, 16px, 18px)`
- `--font-size-lg: clamp(16px, 18px, 20px)`
- `--font-size-xl: clamp(28px, 32px, 36px)`

### 2.5 Layout Tokens

- `--main-padding: 16px`
- `--main-margin: 8px`

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

- Subtle borders (`--input-border` or low-opacity white)
- Dark layered gradients
- Consistent inner spacing (`--space-sm` to `--space-md`)
- Minimal shadow depth, never bright or colorful shadows

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
	- slight scale/translate feedback
	- subtle opacity transitions
- Avoid dramatic animations except designated hero/intro context

---

## 8) Responsive Design Rules

### Breakpoint intent in current system

- ~890px: nav behavior switches to mobile menu pattern
- ~768px: compact interaction and stacked layouts for tool UIs
- ~650px: app-shell converts to simplified single-column structure
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
- Keep all new UI in the same dark visual language
- Ensure mobile behavior is defined for new modules

### Never Do

- Do not hardcode new brand colors if an existing token fits
- Do not introduce a second font family for UI or logo
- Do not use sharp corners unless functionally required
- Do not add bright/light backgrounds that break theme consistency

---

## 11) Quick Reference (Copy/Paste)

### Logo

- **Poppins 600 (Semibold)**

### Primary Colors

- Background: `#000000`
- Surface: `#191923` / `#2A2A31`
- Text: `#F4F4F5`
- Accent/Button: `#4F46E5`
- Link: `#3FA7D6`

### Core UI Shape

- Radius: `5px`
- Input border: `#4A4A5C`
- Standard spacing: 8 / 12 / 20 / 32

---

This document is intentionally aligned to the current production CSS and should be updated whenever global tokens or core component rules change.