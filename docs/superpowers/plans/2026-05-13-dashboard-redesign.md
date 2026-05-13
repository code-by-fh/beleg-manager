# Dashboard Redesign — Squire-Style Clean Minimal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Digital Clay" aesthetic with a clean, minimal, neutral black/white/gray design inspired by the Squire dashboard.

**Architecture:** CSS custom properties drive all colors — updating `index.css` tokens cascades through shadcn UI primitives. Component-level hardcoded clay classes and green/purple colors are replaced file by file afterward.

**Tech Stack:** React, Tailwind CSS, shadcn/ui, Recharts, Vite dev server

---

## File Map

| File | Change |
|------|--------|
| `client/src/index.css` | Replace all CSS tokens and utility classes |
| `client/src/components/ui/card.tsx` | Remove clay-card-static, use flat neutral style |
| `client/src/components/ui/button.tsx` | Remove clay-btn + gradients, neutral variants |
| `client/src/components/ui/input.tsx` | Replace clay-input with minimal border style |
| `client/src/components/ui/select.tsx` | Replace clay-input trigger, fix dropdown radius |
| `client/src/components/AppShell.tsx` | Redesign sidebar + top bar |
| `client/src/pages/Dashboard.tsx` | Remove blobs, flat cards, clean headings |
| `client/src/components/stats/KpiCards.tsx` | Remove gradient-text, neutral KPI cards |
| `client/src/components/stats/CategoryDonut.tsx` | Neutral chart colors, flat tooltip |
| `client/src/components/stats/MonthlyChart.tsx` | Neutral line + tooltip, no gradient stroke |
| `client/src/components/receipts/ReceiptTable.tsx` | Fix row hover color |
| `client/src/pages/Login.tsx` | Remove clay-btn gradient logo, gradient-text |

---

## Task 1: CSS Design Tokens & Utility Classes

**Files:**
- Modify: `client/src/index.css`

This is the foundation. Everything else cascades from these tokens.

- [ ] **Step 1: Replace `index.css` with new neutral token system**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background:             0 0% 96%;    /* #F5F5F5 */
    --foreground:             0 0% 10%;    /* #1A1A1A */
    --card:                   0 0% 100%;
    --card-foreground:        0 0% 10%;
    --popover:                0 0% 100%;
    --popover-foreground:     0 0% 10%;
    --primary:                0 0% 10%;    /* #1A1A1A */
    --primary-foreground:     0 0% 100%;
    --secondary:              0 0% 96%;
    --secondary-foreground:   0 0% 10%;
    --muted:                  0 0% 96%;
    --muted-foreground:       0 0% 53%;    /* #888888 */
    --accent:                 0 0% 10%;
    --accent-foreground:      0 0% 100%;
    --destructive:            0 84% 60%;
    --destructive-foreground: 0 0% 98%;
    --border:                 0 0% 90%;    /* #E5E5E5 */
    --input:                  0 0% 90%;
    --ring:                   0 0% 10%;
    --radius:                 0.75rem;

    --surface:    #FFFFFF;
    --hover-bg:   #F8F8F8;
    --active-bg:  #F0F0F0;
    --card-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }

  .dark {
    --background:             0 0% 7%;     /* #111111 */
    --foreground:             0 0% 94%;    /* #F0F0F0 */
    --card:                   0 0% 11%;    /* #1C1C1C */
    --card-foreground:        0 0% 94%;
    --popover:                0 0% 11%;
    --popover-foreground:     0 0% 94%;
    --primary:                0 0% 94%;
    --primary-foreground:     0 0% 7%;
    --secondary:              0 0% 16%;
    --secondary-foreground:   0 0% 94%;
    --muted:                  0 0% 16%;
    --muted-foreground:       0 0% 44%;    /* #707070 */
    --accent:                 0 0% 94%;
    --accent-foreground:      0 0% 7%;
    --destructive:            0 65% 55%;
    --destructive-foreground: 0 0% 98%;
    --border:                 0 0% 16%;    /* #2A2A2A */
    --input:                  0 0% 16%;
    --ring:                   0 0% 94%;

    --surface:    #1C1C1C;
    --hover-bg:   #252525;
    --active-bg:  #2E2E2E;
    --card-shadow: 0 1px 3px rgba(0,0,0,0.25);
  }

  * { @apply border-border; }

  html {
    scroll-behavior: smooth;
    height: 100%;
    overflow: hidden;
  }

  body {
    height: 100%;
    overflow: hidden;
    background-color: hsl(var(--background));
    color: hsl(var(--foreground));
    font-family: 'DM Sans', sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  #root {
    height: 100dvh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
  }
}

