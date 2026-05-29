import { useEffect, useRef, useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

const ITEM_H = 44;
const VISIBLE = 5;

// ── Drum (internal) ──────────────────────────────────────────────────────────

interface DrumProps {
  count: number;
  selectedIndex: number;
  label: (i: number) => string;
  onChange: (i: number) => void;
}

function Drum({ count, selectedIndex, label, onChange }: DrumProps) {
  const offsetRef = useRef(selectedIndex);
  const [offset, setOffset] = useState(selectedIndex);
  const animRef = useRef<number>();
  const isDragging = useRef(false);
  const dragAnchor = useRef<{ y: number; offset: number } | null>(null);

  useEffect(() => {
    if (!isDragging.current) animateTo(selectedIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex]);

  function setOff(v: number) {
    offsetRef.current = v;
    setOffset(v);
  }

  function animateTo(target: number) {
    const to = Math.max(0, Math.min(count - 1, Math.round(target)));
    cancelAnimationFrame(animRef.current!);
    const from = offsetRef.current;
    if (from === to) { setOff(to); return; }
    const t0 = performance.now();
    const dur = 180;
    function frame(now: number) {
      const t = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      setOff(from + (to - from) * e);
      if (t < 1) animRef.current = requestAnimationFrame(frame);
      else { setOff(to); onChange(to); }
    }
    animRef.current = requestAnimationFrame(frame);
  }

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    cancelAnimationFrame(animRef.current!);
    isDragging.current = true;
    dragAnchor.current = { y: e.clientY, offset: offsetRef.current };
    function onMove(ev: MouseEvent) {
      if (!dragAnchor.current) return;
      const raw = dragAnchor.current.offset + (dragAnchor.current.y - ev.clientY) / ITEM_H;
      setOff(Math.max(-0.4, Math.min(count - 0.6, raw)));
    }
    function onUp() {
      isDragging.current = false;
      dragAnchor.current = null;
      animateTo(offsetRef.current);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function onTouchStart(e: React.TouchEvent) {
    cancelAnimationFrame(animRef.current!);
    isDragging.current = true;
    dragAnchor.current = { y: e.touches[0]?.clientY ?? 0, offset: offsetRef.current };
  }
  function onTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    if (!dragAnchor.current) return;
    const raw = dragAnchor.current.offset + (dragAnchor.current.y - (e.touches[0]?.clientY ?? 0)) / ITEM_H;
    setOff(Math.max(-0.4, Math.min(count - 0.6, raw)));
  }
  function onTouchEnd() {
    isDragging.current = false;
    dragAnchor.current = null;
    animateTo(offsetRef.current);
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const step = e.deltaY > 0 ? 1 : -1;
    animateTo(Math.max(0, Math.min(count - 1, Math.round(offsetRef.current) + step)));
  }

  const center = Math.round(offset);
  const half = Math.floor(VISIBLE / 2) + 2;
  const from = Math.max(0, center - half);
  const to = Math.min(count - 1, center + half);

  return (
    <div
      className="relative overflow-hidden touch-none"
      style={{ height: ITEM_H * VISIBLE, cursor: "ns-resize" }}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onWheel={onWheel}
    >
      {/* Selection highlight */}
      <div
        className="pointer-events-none absolute inset-x-3 rounded-lg bg-muted/50 border border-border/60"
        style={{ top: ITEM_H * Math.floor(VISIBLE / 2), height: ITEM_H, zIndex: 0 }}
      />

      {/* Items */}
      {Array.from({ length: to - from + 1 }, (_, i) => {
        const idx = from + i;
        const y = (idx - offset + Math.floor(VISIBLE / 2)) * ITEM_H;
        const dist = Math.abs(idx - offset);
        const isSelected = idx === center;
        return (
          <div
            key={idx}
            style={{
              position: "absolute",
              inset: "0 0 auto 0",
              height: ITEM_H,
              transform: `translateY(${y}px)`,
              opacity: Math.max(0.15, 1 - dist * 0.45),
              zIndex: 1,
            }}
            className="flex items-center justify-center select-none"
            onClick={() => animateTo(idx)}
          >
            <span
              className={cn(
                "font-mono transition-all duration-100",
                isSelected ? "text-foreground font-bold text-2xl" : "text-muted-foreground text-xl"
              )}
            >
              {label(idx)}
            </span>
          </div>
        );
      })}

      {/* Top fade */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0"
        style={{
          height: ITEM_H * 2,
          background: "linear-gradient(to bottom, hsl(var(--background)) 0%, transparent 100%)",
          zIndex: 2,
        }}
      />
      {/* Bottom fade */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{
          height: ITEM_H * 2,
          background: "linear-gradient(to top, hsl(var(--background)) 0%, transparent 100%)",
          zIndex: 2,
        }}
      />
    </div>
  );
}

// ── CurrencySpinner ───────────────────────────────────────────────────────────

export interface CurrencySpinnerProps {
  value: number;
  onChange: (value: number) => void;
  maxEuros?: number;
}

export function CurrencySpinner({ value, onChange, maxEuros = 9999 }: CurrencySpinnerProps) {
  const euros = Math.max(0, Math.min(maxEuros, Math.floor(value)));
  const cents = Math.round((value - Math.floor(value)) * 100) % 100;

  return (
    <div className="flex items-stretch rounded-xl border border-border/50 bg-background overflow-hidden w-[260px]">
      <div className="flex-1">
        <Drum
          count={maxEuros + 1}
          selectedIndex={euros}
          label={(i) => String(i)}
          onChange={(i) => onChange(Math.round((i + cents / 100) * 100) / 100)}
        />
      </div>
      <div
        className="flex items-center justify-center px-1 bg-muted/10"
        style={{ height: ITEM_H * VISIBLE }}
      >
        <span className="font-mono text-2xl font-bold text-muted-foreground select-none">,</span>
      </div>
      <div className="w-[72px]">
        <Drum
          count={100}
          selectedIndex={cents}
          label={(i) => i.toString().padStart(2, "0")}
          onChange={(i) => onChange(Math.round((euros + i / 100) * 100) / 100)}
        />
      </div>
    </div>
  );
}

// ── CurrencySpinnerInput (trigger + popover) ──────────────────────────────────

export interface CurrencySpinnerInputProps {
  value: number;
  onChange: (value: number) => void;
  maxEuros?: number;
  currency?: string;
  className?: string;
}

export function CurrencySpinnerInput({
  value,
  onChange,
  maxEuros,
  currency = "EUR",
  className,
}: CurrencySpinnerInputProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  // Sync draft when popover opens
  function handleOpenChange(next: boolean) {
    if (next) setDraft(value);
    else onChange(Math.round(draft * 100) / 100);
    setOpen(next);
  }

  const euros = Math.floor(value);
  const cents = Math.round((value - euros) * 100) % 100;
  const display = `${euros},${cents.toString().padStart(2, "0")} ${currency}`;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2",
            "text-sm font-mono ring-offset-background",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "hover:bg-accent/5",
            className
          )}
        >
          <span>{display}</span>
          <span className="text-muted-foreground text-xs">▾</span>
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          className={cn(
            "z-50 rounded-2xl border border-border/60 bg-background shadow-xl",
            "p-3 outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
          sideOffset={6}
          align="center"
        >
          <CurrencySpinner value={draft} onChange={setDraft} maxEuros={maxEuros} />
          <PopoverPrimitive.Close asChild>
            <button
              type="button"
              className={cn(
                "mt-3 w-full rounded-xl py-2 text-sm font-semibold",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 active:opacity-80 transition-opacity"
              )}
            >
              Fertig
            </button>
          </PopoverPrimitive.Close>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
