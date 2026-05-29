import { useEffect, useMemo, useState } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Minus,
  Trash2,
  Sparkles,
  Loader2,
  FileImage,
  Pencil,
  SplitSquareHorizontal,
} from "lucide-react";
import { splitRequestsApi } from "@/api/splitRequests";
import { useKnownPersons } from "@/hooks/useSplitRequests";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency, formatDateIso } from "@/lib/formatters";
import { PersonPicker, type Item } from "@/components/splits/PersonPicker";
import { CurrencySpinnerInput } from "@/components/ui/currency-spinner";
import { receiptsApi } from "@/api/receipts";
import { ReceiptForm } from "./ReceiptForm";
import type { ReceiptRow } from "@/types/receipt";
import type { OutgoingRequest } from "@/api/splitRequests";
import type { ReceiptFormValues } from "@/lib/validators";

type MainTab = "beleg" | "details" | "aufteilen";
type SplitMode = "gesamtbetrag" | "positions";
type EditPosition = { name: string; amount: number; quantity: number };

interface ReceiptDetailModalProps {
  receipt: ReceiptRow | null;
  initialTab?: MainTab;
  onClose: () => void;
  onEdit: (values: ReceiptFormValues) => Promise<void>;
  editBusy: boolean;
  existingSplits: OutgoingRequest[];
}