@layer utilities {
  /* Flat card — replaces clay-card and clay-card-static */
  .clay-card,
  .clay-card-static {
    background: var(--surface);
    border: 1px solid hsl(var(--border));
    border-radius: 12px;
    box-shadow: var(--card-shadow);
  }

  /* Minimal input — replaces clay-input */
  .clay-input {
    background: hsl(var(--input));
    border: 1px solid hsl(var(--border));
    border-radius: 8px;
    color: hsl(var(--foreground));
    transition: border-color 150ms ease, box-shadow 150ms ease;
    outline: none;
    box-shadow: none !important;
  }

  .clay-input::placeholder {
    color: hsl(var(--muted-foreground));
    opacity: 1;
  }

  .clay-input:focus-visible,
  .clay-input:focus {
    border-color: hsl(var(--foreground));
    box-shadow: 0 0 0 3px rgba(0,0,0,0.06) !important;
  }

  /* Font helpers — point to DM Sans */
  .clay-heading  { font-family: 'DM Sans', sans-serif; }
  .font-display  { font-family: 'DM Sans', sans-serif; }

  /* gradient-text → plain bold foreground */
  .gradient-text {
    color: hsl(var(--foreground));
    font-weight: 700;
    background: none;
    -webkit-background-clip: unset;
    -webkit-text-fill-color: hsl(var(--foreground));
    background-clip: unset;
    font-family: 'DM Sans', sans-serif;
  }

  .safe-top    { padding-top:    env(safe-area-inset-top,    0px); }
  .safe-bottom { padding-bottom: env(safe-area-inset-bottom, 0px); }
  .h-screen-safe { height: 100dvh; }
}

@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition-duration: 1ms !important; }
}

::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: hsl(var(--border));
  border-radius: 4px;
}
```

- [ ] **Step 2: Start dev server and verify**

```bash
cd client && npm run dev
```

Open http://localhost:5173 — the app should render with a neutral palette. Sidebar may still be green (AppShell not yet updated). Cards should be white/flat without clay shadows.

- [ ] **Step 3: Commit**

```bash
git add client/src/index.css
git commit -m "style: replace clay token system with neutral flat design tokens"
```

---

## Task 2: UI Primitives — Card, Button, Input, Select

**Files:**
- Modify: `client/src/components/ui/card.tsx`
- Modify: `client/src/components/ui/button.tsx`
- Modify: `client/src/components/ui/input.tsx`
- Modify: `client/src/components/ui/select.tsx`

- [ ] **Step 1: Update `card.tsx`**

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "bg-[var(--surface)] border border-[hsl(var(--border))] rounded-xl shadow-[var(--card-shadow)] text-[hsl(var(--foreground))]",
        className
      )}
      {...props}
    />
  )
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  )
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("font-semibold text-base leading-none text-[hsl(var(--foreground))]", className)} {...props} />
  )
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("text-sm text-[hsl(var(--muted-foreground))]", className)} {...props} />
  )
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  )
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  )
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
```

- [ ] **Step 2: Update `button.tsx`**

```tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[hsl(var(--foreground))] text-[hsl(var(--background))] hover:opacity-80",
        destructive:
          "bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] hover:opacity-80",
        outline:
          "border border-[hsl(var(--border))] bg-transparent text-[hsl(var(--foreground))] hover:bg-[var(--hover-bg)]",
        secondary:
          "bg-[var(--active-bg)] text-[hsl(var(--foreground))] hover:bg-[var(--hover-bg)]",
        ghost:
          "text-[hsl(var(--foreground))] hover:bg-[var(--hover-bg)]",
        link:
          "text-[hsl(var(--foreground))] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 rounded-lg text-sm",
        sm:      "h-8 px-3 rounded-md text-xs",
        lg:      "h-12 px-6 rounded-lg text-base",
        icon:    "h-9 w-9 rounded-lg",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
```

