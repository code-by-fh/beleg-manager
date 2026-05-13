# Dashboard Redesign — Squire-Style Clean Minimal

**Date:** 2026-05-13  
**Reference:** Robin Holesinsky / Squire Dashboard (design4users.com)  
**Scope:** Full app transformation — AppShell + all pages

---

## Overview

Replace the current "Digital Clay" aesthetic (clay-morphism, green sidebar, gradients, heavy shadows) with a clean, minimal, professional design inspired by the Squire dashboard. The new design is neutral black/white/gray, no brand color accents, and retains both light and dark modes.

---

## Color Palette & Design Tokens

### Light Mode
| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `#F5F5F5` | Outer page background |
| `--surface` | `#FFFFFF` | Sidebar, cards, content area |
| `--foreground` | `#1A1A1A` | Primary text |
| `--muted-foreground` | `#888888` | Labels, descriptions, secondary text |
| `--border` | `#E5E5E5` | Card borders, dividers, sidebar edge |
| `--hover-bg` | `#F8F8F8` | Nav item hover background |
| `--active-bg` | `#F0F0F0` | Active nav item background |
| `--card-shadow` | `0 1px 3px rgba(0,0,0,0.06)` | Subtle card elevation |

### Dark Mode
| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `#111111` | Outer page background |
| `--surface` | `#1C1C1C` | Sidebar, cards, content area |
| `--foreground` | `#F0F0F0` | Primary text |
| `--muted-foreground` | `#707070` | Labels, descriptions |
| `--border` | `#2A2A2A` | Card borders, dividers |
| `--hover-bg` | `#252525` | Nav item hover |
| `--active-bg` | `#2E2E2E` | Active nav item |
| `--card-shadow` | `0 1px 3px rgba(0,0,0,0.25)` | Card elevation |

**Removed:** All green brand colors (`#2A735E`, `#3B8670`), purple/violet tokens, gradients, clay shadow stacks, glassmorphism blur effects.

---

## Typography

- **Font:** DM Sans (already loaded) — remove Nunito entirely
- **Headings:** DM Sans Semibold (600), 14–16px for section titles
- **Body:** DM Sans Regular (400), 14px
- **Labels:** 11–12px, uppercase, letter-spacing 0.05em, `--muted-foreground`
- **KPI Values:** DM Sans Bold (700), 28–32px, `--foreground`
- **Remove:** `.gradient-text`, `.clay-heading`, `.font-display` utilities
- **Replace:** All `gradient-text` uses → plain bold black/white text

---

## Layout Structure

```
┌─────────────────────────────────────────────┐
│  Sidebar (240px)  │  Main Content Area       │
│  ─────────────── │  ──────────────────────  │
│  Logo             │  Top Bar (64px)           │
│                   │  ─────────────────────── │
│  Nav Items        │  Page Content             │
│  (Icon + Label)   │  (scrollable)             │
│                   │                           │
│  ─────────────── │                           │
│  User / Logout    │                           │
└─────────────────────────────────────────────┘
```

No outer wrapper padding/rounding. Full-height sidebar flush to the left edge.

---

## AppShell — Sidebar

- **Width:** 240px, full height
- **Background:** `--surface` (`#FFFFFF` / `#1C1C1C`)
- **Right border:** `1px solid var(--border)`
- **No border-radius** on sidebar itself
- **Logo area (top, 64px height):** App name "Beleg Manager" — 16px Semibold. Keep lightning bolt SVG icon.
- **Nav items:**
  - Height: 40px, padding: `8px 12px`, gap: `12px`, border-radius: `8px`
  - Icon: 18px, stroke-width: 1.5
  - Label: 14px Regular
  - **Hover:** background `--hover-bg`, transition 150ms
  - **Active:** background `--active-bg`, text `--foreground`, font-weight 500
  - **No** dot indicator, no glow effects
- **User area (bottom):**
  - Avatar circle: 32px, initials, background `--active-bg`
  - Email (truncated), 12px muted
  - Logout: text link "Abmelden", 12px, `--muted-foreground`, hover: `--foreground`
  - **No** colored button for logout

---

## AppShell — Top Bar