export function ReceiptDetailModal({
  receipt,
  initialTab = "details",
  onClose,
  onEdit,
  editBusy,
  existingSplits,
}: ReceiptDetailModalProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: knownPersons = [] } = useKnownPersons();

  const [mainTab, setMainTab] = useState<MainTab>(initialTab);
  const [splitMode, setSplitMode] = useState<SplitMode>("gesamtbetrag");
  const [splitCount, setSplitCount] = useState(2);
  const [items, setItems] = useState<Item[]>([
    {
      toUser: null,
      freeName: "",
      betrag: "",
      searchInput: "",
      showDropdown: false,
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [isPdf, setIsPdf] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [positions, setPositions] = useState<
    Array<{ name: string; amount: number; quantity?: number }>
  >([]);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [positionAssignments, setPositionAssignments] = useState<
    Record<number, string[]>
  >({});
  const [positionQuantityAssignments, setPositionQuantityAssignments] =
    useState<Record<number, Record<string, number>>>({});
  const [positionSplitMode, setPositionSplitMode] = useState<Record<number, "quantity" | "amount">>({});

  // Positions editor state
  const [editPositions, setEditPositions] = useState<EditPosition[]>([]);
  const [editPositionsBusy, setEditPositionsBusy] = useState(false);

  const totalAmount = receipt?.betrag ?? 0;
  const waehrung = receipt?.waehrung ?? "EUR";
  const hasExisting = existingSplits.length > 0;
  const hasImage = Boolean(receipt?.driveLink);

  useEffect(() => {
    if (!receipt) return;
    setMainTab(initialTab);
    setSplitMode("gesamtbetrag");
    if (existingSplits.length > 0) {
      setSplitCount(existingSplits.length + 1);
      setItems(
        existingSplits.map((r) => ({
          toUser: r.toUser,
          freeName: r.freeName ?? "",
          betrag: String(r.betrag),
          searchInput: r.toUser?.name ?? r.freeName ?? "",
          showDropdown: false,
        })),
      );
    } else {
      setSplitCount(2);
      setItems([{
        toUser: null,
        freeName: "",
        betrag: (Math.round((totalAmount / 2) * 100) / 100).toFixed(2),
        searchInput: "",
        showDropdown: false,
      }]);
    }
    setIsPdf(false);
    setImageLoaded(false);
    setPositions([]);
    setPositionAssignments({});
    setPositionQuantityAssignments({});
    setPositionSplitMode({});
    setEditPositions([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt?.id]);

  useEffect(() => {
    if (receipt && positions.length === 0 && !loadingPositions) loadPositions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt?.id, positions.length]);

  function parsePositionName(raw: string): { name: string; quantity: number } {
    const m = raw.match(/^(\d+)\s*[x×]\s*(.+)$/i);
    if (m) return { quantity: parseInt(m[1]!, 10), name: m[2]!.trim() };
    return { quantity: 1, name: raw };
  }

  async function loadPositions() {
    if (!receipt) return;
    setLoadingPositions(true);
    try {
      const res = await receiptsApi.extractPositions(receipt.id);
      const items = res.items || [];
      setPositions(items);
      setEditPositions(
        items.map((p) => {
          const rawName = p.name ?? "";
          const amount =
            typeof p.amount === "number" && isFinite(p.amount) ? p.amount : 0;
          if (p.quantity && p.quantity > 1) {
            return { name: rawName, amount, quantity: p.quantity };
          }
          const parsed = parsePositionName(rawName);
          return { name: parsed.name, amount, quantity: parsed.quantity };
        }),
      );

      const initialAssign: Record<number, string[]> = {};
      const initialQty: Record<number, Record<string, number>> = {};
      items.forEach((pos, i) => {
        initialAssign[i] = ["owner"];
        if (pos.quantity && pos.quantity > 1) {
          initialQty[i] = { owner: pos.quantity };
        }
      });
      setPositionAssignments(initialAssign);
      setPositionQuantityAssignments(initialQty);
    } catch {
      toast({
        title: "Positionen konnten nicht ausgelesen werden",
        variant: "destructive",
      });
    } finally {
      setLoadingPositions(false);
    }
  }

  // ── Split items helpers ──────────────────────────────────────────────────

  function applySplitCount(n: number) {
    const clamped = Math.max(2, Math.min(10, n));
    setSplitCount(clamped);
    const share = (Math.round((totalAmount / clamped) * 100) / 100).toFixed(2);
    setItems((prev) =>
      Array.from({ length: clamped - 1 }, (_, i) => ({
        toUser: prev[i]?.toUser ?? null,
        freeName: prev[i]?.freeName ?? "",
        searchInput: prev[i]?.searchInput ?? "",
        showDropdown: false,
        betrag: share,
      })),
    );
  }

  function addItem() {
    setSplitCount((c) => c + 1);
    const newCount = splitCount + 1;
    const share = (Math.round((totalAmount / newCount) * 100) / 100).toFixed(2);
    setItems((prev) => [
      ...prev.map((item) => ({ ...item, betrag: share })),
      {
        toUser: null,
        freeName: "",
        betrag: share,
        searchInput: "",
        showDropdown: false,
      },
    ]);
  }

  function removeItem(idx: number) {
    setSplitCount((c) => Math.max(2, c - 1));
    setItems((prev) => prev.filter((_, i) => i !== idx));
    setPositionAssignments((prev) => {
      const next: Record<number, string[]> = {};
      for (const [key, assigned] of Object.entries(prev)) {
        const cleaned = assigned
          .map((pId) => {
            if (pId === "owner") return pId;
            const n = parseInt(pId.replace("item-", ""), 10);
            if (n === idx) return null;
            return n > idx ? `item-${n - 1}` : pId;
          })
          .filter((x): x is string => x !== null);
        next[parseInt(key, 10)] = cleaned.length === 0 ? ["owner"] : cleaned;
      }
      return next;
    });
    setPositionQuantityAssignments((prev) => {
      const next: Record<number, Record<string, number>> = {};
      for (const [posKey, assignments] of Object.entries(prev)) {
        const newAssignments: Record<string, number> = {};
        for (const [pId, units] of Object.entries(assignments)) {
          if (pId === "owner") {
            newAssignments[pId] = units;
          } else {
            const n = parseInt(pId.replace("item-", ""), 10);
            if (n === idx) continue;
            const newId = n > idx ? `item-${n - 1}` : pId;
            newAssignments[newId] = units;
          }
        }
        next[parseInt(posKey, 10)] = newAssignments;
      }
      return next;
    });
  }

  function updateItem(idx: number, updates: Partial<Item>) {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, ...updates } : item)),
    );
  }

  function toggleAssignment(pIdx: number, pId: string) {
    setPositionAssignments((prev) => {
      const current = prev[pIdx] || ["owner"];
      const next = current.includes(pId)
        ? current.filter((x) => x !== pId)
        : [...current, pId];
      return { ...prev, [pIdx]: next };
    });
  }

  function setQuantityAssignment(
    pIdx: number,
    participantId: string,
    units: number,
  ) {
    const pos = positions[pIdx];
    const totalQty = pos?.quantity ?? 1;
    setPositionQuantityAssignments((prev) => {
      const current =
        prev[pIdx] || (pos?.quantity ? { owner: pos.quantity } : {});
      const otherTotal = Object.entries(current)
        .filter(([id]) => id !== participantId)
        .reduce((s, [, u]) => s + u, 0);
      const clamped = Math.max(0, Math.min(totalQty - otherTotal, units));
      return {
        ...prev,
        [pIdx]: { ...current, [participantId]: clamped },
      };
    });
  }

  const participants = useMemo(
    () => [
      { id: "owner", name: "Ich" },
      ...items.map((item, idx) => ({
        id: `item-${idx}`,
        name: item.toUser
          ? item.toUser.name
          : item.freeName || `Person ${idx + 1}`,
      })),
    ],
    [items],
  );

  // Recalculate betrag per person based on position assignments
  useEffect(() => {
    if (splitMode !== "positions" || positions.length === 0) return;
    const newAmounts = items.map(() => 0);
    positions.forEach((pos, pIdx) => {
      const useQty = pos.quantity && pos.quantity > 1 && (positionSplitMode[pIdx] ?? "quantity") === "quantity";
      if (useQty) {
        const qtyAssignments = positionQuantityAssignments[pIdx] || {
          owner: pos.quantity,
        };
        for (const [pId, units] of Object.entries(qtyAssignments)) {
          if (pId === "owner" || !units) continue;
          const n = parseInt(pId.replace("item-", ""), 10);
          if (!isNaN(n) && n >= 0 && n < newAmounts.length) {
            newAmounts[n] =
              (newAmounts[n] ?? 0) + (units / pos.quantity!) * pos.amount;
          }
        }
      } else {
        const assigned = positionAssignments[pIdx] || ["owner"];
        if (!assigned.length) return;
        const share = pos.amount / assigned.length;
        assigned.forEach((pId) => {
          if (pId === "owner") return;
          const n = parseInt(pId.replace("item-", ""), 10);
          if (!isNaN(n) && n >= 0 && n < newAmounts.length)
            newAmounts[n] = (newAmounts[n] ?? 0) + share;
        });
      }
    });
    setItems((prev) =>
      prev.map((item, idx) => {
        const val = newAmounts[idx] ?? 0;
        const next = val > 0 ? (Math.round(val * 100) / 100).toFixed(2) : "";
        return item.betrag === next ? item : { ...item, betrag: next };
      }),
    );
  }, [
    positionAssignments,
    positionQuantityAssignments,
    positionSplitMode,
    positions,
    items.length,
    splitMode,
  ]);

  // ── Positions editor helpers ─────────────────────────────────────────────

  function addEditPosition() {
    setEditPositions((prev) => [...prev, { name: "", amount: 0, quantity: 1 }]);
  }

  function removeEditPosition(i: number) {
    setEditPositions((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateEditPosition(i: number, updates: Partial<EditPosition>) {
    setEditPositions((prev) =>
      prev.map((p, idx) => (idx === i ? { ...p, ...updates } : p)),
    );
  }

  async function handleSavePositions() {
    if (!receipt) return;
    const valid = editPositions
      .filter((p) => p.name.trim())
      .map((p) => ({
        name: p.name.trim(),
        amount:
          typeof p.amount === "number" && isFinite(p.amount) ? p.amount : 0,
        quantity: Math.max(1, Math.floor(p.quantity || 1)),
      }));
    setEditPositionsBusy(true);
    try {
      await receiptsApi.updatePositions(receipt.id, valid);
      setPositions(valid);
      qc.invalidateQueries({ queryKey: ["receipts"] });
      toast({ title: "Positionen gespeichert" });
    } catch {
      toast({ title: "Fehler beim Speichern", variant: "destructive" });
    } finally {
      setEditPositionsBusy(false);
    }
  }

  const editPositionsSum = editPositions.reduce((s, p) => s + p.amount, 0);

  // ── Split submit ─────────────────────────────────────────────────────────

  async function handleSplitSubmit() {
    if (!receipt) return;
    const valid = items
      .map((i, idx) =>
        splitMode === "positions" && !i.toUser && !i.freeName.trim() && !i.searchInput.trim()
          ? { ...i, freeName: `Person ${idx + 1}` }
          : i,
      )
      .filter(
        (i) =>
          (i.toUser || i.freeName.trim() || i.searchInput.trim()) &&
          parseFloat(i.betrag) > 0,
      );
    if (!valid.length) return;
    setBusy(true);
    try {
      if (existingSplits.length > 0) {
        await Promise.all(
          existingSplits.map((r) => splitRequestsApi.delete(r.id)),
        );
      }
      const driveFileId =
        receipt.driveLink?.match(/\/file\/d\/([^/?]+)/)?.[1] ?? null;
      const positionsPayload =
        splitMode === "positions" && positions.length > 0
          ? positions.map((pos, pIdx) => {
              const useQty = pos.quantity && pos.quantity > 1 && (positionSplitMode[pIdx] ?? "quantity") === "quantity";
              if (useQty) {
                const qtyAssignments = positionQuantityAssignments[pIdx] || {
                  owner: pos.quantity,
                };
                const assigned = Object.entries(qtyAssignments)
                  .filter(([, units]) => (units ?? 0) > 0)
                  .map(([pId, units]) => {
                    if (pId === "owner")
                      return units === pos.quantity ? "Ich" : `Ich (${units}×)`;
                    const n = parseInt(pId.replace("item-", ""), 10);
                    const it = items[n];
                    const name = it
                      ? it.toUser
                        ? it.toUser.name
                        : it.freeName.trim() ||
                          it.searchInput.trim() ||
                          `Person ${n + 1}`
                      : `Person ${n + 1}`;
                    return units === 1 ? name : `${name} (${units}×)`;
                  });
                return { name: pos.name, amount: pos.amount, assigned };
              }
              return {
                name: pos.name,
                amount: pos.amount,
                assigned: (positionAssignments[pIdx] || ["owner"]).map((id) => {
                  if (id === "owner") return "Ich";
                  const n = parseInt(id.replace("item-", ""), 10);
                  const it = items[n];
                  return it
                    ? it.toUser
                      ? it.toUser.name
                      : it.freeName.trim() ||
                        it.searchInput.trim() ||
                        `Person ${n + 1}`
                    : `Person ${n + 1}`;
                }),
              };
            })
          : null;
      await Promise.all(
        valid.map((i) =>
          splitRequestsApi.create({
            toUserId: i.toUser?.id,
            freeName: i.toUser
              ? undefined
              : i.freeName.trim() || i.searchInput.trim(),
            receiptId: driveFileId ?? undefined,
            receiptSqliteId: receipt.id,
            receiptMeta: {
              haendler: receipt.haendler || "Unbekannt",
              datum: receipt.datum || new Date().toISOString().slice(0, 10),
              gesamtbetrag: receipt.betrag || 0,
              waehrung: receipt.waehrung || "EUR",
            },
            betrag: parseFloat(i.betrag),
            nachricht: "",
            positions: positionsPayload,
          }),
        ),
      );
      qc.invalidateQueries({ queryKey: ["split-requests"] });
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      toast({
        title: hasExisting
          ? "Aufteilung aktualisiert"
          : "Aufteilung gespeichert",
      });
      onClose();
    } catch {
      toast({ title: "Fehler beim Speichern", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const totalAssigned = items.reduce(
    (s, i) => s + (parseFloat(i.betrag) || 0),
    0,
  );
  const remaining = Math.round((totalAmount - totalAssigned) * 100) / 100;

  const TRIGGER_BASE =
    "flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-all duration-150 " +
    "text-muted-foreground hover:text-foreground " +
    "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border/40";

  return (
    <Dialog
      open={receipt !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className={[
          "flex flex-col gap-0 p-0 overflow-hidden",
          "left-0 top-0 translate-x-0 translate-y-0 w-screen h-screen max-w-none rounded-none",
          "md:left-[50%] md:top-[50%] md:-translate-x-1/2 md:-translate-y-1/2 md:w-auto md:h-[85vh] md:max-w-2xl md:rounded-2xl",
        ].join(" ")}
      >
        {/* ── Header ───────────────────────────────────────────── */}
        <DialogHeader className="flex-shrink-0 px-5 pt-3 pb-3 border-b border-border/40">
          <DialogTitle className="text-base">
            {receipt?.haendler ?? "Beleg"}
          </DialogTitle>
          {receipt && (
            <DialogDescription className="text-xs">
              {formatDateIso(receipt.datum)} ·{" "}
              {formatCurrency(receipt.betrag, receipt.waehrung)}
              {receipt.kategorie ? ` · ${receipt.kategorie}` : ""}
            </DialogDescription>
          )}
        </DialogHeader>

        {receipt && (
          <Tabs
            value={mainTab}
            onValueChange={(v) => setMainTab(v as MainTab)}
            className="flex flex-col flex-1 overflow-hidden min-h-0"
          >
            {/* ── Tab bar ──────────────────────────────────────── */}
            <div className="flex-shrink-0 px-4 py-2.5 border-b border-border/40 bg-muted/10">
              <TabsList
                className={[
                  "grid w-full p-1 h-auto gap-1",
                  "bg-muted/50 rounded-xl border border-border/30",
                  hasImage ? "grid-cols-3" : "grid-cols-2",
                ].join(" ")}
              >
                {hasImage && (
                  <TabsTrigger value="beleg" className={TRIGGER_BASE}>
                    <FileImage className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>Beleg</span>
                  </TabsTrigger>
                )}
                <TabsTrigger value="details" className={TRIGGER_BASE}>
                  <Pencil className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>Bearbeiten</span>
                </TabsTrigger>
                <TabsTrigger value="aufteilen" className={TRIGGER_BASE}>
                  <SplitSquareHorizontal className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>Aufteilen</span>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ── Beleg ────────────────────────────────────────── */}
            {hasImage && (
              <TabsContent
                value="beleg"
                className="relative flex-1 min-h-0 m-0 outline-none overflow-hidden data-[state=inactive]:hidden"
              >
                {isPdf ? (
                  <iframe
                    src={receiptsApi.previewUrl(receipt.id)}
                    className="w-full h-full border-0"
                    title="Beleg Vorschau"
                  />
                ) : (
                  <>
                    {!imageLoaded && (
                      <div className="absolute inset-0 flex items-center justify-center bg-muted/20 z-10">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    <TransformWrapper
                      minScale={0.5}
                      maxScale={8}
                      wheel={{ step: 0.05 }}
                      doubleClick={{ mode: "reset" }}
                      panning={{ velocityDisabled: true }}
                      centerOnInit={true}
                    >
                      <TransformComponent
                        wrapperStyle={{
                          width: "100%",
                          height: "100%",
                          touchAction: "none",
                        }}
                        contentStyle={{
                          width: "100%",
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                        }}
                      >
                        <img
                          src={receiptsApi.previewUrl(receipt.id)}
                          className="w-full h-auto select-none block"
                          alt="Beleg"
                          draggable={false}
                          onLoad={() => setImageLoaded(true)}
                          onError={() => {
                            setIsPdf(true);
                            setImageLoaded(true);
                          }}
                        />
                      </TransformComponent>
                    </TransformWrapper>
                  </>
                )}
              </TabsContent>
            )}

            {/* ── Details ──────────────────────────────────────── */}
            <TabsContent
              value="details"
              className="flex-1 min-h-0 overflow-y-auto m-0 outline-none data-[state=inactive]:hidden"
            >
              <div className="px-5 py-5 space-y-6">
                <ReceiptForm
                  initial={{
                    datum: receipt.datum,
                    haendler: receipt.haendler,
                    betrag: receipt.betrag,
                    mwst: receipt.mwst,
                    trinkgeld: receipt.trinkgeld,
                    waehrung: receipt.waehrung,
                    kategorie: receipt.kategorie,
                    zahlungsmethode: receipt.zahlungsmethode,
                    rechnungsnummer: receipt.rechnungsnummer,
                  }}
                  busy={editBusy}
                  onSubmit={onEdit}
                  submitLabel="Änderungen speichern"
                />

                {/* ── Positionen-Editor ──────────────────────── */}
                <div className="space-y-3 border-t border-border/40 pt-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Positionen</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={addEditPosition}
                      className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                    >
                      <Plus className="h-3.5 w-3.5" /> Position
                    </Button>
                  </div>

                  {loadingPositions ? (
                    <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Positionen werden geladen…</span>
                    </div>
                  ) : editPositions.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-1">
                      Keine Positionen erfasst.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {editPositions.map((pos, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-border/60 bg-card p-3 space-y-2.5"
                        >
                          {/* Title row */}
                          <div className="flex gap-2 items-center">
                            <Input
                              value={pos.name}
                              onChange={(e) =>
                                updateEditPosition(i, { name: e.target.value })
                              }
                              placeholder="Bezeichnung"
                              className="flex-1 h-8 text-sm font-medium"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 flex-shrink-0"
                              onClick={() => removeEditPosition(i)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                          {/* Anzahl + Betrag row */}
                          <div className="flex gap-3 items-center">
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">
                                Anzahl
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateEditPosition(i, {
                                      quantity: Math.max(1, pos.quantity - 1),
                                    })
                                  }
                                  disabled={pos.quantity <= 1}
                                  className="h-8 w-8 rounded-md border border-border/60 flex items-center justify-center text-base leading-none hover:bg-muted disabled:opacity-30 transition-colors"
                                >
                                  −
                                </button>
                                <span className="w-8 text-center text-sm font-mono font-semibold tabular-nums">
                                  {pos.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateEditPosition(i, {
                                      quantity: pos.quantity + 1,
                                    })
                                  }
                                  className="h-8 w-8 rounded-md border border-border/60 flex items-center justify-center text-base leading-none hover:bg-muted transition-colors"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1 flex-1">
                              <span className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">
                                Betrag gesamt
                              </span>
                              <div className="flex gap-1.5 items-center">
                                <button
                                  type="button"
                                  title={
                                    pos.amount < 0
                                      ? "Rabatt (negativ)"
                                      : "Normaler Betrag"
                                  }
                                  onClick={() =>
                                    updateEditPosition(i, {
                                      amount: -pos.amount,
                                    })
                                  }
                                  className={[
                                    "h-9 w-9 flex-shrink-0 rounded-md border text-sm font-bold transition-colors",
                                    pos.amount < 0
                                      ? "border-destructive/60 bg-destructive/10 text-destructive"
                                      : "border-border/60 bg-transparent text-muted-foreground hover:bg-muted",
                                  ].join(" ")}
                                >
                                  {pos.amount < 0 ? "−" : "+"}
                                </button>
                                <CurrencySpinnerInput
                                  value={Math.abs(pos.amount)}
                                  onChange={(v) =>
                                    updateEditPosition(i, {
                                      amount: pos.amount < 0 ? -v : v,
                                    })
                                  }
                                  maxEuros={9999}
                                  currency={waehrung}
                                  className="flex-1"
                                />
                              </div>
                            </div>
                          </div>
                          {/* Unit price hint when quantity > 1 */}
                          {pos.quantity > 1 && pos.amount > 0 && (
                            <p className="text-[11px] text-muted-foreground">
                              {formatCurrency(
                                Math.round((pos.amount / pos.quantity) * 100) /
                                  100,
                                waehrung,
                              )}{" "}
                              / Stück
                            </p>
                          )}
                        </div>
                      ))}

                      {/* Running total */}
                      <div className="flex justify-between items-center border-t border-border/40 pt-2 text-sm font-semibold">
                        <span className="text-muted-foreground">Summe</span>
                        <span className="font-mono">
                          {formatCurrency(editPositionsSum, waehrung)}
                        </span>
                      </div>

                      <Button
                        size="sm"
                        onClick={handleSavePositions}
                        disabled={
                          editPositionsBusy ||
                          editPositions.every((p) => !p.name.trim())
                        }
                        className="w-full"
                      >
                        {editPositionsBusy
                          ? "Speichern…"
                          : `Positionen & Betrag speichern (${formatCurrency(editPositionsSum, waehrung)})`}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* ── Aufteilen ────────────────────────────────────── */}
            <TabsContent
              value="aufteilen"
              className="flex flex-col flex-1 min-h-0 overflow-hidden m-0 outline-none data-[state=inactive]:hidden"
            >
              {/* Split-mode toggle */}
              <div className="flex-shrink-0 px-5 pt-4 pb-3">
                <div className="flex rounded-lg border border-border/40 overflow-hidden text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setSplitMode("gesamtbetrag")}
                    className={[
                      "flex-1 py-2 transition-colors",
                      splitMode === "gesamtbetrag"
                        ? "bg-foreground text-background"
                        : "bg-transparent text-muted-foreground hover:bg-muted/50",
                    ].join(" ")}
                  >
                    Gesamtbetrag
                  </button>
                  <div className="w-px bg-border/40" />
                  <button
                    type="button"
                    onClick={() => setSplitMode("positions")}
                    className={[
                      "flex-1 py-2 transition-colors",
                      splitMode === "positions"
                        ? "bg-foreground text-background"
                        : "bg-transparent text-muted-foreground hover:bg-muted/50",
                    ].join(" ")}
                  >
                    Einzelpositionen
                  </button>
                </div>
              </div>

              {/* Scrollable split content */}
              <div className="flex-1 overflow-y-auto px-5">
                {splitMode === "gesamtbetrag" ? (
                  <div className="space-y-3 pb-4">
                    <div className="flex items-center gap-2 pb-1">
                      <span className="text-xs text-muted-foreground">Gleich aufteilen in</span>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => applySplitCount(splitCount - 1)} disabled={splitCount <= 2}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center text-sm font-semibold tabular-nums">{splitCount}</span>
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => applySplitCount(splitCount + 1)} disabled={splitCount >= 10}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <span className="text-xs text-muted-foreground">Teile</span>
                    </div>
                    {items.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex gap-2 items-start animate-in fade-in slide-in-from-top-1 duration-150"
                      >
                        <PersonPicker
                          item={item}
                          index={idx}
                          knownPersons={knownPersons}
                          idPrefix="detail-modal"
                          onChange={updateItem}
                        />
                        <div className="w-36 flex-shrink-0">
                          <CurrencySpinnerInput
                            value={parseFloat(item.betrag) || 0}
                            onChange={(v) =>
                              updateItem(idx, { betrag: String(v) })
                            }
                            maxEuros={Math.ceil(totalAmount) + 10}
                            currency={waehrung}
                          />
                        </div>
                        {items.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(idx)}
                            className="h-9 w-9 flex-shrink-0"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={addItem}
                      className="gap-1.5 text-muted-foreground"
                    >
                      <Plus className="h-4 w-4" /> Person hinzufügen
                    </Button>

                    {/* Remaining indicator */}
                    <div
                      className={[
                        "flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium border",
                        remaining < -0.01
                          ? "bg-destructive/10 border-destructive/30 text-destructive"
                          : remaining > 0.01
                            ? "bg-muted/30 border-border/40 text-muted-foreground"
                            : "bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400",
                      ].join(" ")}
                    >
                      <span>
                        {remaining > 0.01
                          ? "Noch nicht aufgeteilt"
                          : remaining < -0.01
                            ? "Betrag überschritten"
                            : "Vollständig aufgeteilt"}
                      </span>
                      <span className="font-mono font-bold">
                        {remaining > 0.01
                          ? formatCurrency(remaining, waehrung)
                          : remaining < -0.01
                            ? `+${formatCurrency(-remaining, waehrung)}`
                            : "✓"}
                      </span>
                    </div>
                  </div>
                ) : (
                  /* Positions mode */
                  <div className="pb-4">
                    {loadingPositions ? (
                      <div className="flex flex-col items-center justify-center py-12 gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Beleg-Positionen werden analysiert…
                        </p>
                      </div>
                    ) : positions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                        <Sparkles className="h-8 w-8 text-amber-500/80 animate-bounce" />
                        <p className="text-sm font-medium">
                          Keine Positionen gefunden
                        </p>
                        <p className="text-xs text-muted-foreground max-w-xs">
                          Der Beleg enthält keine erkennbaren Positionsdaten.
                        </p>
                        <Button
                          onClick={loadPositions}
                          size="sm"
                          className="mt-2 gap-2"
                        >
                          <Sparkles className="h-3.5 w-3.5" /> Erneut
                          analysieren
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Position list */}
                        <div className="space-y-2">
                          {positions.map((pos, pIdx) => {
                            const canHaveQty = Boolean(pos.quantity && pos.quantity > 1);
                            const currentSplitMode = positionSplitMode[pIdx] ?? "quantity";
                            const hasQty = canHaveQty && currentSplitMode === "quantity";
                            const assigned = positionAssignments[pIdx] || [
                              "owner",
                            ];
                            const qtyAssignments = positionQuantityAssignments[
                              pIdx
                            ] || { owner: pos.quantity ?? 1 };

                            return (
                              <div
                                key={pIdx}
                                className="rounded-xl border border-border/60 bg-card p-3 space-y-2"
                              >
                                <div className="flex justify-between items-start gap-2">
                                  <div className="flex items-baseline gap-1.5 min-w-0">
                                    <span
                                      className="text-sm font-medium truncate"
                                      title={pos.name}
                                    >
                                      {pos.name}
                                    </span>
                                    {canHaveQty && (
                                      <span className="text-xs text-muted-foreground flex-shrink-0">
                                        × {pos.quantity}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    {canHaveQty && (
                                      <div className="flex rounded border border-border/50 overflow-hidden text-[10px] font-semibold">
                                        <button
                                          type="button"
                                          onClick={() => setPositionSplitMode(prev => ({ ...prev, [pIdx]: "quantity" }))}
                                          className={currentSplitMode === "quantity" ? "px-1.5 py-0.5 bg-foreground text-background" : "px-1.5 py-0.5 text-muted-foreground hover:bg-muted/50"}
                                        >Anz.</button>
                                        <button
                                          type="button"
                                          onClick={() => setPositionSplitMode(prev => ({ ...prev, [pIdx]: "amount" }))}
                                          className={currentSplitMode === "amount" ? "px-1.5 py-0.5 bg-foreground text-background" : "px-1.5 py-0.5 text-muted-foreground hover:bg-muted/50"}
                                        >Bet.</button>
                                      </div>
                                    )}
                                    <span className="text-sm font-mono font-semibold text-primary">
                                      {formatCurrency(pos.amount, waehrung)}
                                    </span>
                                  </div>
                                </div>

                                {hasQty ? (
                                  /* Quantity-based assignment */
                                  <div className="space-y-1.5 pt-1">
                                    <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                                      Anzahl zuweisen ·{" "}
                                      {formatCurrency(
                                        pos.amount / pos.quantity!,
                                        waehrung,
                                      )}{" "}
                                      / Stück
                                    </p>
                                    {(() => {
                                      const totalAssigned = Object.values(qtyAssignments).reduce((s, u) => s + u, 0);
                                      return participants.map((part) => {
                                      const units =
                                        qtyAssignments[part.id] ??
                                        (part.id === "owner"
                                          ? (pos.quantity ?? 1)
                                          : 0);
                                      const partAmount =
                                        (units / pos.quantity!) * pos.amount;
                                      return (
                                        <div
                                          key={part.id}
                                          className="flex items-center gap-2"
                                        >
                                          <span className="text-xs font-medium flex-1 truncate">
                                            {part.name}
                                          </span>
                                          <div className="flex items-center gap-1">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setQuantityAssignment(
                                                  pIdx,
                                                  part.id,
                                                  units - 1,
                                                )
                                              }
                                              disabled={units <= 0}
                                              className="h-6 w-6 rounded border border-border/60 flex items-center justify-center text-sm leading-none hover:bg-muted disabled:opacity-30"
                                            >
                                              −
                                            </button>
                                            <span className="w-5 text-center text-sm font-mono tabular-nums">
                                              {units}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setQuantityAssignment(
                                                  pIdx,
                                                  part.id,
                                                  units + 1,
                                                )
                                              }
                                              disabled={totalAssigned >= (pos.quantity ?? 1)}
                                              className="h-6 w-6 rounded border border-border/60 flex items-center justify-center text-sm leading-none hover:bg-muted disabled:opacity-30"
                                            >
                                              +
                                            </button>
                                          </div>
                                          <span className="text-xs font-mono text-muted-foreground w-16 text-right">
                                            {units > 0
                                              ? formatCurrency(
                                                  partAmount,
                                                  waehrung,
                                                )
                                              : "—"}
                                          </span>
                                        </div>
                                      );
                                    });
                                    })()}
                                  </div>
                                ) : (
                                  /* Toggle-based assignment */
                                  <div className="flex flex-wrap gap-1">
                                    {participants.map((part) => {
                                      const active = assigned.includes(part.id);
                                      return (
                                        <button
                                          key={part.id}
                                          type="button"
                                          onClick={() =>
                                            toggleAssignment(pIdx, part.id)
                                          }
                                          className={[
                                            "px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all",
                                            active
                                              ? "bg-primary text-primary-foreground"
                                              : "bg-muted/50 text-muted-foreground hover:bg-muted border border-border/40",
                                          ].join(" ")}
                                        >
                                          {part.name}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Summary */}
                        <div className="rounded-xl border border-border/40 bg-muted/10 p-3 space-y-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              Beteiligte & Summen
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={addItem}
                              className="h-6 gap-1 px-2 text-[11px] text-muted-foreground"
                            >
                              <Plus className="h-3 w-3" /> Person
                            </Button>
                          </div>
                          <div className="flex items-center justify-between h-8 px-2 rounded-lg bg-muted/30 text-sm">
                            <span className="text-muted-foreground font-medium">
                              Ich
                            </span>
                            <span className="font-mono font-semibold">
                              {formatCurrency(
                                positions.reduce((acc, pos, pIdx) => {
                                  const useQ = pos.quantity && pos.quantity > 1 && (positionSplitMode[pIdx] ?? "quantity") === "quantity";
                                  if (useQ) {
                                    const qa = positionQuantityAssignments[
                                      pIdx
                                    ] || { owner: pos.quantity };
                                    const ownerUnits =
                                      qa["owner"] ?? pos.quantity ?? 0;
                                    return ownerUnits > 0
                                      ? acc +
                                          (ownerUnits / pos.quantity!) *
                                            pos.amount
                                      : acc;
                                  }
                                  const a = positionAssignments[pIdx] || [
                                    "owner",
                                  ];
                                  return a.includes("owner")
                                    ? acc + pos.amount / a.length
                                    : acc;
                                }, 0),
                                waehrung,
                              )}
                            </span>
                          </div>
                          {items.map((item, idx) => {
                            const amt = positions.reduce((acc, pos, pIdx) => {
                              const useQ = pos.quantity && pos.quantity > 1 && (positionSplitMode[pIdx] ?? "quantity") === "quantity";
                              if (useQ) {
                                const qa =
                                  positionQuantityAssignments[pIdx] || {};
                                const units = qa[`item-${idx}`] ?? 0;
                                return units > 0
                                  ? acc + (units / pos.quantity!) * pos.amount
                                  : acc;
                              }
                              const a = positionAssignments[pIdx] || ["owner"];
                              return a.includes(`item-${idx}`)
                                ? acc + pos.amount / a.length
                                : acc;
                            }, 0);
                            return (
                              <div
                                key={idx}
                                className="flex gap-2 items-center"
                              >
                                <div className="flex-1">
                                  <PersonPicker
                                    item={item}
                                    index={idx}
                                    knownPersons={knownPersons}
                                    idPrefix="detail-modal"
                                    onChange={updateItem}
                                  />
                                </div>
                                <div className="w-20 h-9 flex items-center justify-end px-2 rounded-lg border border-border bg-background font-mono font-semibold text-sm">
                                  {formatCurrency(amt, waehrung)}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeItem(idx)}
                                  className="h-9 w-9 flex-shrink-0"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Sticky action footer */}
              <div className="flex-shrink-0 flex gap-3 px-5 py-4 border-t border-border/40 bg-background/80 backdrop-blur-sm">
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="flex-1"
                  disabled={busy}
                >
                  Abbrechen
                </Button>
                <Button
                  onClick={handleSplitSubmit}
                  disabled={
                    busy ||
                    items.every((i) =>
                      splitMode === "positions"
                        ? !parseFloat(i.betrag)
                        : (!i.toUser && !i.freeName.trim() && !i.searchInput.trim()) || !parseFloat(i.betrag),
                    )
                  }
                  className="flex-1"
                >
                  {busy
                    ? "Speichern…"
                    : hasExisting
                      ? "Aktualisieren"
                      : "Aufteilung speichern"}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