- [ ] **Step 3: Update `input.tsx`**

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-lg border border-[hsl(var(--border))] bg-[var(--surface)] px-3 py-1 text-sm text-[hsl(var(--foreground))]",
        "placeholder:text-[hsl(var(--muted-foreground))]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "transition-colors",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = "Input";

export { Input };
```

- [ ] **Step 4: Update `select.tsx` — fix trigger and dropdown styling**

In `SelectTrigger`, replace the className:
```tsx
// Old:
"clay-input flex h-12 w-full items-center justify-between px-4 py-3 text-sm ..."

// New:
"flex h-9 w-full items-center justify-between rounded-lg border border-[hsl(var(--border))] bg-[var(--surface)] px-3 py-1 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ..."
```

In `SelectContent`, replace the className to remove `rounded-[24px] clay-card-static`:
```tsx
// Old:
"relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-[24px] clay-card-static text-foreground ..."

// New:
"relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-xl bg-[var(--surface)] border border-[hsl(var(--border))] shadow-[var(--card-shadow)] text-[hsl(var(--foreground))] ..."
```

Full updated `select.tsx`:
```tsx
import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-9 w-full items-center justify-between rounded-lg border border-[hsl(var(--border))] bg-[var(--surface)] px-3 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton ref={ref} className={cn("flex cursor-default items-center justify-center py-1", className)} {...props}>
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton ref={ref} className={cn("flex cursor-default items-center justify-center py-1", className)} {...props}>
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-xl bg-[var(--surface)] border border-[hsl(var(--border))] shadow-[var(--card-shadow)] text-[hsl(var(--foreground))] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          "p-1",
          position === "popper" && "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label ref={ref} className={cn("py-1.5 pl-8 pr-2 text-sm font-semibold", className)} {...props} />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-md py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-[var(--hover-bg)] focus:text-[hsl(var(--foreground))] data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-[hsl(var(--border))]", className)} {...props} />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select, SelectGroup, SelectValue, SelectTrigger, SelectContent,
  SelectLabel, SelectItem, SelectSeparator, SelectScrollUpButton, SelectScrollDownButton,
};
```

- [ ] **Step 5: Commit**

```bash
git add client/src/components/ui/card.tsx client/src/components/ui/button.tsx client/src/components/ui/input.tsx client/src/components/ui/select.tsx
git commit -m "style: replace clay UI primitives with flat neutral components"
```

---

## Task 3: AppShell — Sidebar & Top Bar

**Files:**
- Modify: `client/src/components/AppShell.tsx`

- [ ] **Step 1: Replace `AppShell.tsx`**

```tsx
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { LayoutDashboard, PlusCircle, Settings, Sun, Moon, LogOut, Bell, Zap } from "lucide-react";

const navItems = [
  { to: "/",         label: "Dashboard",    icon: LayoutDashboard },
  { to: "/upload",   label: "Erfassen",     icon: PlusCircle      },
  { to: "/settings", label: "Einstellungen", icon: Settings       },
];

const PAGE_TITLES: Record<string, string> = {
  "/":         "Dashboard",
  "/upload":   "Erfassen",
  "/review":   "Prüfen",
  "/settings": "Einstellungen",
};