- **Height:** 64px (flex, `items-center`)
- **Background:** `--surface`
- **Bottom border:** `1px solid var(--border)`
- **Left:** Page title (derived from current route), 16px Semibold
- **Right side (gap 12px):**
  1. "Neuer Beleg" button: `background: --foreground`, `color: --surface`, 8px border-radius, 14px, Semibold, height 36px — no shadow, no hover lift
  2. Bell icon button: 36px circle, border `1px solid --border`, notification dot remains
  3. Theme toggle button: 36px circle, border `1px solid --border`
  4. User avatar: 32px circle, initials, background `--active-bg`
- **Remove:** `shadow-xl`, `-translate-y`, all hover transforms

---

## Cards

- **Background:** `--surface`
- **Border:** `1px solid var(--border)`
- **Border-radius:** `12px`
- **Shadow:** `var(--card-shadow)` — single subtle layer
- **Padding:** `24px`
- **No** hover lift, no blur/backdrop-filter, no clay shadow stacks
- **Section headers inside cards:** 14px Semibold `--foreground` + optional muted label, no icon unless functional

**Remove:** `.clay-card`, `.clay-card-static` classes (or keep names but strip all clay styles)

---

## Dashboard Page Layout

```
┌─────────────────────────────────────────────┐
│ Page Header: "Dashboard"                     │
├──────────────────────────┬──────────────────┤
│ KPI Cards (4 cols)       │                  │
├──────────────────────────┤  Kategorien       │
│                          │  (Donut)          │
│ Zuletzt erfasste Belege  │                  │
│ (Receipt Table)          ├──────────────────┤
│                          │  Trend           │
│                          │  (Monthly Chart)  │
└──────────────────────────┴──────────────────┘
```

Same 2/3 + 1/3 grid. Gap reduced from `gap-10` to `gap-6`. Padding reduced from `p-10` to `p-6`.

**Remove:** Background blob animations (`absolute` divs with `animate-pulse`).

**Page title:** "Dashboard" — plain, 24px Semibold, no emoji, no gradient text.

---

## KPI Cards

- 4 cards in a `grid grid-cols-2 lg:grid-cols-4 gap-4` inside the parent card
- Each card: white card with border, padding `20px`
- Label: 11px uppercase letter-spaced `--muted-foreground`
- Value: 28px Bold `--foreground`
- No icon, no colored backgrounds

---

## Receipt Table

- Clean rows with `border-bottom: 1px solid var(--border)`
- No zebra striping
- Row hover: `background: #F8F8F8` (light) / `#252525` (dark)
- Column headers: 11px uppercase `--muted-foreground`
- Remove any colored cell backgrounds

---

## Charts (CategoryDonut, MonthlyChart)

- Chart colors: neutral grays (`#888`, `#CCC`, `#555`) — remove green/purple palette
- No gradient fills on charts
- Clean tooltips matching card style

---

## CSS Changes Required

### `index.css`
1. Replace all CSS custom properties with neutral values
2. Remove: `--brand-primary`, `--brand-secondary`, `--clay-*`, `--shadow-clay-*` variables
3. Replace clay utility classes: `.clay-card` → flat card style, `.clay-btn` → remove, `.clay-input` → minimal style
4. Remove: `.gradient-text`, `.clay-heading` (or make them point to plain styles)
5. Remove: Blob/pulse animation keyframes
6. Update scrollbar thumb color to neutral gray

### `tailwind.config.ts`
- No changes needed (neutral classes already available)

---

## Files to Modify

| File | Change |
|------|--------|
| `client/src/index.css` | Full token + utility class overhaul |
| `client/src/components/AppShell.tsx` | Sidebar + top bar redesign |
| `client/src/pages/Dashboard.tsx` | Remove blobs, update spacing/headings |
| `client/src/components/stats/KpiCards.tsx` | Remove gradient-text, update card structure |
| `client/src/components/stats/CategoryDonut.tsx` | Neutral chart colors |
| `client/src/components/stats/MonthlyChart.tsx` | Neutral chart colors |
| `client/src/components/receipts/ReceiptTable.tsx` | Clean table styles |
| `client/src/components/ui/card.tsx` | Update default card styles |
| `client/src/components/ui/button.tsx` | Update button variants |
| `client/src/components/ui/input.tsx` | Remove clay-input styles |

---

## Out of Scope

- Mobile bottom navigation: minor neutral styling adjustments only
- Login page: neutral palette update only, no layout changes
- Upload / Review / Settings pages: neutral palette cascades automatically from CSS token changes
- Map component (not present in this app)
