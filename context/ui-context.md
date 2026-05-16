# UI Context

## Theme

Dark and Light mode supported. The design language is a clean, technical workspace. 
- **Light Mode**: Off-white backgrounds, soft shadows, and high-contrast text.
- **Dark Mode**: Near-black backgrounds (`#111111`), layered surfaces (`#1C1C1C`), and monochrome accents.
The aesthetic uses "Clay" inspired flat cards and minimal inputs.

## Colors

All components use CSS variables mapped to HSL tokens for theme consistency.

| Role            | CSS Variable       | Light Value | Dark Value |
| --------------- | ------------------ | ----------- | ---------- |
| Page background | `--background`     | `#F5F5F5`   | `#111111`   |
| Surface         | `--surface`        | `#FFFFFF`   | `#1C1C1C`   |
| Primary text    | `--foreground`     | `#1A1A1A`   | `#F0F0F0`   |
| Muted text      | `--muted-foreground`| `#888888`   | `#707070`   |
| Primary accent  | `--primary`        | `#1A1A1A`   | `#F0F0F0`   |
| Border          | `--border`         | `#E5E5E5`   | `#2A2A2A`   |
| Error           | `--destructive`    | `#EF4444`   | `#C53030`   |
| Success         | `--state-success`  | `#10B981`   | `#059669`   |

## Typography

| Role      | Font              | Variable      |
| --------- | ----------------- | ------------- |
| UI text   | DM Sans           | `--font-sans` |
| Code/mono | JetBrains Mono    | `--font-mono` |

## Border Radius

| Context           | Class            | Value    |
| ----------------- | ---------------- | -------- |
| Inline / small UI | `rounded-md`     | `8px`    |
| Cards / panels    | `rounded-xl`     | `12px`   |
| Modals / overlays | `rounded-2xl`    | `16px`   |

## Component Library

- **Framework**: Tailwind CSS
- **Primitives**: Radix UI
- **Architecture**: shadcn/ui (Components in `client/src/components/ui/`)
- **Icons**: Lucide React (Stroke-based, `h-4 w-4` for inline, `h-5 w-5` for buttons)

## Layout Patterns

- **AppShell**: Full-viewport layout with a fixed-width left sidebar (`w-60`) on desktop and a bottom navigation bar on mobile.
- **Top Bar**: Fixed header (`h-16`) containing page titles, search, and global actions.
- **Content Area**: Scrollable main area with standard padding (`px-8 py-8`).
- **Modals**: Centered overlays with `backdrop-blur-sm` and `animate-in`.
- **Cards**: "Clay" cards with subtle borders and 12px rounding.

## Data Display Patterns

- **Tables**: Default for desktop. Uses sortable headers and column visibility toggles.
- **List View (Mobile)**: Optimized for touch. Displays data as individual cards with stacked information (Merchant, Amount, Date).
- **Charts**: Recharts used for data visualization. Dashboard uses a multi-row grid layout for a technical "Admin" feel.