export function AppShell() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const location = useLocation();

  const pageTitle = PAGE_TITLES[location.pathname] ?? "Beleg Manager";
  const initials = user?.email?.substring(0, 2).toUpperCase() ?? "BM";

  return (
    <div className="h-screen-safe flex bg-[hsl(var(--background))] w-full">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-60 bg-[var(--surface)] border-r border-[hsl(var(--border))] py-6 px-4 flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-2 mb-8">
          <Zap className="w-5 h-5 text-[hsl(var(--foreground))]" strokeWidth={2} />
          <span className="font-semibold text-base text-[hsl(var(--foreground))]">Beleg Manager</span>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150",
                  isActive
                    ? "bg-[var(--active-bg)] text-[hsl(var(--foreground))] font-medium"
                    : "text-[hsl(var(--muted-foreground))] hover:bg-[var(--hover-bg)] hover:text-[hsl(var(--foreground))]"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon size={18} strokeWidth={isActive ? 2 : 1.5} />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User / Logout */}
        <div className="mt-auto pt-4 border-t border-[hsl(var(--border))]">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-[var(--active-bg)] flex items-center justify-center text-xs font-semibold text-[hsl(var(--foreground))] flex-shrink-0">
              {initials}
            </div>
            <span className="text-xs text-[hsl(var(--muted-foreground))] truncate flex-1 min-w-0">
              {user?.email ?? ""}
            </span>
            <button
              onClick={logout}
              className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors flex-shrink-0"
              title="Abmelden"
            >
              <LogOut size={16} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[hsl(var(--background))]">
        {/* Top Bar */}
        <header className="flex-shrink-0 h-16 px-8 flex items-center justify-between bg-[var(--surface)] border-b border-[hsl(var(--border))]">
          <span className="text-base font-semibold text-[hsl(var(--foreground))]">{pageTitle}</span>

          <div className="flex items-center gap-3">
            <Link
              to="/upload"
              className="h-9 px-4 rounded-lg bg-[hsl(var(--foreground))] text-[hsl(var(--background))] text-sm font-medium flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <PlusCircle size={16} />
              <span className="hidden sm:inline">Neuer Beleg</span>
            </Link>

            <button className="h-9 w-9 rounded-lg border border-[hsl(var(--border))] flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors relative">
              <Bell size={16} strokeWidth={1.5} />
              <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[hsl(var(--foreground))]" />
            </button>

            <button
              onClick={toggle}
              className="h-9 w-9 rounded-lg border border-[hsl(var(--border))] flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
              aria-label="Theme wechseln"
            >
              {theme === "dark" ? <Sun size={16} strokeWidth={1.5} /> : <Moon size={16} strokeWidth={1.5} />}
            </button>

            <div className="h-9 w-9 rounded-full bg-[var(--active-bg)] text-[hsl(var(--foreground))] flex items-center justify-center font-semibold text-xs">
              {initials}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto px-8 py-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden bg-[var(--surface)] border-t border-[hsl(var(--border))] absolute bottom-0 w-full z-30"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label="Mobile Navigation"
      >
        <div className="flex px-2 py-2">
          {navItems.map(({ to, label, icon: Icon }) => {
            const isActive = to === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors",
                  isActive
                    ? "text-[hsl(var(--foreground))]"
                    : "text-[hsl(var(--muted-foreground))]"
                )}
              >
                <div className={cn("p-1.5 rounded-lg", isActive ? "bg-[var(--active-bg)]" : "")}>
                  <Icon size={20} strokeWidth={isActive ? 2 : 1.5} />
                </div>
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Sidebar should now be white with a right border. Top bar should be white with a bottom border. No green anywhere. Active nav item has a gray background.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/AppShell.tsx
git commit -m "style: redesign AppShell with neutral flat sidebar and top bar"
```

---

## Task 4: Dashboard Page

**Files:**
- Modify: `client/src/pages/Dashboard.tsx`

- [ ] **Step 1: Replace `Dashboard.tsx`**

```tsx
import { Link } from "react-router-dom";
import { KpiCards } from "@/components/stats/KpiCards";
import { MonthlyChart } from "@/components/stats/MonthlyChart";
import { CategoryDonut } from "@/components/stats/CategoryDonut";
import { ReceiptTable } from "@/components/receipts/ReceiptTable";

export function DashboardPage() {
  return (
    <div className="h-full w-full flex flex-col gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">

        {/* Left Column (2/3) */}
        <div className="lg:col-span-2 flex flex-col gap-6">

          {/* KPIs */}
          <div className="bg-[var(--surface)] border border-[hsl(var(--border))] rounded-xl p-6 shadow-[var(--card-shadow)]">
            <h2 className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-5">Übersicht</h2>
            <KpiCards />
          </div>

          {/* Recent Receipts */}
          <div className="bg-[var(--surface)] border border-[hsl(var(--border))] rounded-xl p-6 shadow-[var(--card-shadow)] flex-1 flex flex-col min-h-[400px]">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Zuletzt erfasste Belege</h2>
              <Link
                to="/review"
                className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
              >
                Alle anzeigen →
              </Link>
            </div>
            <div className="flex-1 overflow-auto">
              <ReceiptTable hideFilters />
            </div>
          </div>
        </div>

        {/* Right Column (1/3) */}
        <div className="lg:col-span-1 flex flex-col gap-6">

          {/* Categories */}
          <div className="bg-[var(--surface)] border border-[hsl(var(--border))] rounded-xl p-6 shadow-[var(--card-shadow)] flex-1">
            <h2 className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-5">Kategorien</h2>
            <div className="h-[300px]">
              <CategoryDonut />
            </div>
          </div>

          {/* Trend */}
          <div className="bg-[var(--surface)] border border-[hsl(var(--border))] rounded-xl p-6 shadow-[var(--card-shadow)]">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Trend</h2>
              <span className="text-xs text-[hsl(var(--muted-foreground))]">6 Monate</span>
            </div>
            <div className="h-[220px]">
              <MonthlyChart />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/Dashboard.tsx
git commit -m "style: redesign Dashboard page with flat cards and clean section headers"
```

---

## Task 5: KPI Cards

**Files:**
- Modify: `client/src/components/stats/KpiCards.tsx`

- [ ] **Step 1: Replace `KpiCards.tsx`**

```tsx
import { Skeleton } from "@/components/ui/skeleton";
import { useSummary } from "@/hooks/useStats";
import { formatCurrency } from "@/lib/formatters";

export function KpiCards() {
  const { data, isLoading } = useSummary();
  const cards = [
    { label: "Diesen Monat", value: data ? formatCurrency(data.monthTotal) : "—" },
    { label: "Dieses Jahr",  value: data ? formatCurrency(data.yearTotal)  : "—" },
    { label: "Belege gesamt", value: data ? String(data.count) : "—" },
    { label: "Top-Kategorie", value: data?.topCategory ?? "—" },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="bg-[var(--hover-bg)] rounded-lg p-4 flex flex-col gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            {c.label}
          </span>
          {isLoading ? (
            <Skeleton className="h-8 w-24 rounded" />
          ) : (
            <span className="text-2xl font-bold text-[hsl(var(--foreground))] leading-tight">
              {c.value}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/stats/KpiCards.tsx
git commit -m "style: update KpiCards with neutral flat style"
```

---

## Task 6: Chart Components

**Files:**
- Modify: `client/src/components/stats/CategoryDonut.tsx`
- Modify: `client/src/components/stats/MonthlyChart.tsx`

- [ ] **Step 1: Replace `CategoryDonut.tsx`**

```tsx
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useCategories } from "@/hooks/useStats";
import { formatCurrency } from "@/lib/formatters";

const COLORS = ["#1A1A1A", "#555555", "#888888", "#AAAAAA", "#C8C8C8", "#E0E0E0", "#444444"];

export function CategoryDonut() {
  const { data, isLoading } = useCategories();
  return (
    <div className="h-full w-full">
      {isLoading ? (
        <Skeleton className="h-full w-full rounded-lg" />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data ?? []}
              dataKey="total"
              nameKey="kategorie"
              innerRadius={70}
              outerRadius={100}
              stroke="none"
              paddingAngle={4}
            >
              {(data ?? []).map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                borderRadius: '8px',
                border: '1px solid hsl(var(--border))',
                boxShadow: 'var(--card-shadow)',
                background: 'var(--surface)',
                backdropFilter: 'none',
              }}
              formatter={(v: number) => formatCurrency(v)}
            />
            <Legend
              verticalAlign="bottom"
              height={36}
              iconType="circle"
              formatter={(v) => (
                <span style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))' }}>{v}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Replace `MonthlyChart.tsx`**

```tsx
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { useMonthly } from "@/hooks/useStats";
import { formatCurrency, formatMonthLabel } from "@/lib/formatters";

export function MonthlyChart() {
  const { data, isLoading } = useMonthly();
  return (
    <div className="h-full w-full">
      {isLoading ? (
        <Skeleton className="h-full w-full rounded-lg" />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={(data ?? []).map((d) => ({ ...d, label: formatMonthLabel(d.ym) }))}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11, fontWeight: 500 }}
              dy={10}
            />
            <YAxis
              tickFormatter={(v) => formatCurrency(Number(v))}
              width={60}
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11, fontWeight: 500 }}
            />
            <Tooltip
              contentStyle={{
                borderRadius: '8px',
                border: '1px solid hsl(var(--border))',
                boxShadow: 'var(--card-shadow)',
                background: 'var(--surface)',
              }}
              formatter={(v: number) => [formatCurrency(v), "Ausgaben"]}
            />
            <Line
              type="monotone"
              dataKey="total"
              stroke="hsl(var(--foreground))"
              strokeWidth={2}
              dot={{ r: 3, fill: 'hsl(var(--foreground))', strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/stats/CategoryDonut.tsx client/src/components/stats/MonthlyChart.tsx
git commit -m "style: update charts with neutral colors and flat tooltips"
```

---

## Task 7: Receipt Table Row Hover

**Files:**
- Modify: `client/src/components/receipts/ReceiptTable.tsx`

The only change needed is on the `<TableRow>` hover class (line 173).

- [ ] **Step 1: Fix the row hover color in `ReceiptTable.tsx`**

Find this line:
```tsx
<TableRow key={r.id} className="group hover:bg-[var(--brand-primary)]/[0.03] transition-colors border-b border-gray-100/50">
```

Replace with:
```tsx
<TableRow key={r.id} className="group hover:bg-[var(--hover-bg)] transition-colors border-b border-[hsl(var(--border))]">
```

Also update the static header row:
```tsx
// Old:
<TableRow className="hover:bg-transparent border-b border-gray-100">
// New:
<TableRow className="hover:bg-transparent border-b border-[hsl(var(--border))]">
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/receipts/ReceiptTable.tsx
git commit -m "style: fix receipt table row hover and border colors"
```

---

## Task 8: Login Page

**Files:**
- Modify: `client/src/pages/Login.tsx`

- [ ] **Step 1: Replace `Login.tsx`**

```tsx
import { Button } from "@/components/ui/button";
import { Receipt } from "lucide-react";

export function LoginPage() {
  return (
    <div className="h-screen flex items-center justify-center p-4 bg-[hsl(var(--background))]">
      <div className="w-full max-w-sm space-y-8">

        {/* Logo mark */}
        <div className="flex flex-col items-center gap-5">
          <div className="w-20 h-20 rounded-2xl bg-[var(--active-bg)] border border-[hsl(var(--border))] flex items-center justify-center">
            <Receipt className="h-10 w-10 text-[hsl(var(--foreground))]" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Beleg-Manager</h1>
            <p className="text-[hsl(var(--muted-foreground))] text-sm mt-1">Belege smart erfassen</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-[var(--surface)] border border-[hsl(var(--border))] rounded-xl p-8 shadow-[var(--card-shadow)] space-y-6">
          <div className="space-y-1.5 text-center">
            <h2 className="font-semibold text-lg text-[hsl(var(--foreground))]">Willkommen zurück</h2>
            <p className="text-[hsl(var(--muted-foreground))] text-sm leading-relaxed">
              Melde dich an, um Belege per Foto, Sprache oder Drive zu erfassen.
            </p>
          </div>

          <Button asChild className="w-full">
            <a href="/api/auth/google" className="flex items-center justify-center gap-3">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Mit Google anmelden
            </a>
          </Button>

          <p className="text-center text-[hsl(var(--muted-foreground))] text-xs">
            Sichere OAuth 2.0 Authentifizierung
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/Login.tsx
git commit -m "style: update Login page with neutral flat design"
```

---

## Task 9: Final Visual Verification

- [ ] **Step 1: Check for remaining legacy class usages**

```bash
cd client && grep -r "clay-btn\|gradient-text\|clay-card\|brand-primary\|brand-secondary\|#2A735E\|#10B981\|#A78BFA\|#7C3AED\|Nunito" src --include="*.tsx" --include="*.ts" --include="*.css" -l
```

If any files show up besides `index.css` (which redefines the classes), investigate and fix.

- [ ] **Step 2: Visual walkthrough in browser**

Navigate each page:
- `/` — Dashboard: flat cards, neutral KPIs, clean charts
- `/upload` — Upload page: neutral inputs and buttons
- `/review` — Review page: neutral table
- `/settings` — Settings: neutral form elements
- Login page (sign out first to verify)
- Toggle dark mode — verify dark theme looks correct

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "style: complete Squire-style neutral redesign — visual verification passed"
```
