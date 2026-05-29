import { useRef, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DuplicatesList } from "@/components/bank/DuplicatesList";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, ExternalLink, } from "lucide-react";
import { bankApi } from "@/api/bank";
import { receiptsApi } from "@/api/receipts";
import { splitRequestsApi } from "@/api/splitRequests";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency, formatDateIso } from "@/lib/formatters";
import { BelegZuordnenDialog } from "@/components/bank/BelegZuordnenDialog";
import { SplitEditorDialog, type SplitContext } from "@/components/splits/SplitEditorDialog";
import type { BankTransaction, DuplicateInfo } from "@/types/bank";
import type { ReceiptRow } from "@/types/receipt";
import type { OutgoingRequest } from "@/api/splitRequests";

import { UnmatchedTab } from "@/components/bank/UnmatchedTab";
import { MatchedTab } from "@/components/bank/MatchedTab";
import { IgnoredTab } from "@/components/bank/IgnoredTab";

// ── Main page ─────────────────────────────────────────────────────────────────

export function KontoabgleichPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchParams] = useSearchParams();

  // Upload state
  const [importing, setImporting] = useState(false);
  const [lastImportErrors, setLastImportErrors] = useState<string[]>([]);
  const [lastDuplicates, setLastDuplicates] = useState<DuplicateInfo[]>([]);

  // Filter state
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterMonth, setFilterMonth] = useState("all");

  // Action state
  const [autoMatching, setAutoMatching] = useState(false);
  const [assignTx, setAssignTx] = useState<BankTransaction | null>(null);
  const [splitTx, setSplitTx] = useState<BankTransaction | null>(null);
  const [viewReceipt, setViewReceipt] = useState<ReceiptRow | null>(null);
  const [deleteConfirmTx, setDeleteConfirmTx] = useState<string | null>(null);
  const [busyTx, setBusyTx] = useState<string | null>(null);

  // Range delete dialog
  const [rangeDeleteOpen, setRangeDeleteOpen] = useState(false);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [busyRangeDelete, setBusyRangeDelete] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["bank-transactions"],
    queryFn: () => bankApi.listTransactions(),
  });

  const { data: receiptsData } = useQuery({
    queryKey: ["receipts"],
    queryFn: () => receiptsApi.list(),
  });

  const { data: outgoingData } = useQuery({
    queryKey: ["split-requests", "outgoing"],
    queryFn: () => splitRequestsApi.outgoing(),
  });

  const receiptMap = useMemo<Map<string, ReceiptRow>>(() => {
    const map = new Map<string, ReceiptRow>();
    for (const r of receiptsData?.rows ?? []) map.set(r.id, r);
    return map;
  }, [receiptsData]);

  // Map bankTxId → split requests linked to that transaction
  const splitsByTxId = useMemo(() => {
    const map = new Map<string, OutgoingRequest[]>();
    for (const req of outgoingData?.requests ?? []) {
      if (req.linkedBankTxId) {
        const existing = map.get(req.linkedBankTxId) ?? [];
        map.set(req.linkedBankTxId, [...existing, req]);
      }
    }
    return map;
  }, [outgoingData]);

  const splitTxContext = useMemo((): SplitContext | null => {
    if (!splitTx) return null;
    return {
      type: "bankTx",
      transaction: splitTx,
      existingSplits: splitsByTxId.get(splitTx.id) ?? [],
    };
  }, [splitTx, splitsByTxId]);

  const allTransactions = data?.transactions ?? [];

  // Available months computed from all transactions
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    for (const tx of allTransactions) {
      months.add(tx.buchungsdatum.slice(0, 7)); // YYYY-MM
    }
    return [...months].sort((a, b) => b.localeCompare(a)); // descending
  }, [allTransactions]);

  // Client-side filtering
  const transactions = useMemo(() => {
    return allTransactions.filter((tx) => {
      if (filterFrom && tx.buchungsdatum < filterFrom) return false;
      if (filterTo && tx.buchungsdatum > filterTo) return false;
      return true;
    });
  }, [allTransactions, filterFrom, filterTo]);

  const unmatched = transactions.filter((t) => t.matchStatus === "unmatched");
  const matched   = transactions.filter((t) => t.matchStatus === "matched");
  const ignored   = transactions.filter((t) => t.matchStatus === "ignored");

  const alreadyMatchedIds = useMemo(
    () => new Set(transactions.filter((t) => t.matchedReceiptId).map((t) => t.matchedReceiptId!)),
    [transactions]
  );

  // ── Filter handlers ─────────────────────────────────────────────────────────

  function handleMonthSelect(value: string) {
    setFilterMonth(value);
    if (value === "all") {
      setFilterFrom("");
      setFilterTo("");
      return;
    }
    if (value === "custom") {
      // Leave existing dates untouched
      return;
    }
    const [year, month] = value.split("-");
    const from = `${year}-${month}-01`;
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    const to = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
    setFilterFrom(from);
    setFilterTo(to);
  }

  function handleFromChange(value: string) {
    setFilterFrom(value);
    setFilterMonth("custom");
  }

  function handleToChange(value: string) {
    setFilterTo(value);
    setFilterMonth("custom");
  }

  function handleResetFilter() {
    setFilterFrom("");
    setFilterTo("");
    setFilterMonth("all");
  }

  // ── CSV upload ──────────────────────────────────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setLastDuplicates([]);
    try {
      const result = await bankApi.importCsv(file);
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      qc.invalidateQueries({ queryKey: ["split-requests"] });
      setLastImportErrors(result.parseErrors);
      setLastDuplicates(result.duplicates ?? []);
      toast({
        title: `${result.imported} Transaktionen importiert`,
        description: [
          `${result.autoMatched} Belege abgeglichen`,
          `${result.unmatched} offen`,
          result.duplicates?.length > 0
            ? `${result.duplicates.length} Duplikate übersprungen`
            : "",
          result.parseErrors.length > 0 ? `${result.parseErrors.length} Fehler` : "",
        ].filter(Boolean).join(" · "),
      });
    } catch {
      toast({ title: "Import fehlgeschlagen", variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // ── Ignore ──────────────────────────────────────────────────────────────────

  async function handleIgnore(tx: BankTransaction) {
    setBusyTx(tx.id);
    try {
      await bankApi.ignoreTransaction(tx.id);
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      toast({ title: "Transaktion ignoriert" });
    } catch {
      toast({ title: "Fehler", variant: "destructive" });
    } finally {
      setBusyTx(null);
    }
  }

  // ── Unmatch / restore ────────────────────────────────────────────────────────

  async function handleUnmatch(tx: BankTransaction) {
    setBusyTx(tx.id);
    try {
      await bankApi.matchTransaction(tx.id, null);
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      qc.invalidateQueries({ queryKey: ["split-requests"] });
      toast({ title: "Zuordnung aufgehoben" });
    } catch {
      toast({ title: "Fehler", variant: "destructive" });
    } finally {
      setBusyTx(null);
    }
  }

  // ── Auto-match ───────────────────────────────────────────────────────────────

  async function handleAutoMatch() {
    setAutoMatching(true);
    try {
      const [txResult, splitResult] = await Promise.all([
        bankApi.autoMatch(),
        bankApi.autoMatchSplits(),
      ]);
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      qc.invalidateQueries({ queryKey: ["split-requests"] });
      const parts = [];
      if (txResult.matched > 0)
        parts.push(`${txResult.matched} Ausgabe${txResult.matched !== 1 ? "n" : ""} abgeglichen`);
      if (splitResult.matched > 0)
        parts.push(
          `${splitResult.matched} Rückzahlung${splitResult.matched !== 1 ? "en" : ""} zugeordnet`
        );
      toast({
        title:
          parts.length > 0
            ? parts.join(" · ")
            : "Keine neuen Übereinstimmungen",
        description:
          parts.length > 0
            ? undefined
            : "Alle Transaktionen sind bereits abgeglichen oder kein Beleg passt.",
      });
    } catch {
      toast({ title: "Auto-Abgleich fehlgeschlagen", variant: "destructive" });
    } finally {
      setAutoMatching(false);
    }
  }

  // ── Single delete ────────────────────────────────────────────────────────────

  async function handleDeleteTx(id: string) {
    setBusyTx(id);
    try {
      await bankApi.deleteTransaction(id);
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      qc.invalidateQueries({ queryKey: ["split-requests"] });
      toast({ title: "Transaktion gelöscht" });
    } catch {
      toast({ title: "Fehler beim Löschen", variant: "destructive" });
    } finally {
      setBusyTx(null);
      setDeleteConfirmTx(null);
    }
  }

  // ── Range delete ─────────────────────────────────────────────────────────────

  const rangeDeleteCount = useMemo(() => {
    if (!rangeFrom || !rangeTo) return 0;
    return allTransactions.filter(
      (tx) => tx.buchungsdatum >= rangeFrom && tx.buchungsdatum <= rangeTo
    ).length;
  }, [allTransactions, rangeFrom, rangeTo]);

  async function handleDeleteRange() {
    if (!rangeFrom || !rangeTo) return;
    setBusyRangeDelete(true);
    try {
      const res = await bankApi.deleteRange(rangeFrom, rangeTo);
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      qc.invalidateQueries({ queryKey: ["split-requests"] });
      toast({ title: `${res.deleted} Transaktionen gelöscht` });
      setRangeDeleteOpen(false);
      setRangeFrom("");
      setRangeTo("");
    } catch {
      toast({ title: "Fehler beim Löschen", variant: "destructive" });
    } finally {
      setBusyRangeDelete(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Kontoabgleich</h1>
        <p className="text-[hsl(var(--muted-foreground))]">
          Gleiche Kontobewegungen mit deinen Belegen ab
        </p>
      </div>

      {/* CSV Upload */}
      <div className="space-y-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          disabled={importing}
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/20 px-8 py-10 text-center text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/40 disabled:opacity-60"
        >
          <Upload className="h-8 w-8 opacity-50" />
          <span className="text-sm font-medium">
            {importing ? "Wird importiert…" : "ING-CSV hier ablegen oder auswählen"}
          </span>
          <span className="text-xs opacity-60">ING Deutschland Kontoauszug (CSV-Export)</span>
        </button>

        {lastImportErrors.length > 0 && (
          <div className="text-sm text-red-600 space-y-1">
            <p className="font-medium">{lastImportErrors.length} Zeile(n) konnten nicht verarbeitet werden:</p>
            <ul className="list-disc list-inside space-y-0.5">
              {lastImportErrors.slice(0, 5).map((err, i) => (
                <li key={i} className="text-red-500">{err}</li>
              ))}
              {lastImportErrors.length > 5 && (
                <li className="text-muted-foreground">… und {lastImportErrors.length - 5} weitere</li>
              )}
            </ul>
          </div>
        )}

        <DuplicatesList duplicates={lastDuplicates} />
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Monat
          </label>
          <Select value={filterMonth} onValueChange={handleMonthSelect}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Alle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              {availableMonths.map((m) => {
                const [year, month] = m.split("-");
                const label = new Date(`${year}-${month}-01`).toLocaleDateString("de-DE", {
                  month: "long",
                  year: "numeric",
                });
                return (
                  <SelectItem key={m} value={m}>
                    {label}
                  </SelectItem>
                );
              })}
              {filterMonth === "custom" && (
                <SelectItem value="custom">Benutzerdefiniert</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Von
          </label>
          <input
            type="date"
            value={filterFrom}
            onChange={(e) => handleFromChange(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Bis
          </label>
          <input
            type="date"
            value={filterTo}
            onChange={(e) => handleToChange(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {(filterFrom || filterTo) && (
          <Button variant="ghost" size="sm" onClick={handleResetFilter} className="mb-0.5">
            Filter zurücksetzen
          </Button>
        )}
      </div>

      {/* Stats bar */}
      {isLoading ? (
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Gesamt",           value: transactions.length,  cls: "" },
            { label: "Abgeglichen",      value: matched.length,       cls: "text-green-600" },
            { label: "Nicht zugeordnet", value: unmatched.length,     cls: "text-yellow-600" },
            { label: "Ignoriert",        value: ignored.length,       cls: "text-muted-foreground" },
          ].map(({ label, value, cls }) => (
            <div key={label} className="rounded-xl border border-border bg-card p-4 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
              </p>
              <p className={`text-2xl font-bold ${cls}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Tabs defaultValue={searchParams.get("tab") ?? "unmatched"}>
          <TabsList>
            <TabsTrigger value="unmatched">
              Nicht zugeordnet{" "}
              {unmatched.length > 0 && (
                <span className="ml-1.5 rounded-full bg-yellow-100 text-yellow-700 px-1.5 text-[10px] font-bold">
                  {unmatched.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="matched">
              Abgeglichen{" "}
              {matched.length > 0 && (
                <span className="ml-1.5 rounded-full bg-green-100 text-green-700 px-1.5 text-[10px] font-bold">
                  {matched.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="ignored">
              Ignoriert{" "}
              {ignored.length > 0 && (
                <span className="ml-1.5 rounded-full bg-slate-100 text-slate-700 px-1.5 text-[10px] font-bold">
                  {ignored.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Nicht zugeordnet ── */}
          <TabsContent value="unmatched">
            <UnmatchedTab
              unmatched={unmatched}
              splitsByTxId={splitsByTxId}
              deleteConfirmTx={deleteConfirmTx}
              busyTx={busyTx}
              onAskConfirm={setDeleteConfirmTx}
              onConfirmDelete={handleDeleteTx}
              onCancelDelete={() => setDeleteConfirmTx(null)}
              onAssign={setAssignTx}
              onSplit={setSplitTx}
              onIgnore={handleIgnore}
            />
          </TabsContent>

          {/* ── Abgeglichen ── */}
          <TabsContent value="matched">
            <MatchedTab
              matched={matched}
              splitsByTxId={splitsByTxId}
              receiptMap={receiptMap}
              deleteConfirmTx={deleteConfirmTx}
              busyTx={busyTx}
              onAskConfirm={setDeleteConfirmTx}
              onConfirmDelete={handleDeleteTx}
              onCancelDelete={() => setDeleteConfirmTx(null)}
              onReassign={setAssignTx}
              onSplit={setSplitTx}
              onUnmatch={handleUnmatch}
              onViewReceipt={setViewReceipt}
            />
          </TabsContent>

          {/* ── Ignoriert ── */}
          <TabsContent value="ignored">
            <IgnoredTab
              ignored={ignored}
              deleteConfirmTx={deleteConfirmTx}
              busyTx={busyTx}
              onAskConfirm={setDeleteConfirmTx}
              onConfirmDelete={handleDeleteTx}
              onCancelDelete={() => setDeleteConfirmTx(null)}
              onRestore={handleUnmatch}
            />
          </TabsContent>
        </Tabs>
      )}

      {/* Actions */}
      {allTransactions.length > 0 && (
        <div className="flex justify-between items-center pt-2">
          <Button
            variant="outline"
            onClick={handleAutoMatch}
            disabled={autoMatching || unmatched.length === 0}
          >
            {autoMatching ? "Wird abgeglichen…" : "Auto-Abgleich"}
          </Button>
          <Button variant="outline" onClick={() => setRangeDeleteOpen(true)}>
            Zeitraum löschen
          </Button>
        </div>
      )}

      {/* Beleg-Detailmodal */}
      <Dialog
        open={viewReceipt !== null}
        onOpenChange={(open) => {
          if (!open) setViewReceipt(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{viewReceipt?.haendler}</DialogTitle>
            <DialogDescription>
              {viewReceipt && formatDateIso(viewReceipt.datum)}
            </DialogDescription>
          </DialogHeader>
          {viewReceipt && (
            <div className="space-y-2 text-sm">
              {(
                [
                  ["Betrag", formatCurrency(viewReceipt.betrag, viewReceipt.waehrung)],
                  ["MwSt", formatCurrency(viewReceipt.mwst, viewReceipt.waehrung)],
                  viewReceipt.trinkgeld > 0
                    ? ["Trinkgeld", formatCurrency(viewReceipt.trinkgeld, viewReceipt.waehrung)]
                    : null,
                  ["Kategorie", viewReceipt.kategorie],
                  ["Zahlungsmethode", viewReceipt.zahlungsmethode],
                  viewReceipt.rechnungsnummer
                    ? ["Rechnungsnummer", viewReceipt.rechnungsnummer]
                    : null,
                ] as Array<string[] | null>
              )
                .filter((row): row is string[] => row !== null)
                .map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium text-right">{value}</span>
                  </div>
                ))}
              {viewReceipt.driveLink && (
                <a
                  href={viewReceipt.driveLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-primary hover:underline pt-1"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Beleg in Drive öffnen
                </a>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setViewReceipt(null)}>
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BelegZuordnenDialog */}
      <BelegZuordnenDialog
        transaction={assignTx}
        onClose={() => setAssignTx(null)}
        onAssigned={() => {
          setAssignTx(null);
          qc.invalidateQueries({ queryKey: ["bank-transactions"] });
          qc.invalidateQueries({ queryKey: ["split-requests"] });
        }}
        alreadyMatchedReceiptIds={alreadyMatchedIds}
      />

      {/* SplitEditorDialog */}
      <SplitEditorDialog
        context={splitTxContext}
        onClose={() => setSplitTx(null)}
      />

      {/* Range delete dialog */}
      <Dialog open={rangeDeleteOpen} onOpenChange={(open) => { if (!open) setRangeDeleteOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Zeitraum löschen</DialogTitle>
            <DialogDescription>
              Alle Transaktionen im gewählten Zeitraum werden unwiderruflich gelöscht.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-muted-foreground">Von</label>
                <input
                  type="date"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-muted-foreground">Bis</label>
                <input
                  type="date"
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>
            {rangeFrom && rangeTo && (
              <p className={`text-sm ${rangeDeleteCount > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                {rangeDeleteCount > 0
                  ? `${rangeDeleteCount} Transaktion${rangeDeleteCount !== 1 ? "en" : ""} werden gelöscht.`
                  : "Keine Transaktionen in diesem Zeitraum."}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setRangeDeleteOpen(false)}
              disabled={busyRangeDelete}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteRange}
              disabled={busyRangeDelete || !rangeFrom || !rangeTo || rangeDeleteCount === 0}
            >
              {busyRangeDelete ? "Wird gelöscht…" : "Löschen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
