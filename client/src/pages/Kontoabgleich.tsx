import { useRef, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Upload, ExternalLink, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { bankApi } from "@/api/bank";
import { receiptsApi } from "@/api/receipts";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency, formatDateIso } from "@/lib/formatters";
import { BelegZuordnenDialog } from "@/components/bank/BelegZuordnenDialog";
import type { BankTransaction, DuplicateInfo } from "@/types/bank";
import type { ReceiptRow } from "@/types/receipt";

// ── Confidence badge ──────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: BankTransaction["matchConfidence"] }) {
  if (!confidence) return null;
  const map: Record<NonNullable<BankTransaction["matchConfidence"]>, { label: string; cls: string }> = {
    high:   { label: "Hoch",    cls: "bg-green-100 text-green-700" },
    medium: { label: "Mittel",  cls: "bg-yellow-100 text-yellow-700" },
    low:    { label: "Niedrig", cls: "bg-orange-100 text-orange-700" },
    manual: { label: "Manuell", cls: "bg-blue-100 text-blue-700" },
  };
  const { label, cls } = map[confidence];
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${cls}`}>
      {label}
    </span>
  );
}

// ── Betrag cell ───────────────────────────────────────────────────────────────

function BetragCell({ betrag }: { betrag: number }) {
  if (betrag < 0) {
    return <span className="text-red-500 font-medium">−{formatCurrency(Math.abs(betrag))}</span>;
  }
  return <span className="text-green-600 font-medium">{formatCurrency(betrag)}</span>;
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="text-center text-muted-foreground py-10">
        {message}
      </TableCell>
    </TableRow>
  );
}

// ── Inline delete confirm cell ────────────────────────────────────────────────

function DeleteCell({
  txId,
  isConfirming,
  isBusy,
  onAskConfirm,
  onConfirm,
  onCancel,
}: {
  txId: string;
  isConfirming: boolean;
  isBusy: boolean;
  onAskConfirm: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (isConfirming) {
    return (
      <div className="flex items-center justify-end gap-1">
        <span className="text-xs text-muted-foreground mr-1">Löschen?</span>
        <Button size="sm" variant="destructive" onClick={onConfirm} disabled={isBusy} className="h-7 px-2">
          Ja
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={isBusy} className="h-7 px-2">
          Nein
        </Button>
      </div>
    );
  }
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={onAskConfirm}
      disabled={isBusy}
      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
      title="Transaktion löschen"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}

// ── Duplicates list ───────────────────────────────────────────────────────────

function DuplicatesList({ duplicates }: { duplicates: DuplicateInfo[] }) {
  const [open, setOpen] = useState(false);
  if (duplicates.length === 0) return null;

  const visible = duplicates.slice(0, 10);
  const rest = duplicates.length - visible.length;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
      <button
        type="button"
        className="flex items-center gap-2 text-sm font-medium text-amber-800 w-full text-left"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        {duplicates.length} bereits vorhandene Transaktion{duplicates.length !== 1 ? "en" : ""} übersprungen
      </button>
      {open && (
        <ul className="space-y-1 pl-6">
          {visible.map((d, i) => (
            <li key={i} className="text-xs text-amber-700 flex gap-3">
              <span className="text-muted-foreground w-24 shrink-0">{formatDateIso(d.buchungsdatum)}</span>
              <span className="flex-1 truncate">{d.haendler}</span>
              <span className="shrink-0"><BetragCell betrag={d.betrag} /></span>
            </li>
          ))}
          {rest > 0 && (
            <li className="text-xs text-muted-foreground pl-0">… und {rest} weitere</li>
          )}
        </ul>
      )}
    </div>
  );
}

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

  const receiptMap = useMemo<Map<string, ReceiptRow>>(() => {
    const map = new Map<string, ReceiptRow>();
    for (const r of receiptsData?.rows ?? []) map.set(r.id, r);
    return map;
  }, [receiptsData]);

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
    } else {
      const [year, month] = value.split("-");
      const from = `${year}-${month}-01`;
      const lastDay = new Date(Number(year), Number(month), 0).getDate();
      const to = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
      setFilterFrom(from);
      setFilterTo(to);
    }
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
      qc.invalidateQueries({ queryKey: ["splits"] });
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
      qc.invalidateQueries({ queryKey: ["splits"] });
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
      qc.invalidateQueries({ queryKey: ["splits"] });
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
      qc.invalidateQueries({ queryKey: ["splits"] });
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
      qc.invalidateQueries({ queryKey: ["splits"] });
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
            <TabsTrigger value="matched">Abgeglichen</TabsTrigger>
            <TabsTrigger value="ignored">Ignoriert</TabsTrigger>
          </TabsList>

          {/* ── Nicht zugeordnet ── */}
          <TabsContent value="unmatched">
            <div className="rounded-xl border border-border overflow-hidden mt-2">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b border-border">
                    <TableHead>Datum</TableHead>
                    <TableHead>Händler</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                    <TableHead className="max-w-[200px]">Verwendungszweck</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unmatched.length === 0 ? (
                    <EmptyRow colSpan={5} message="Alle Transaktionen sind zugeordnet oder ignoriert." />
                  ) : (
                    unmatched.map((tx) => (
                      <TableRow
                        key={tx.id}
                        className="hover:bg-muted/30 transition-colors border-b border-border"
                      >
                        <TableCell className="text-muted-foreground">
                          {formatDateIso(tx.buchungsdatum)}
                        </TableCell>
                        <TableCell className="font-medium">{tx.haendler}</TableCell>
                        <TableCell className="text-right">
                          <BetragCell betrag={tx.betrag} />
                        </TableCell>
                        <TableCell
                          className="max-w-[200px] truncate text-muted-foreground text-xs"
                          title={tx.verwendungszweck}
                        >
                          {tx.verwendungszweck}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {deleteConfirmTx === tx.id ? (
                              <DeleteCell
                                txId={tx.id}
                                isConfirming
                                isBusy={busyTx === tx.id}
                                onAskConfirm={() => setDeleteConfirmTx(tx.id)}
                                onConfirm={() => handleDeleteTx(tx.id)}
                                onCancel={() => setDeleteConfirmTx(null)}
                              />
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => setAssignTx(tx)}
                                  disabled={busyTx === tx.id}
                                >
                                  Zuordnen
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleIgnore(tx)}
                                  disabled={busyTx === tx.id}
                                >
                                  Ignorieren
                                </Button>
                                <DeleteCell
                                  txId={tx.id}
                                  isConfirming={false}
                                  isBusy={busyTx === tx.id}
                                  onAskConfirm={() => setDeleteConfirmTx(tx.id)}
                                  onConfirm={() => handleDeleteTx(tx.id)}
                                  onCancel={() => setDeleteConfirmTx(null)}
                                />
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ── Abgeglichen ── */}
          <TabsContent value="matched">
            <div className="rounded-xl border border-border overflow-hidden mt-2">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b border-border">
                    <TableHead>Datum</TableHead>
                    <TableHead>Händler</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                    <TableHead>Konfidenz</TableHead>
                    <TableHead>Verknüpfter Beleg</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matched.length === 0 ? (
                    <EmptyRow colSpan={6} message="Noch keine Transaktionen abgeglichen." />
                  ) : (
                    matched.map((tx) => {
                      const receipt = tx.matchedReceiptId
                        ? receiptMap.get(tx.matchedReceiptId)
                        : undefined;
                      return (
                        <TableRow
                          key={tx.id}
                          className="hover:bg-muted/30 transition-colors border-b border-border"
                        >
                          <TableCell className="text-muted-foreground">
                            {formatDateIso(tx.buchungsdatum)}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium leading-tight">{tx.haendler}</div>
                            {tx.verwendungszweck && (
                              <div
                                className="text-xs text-muted-foreground truncate max-w-[200px]"
                                title={tx.verwendungszweck}
                              >
                                {tx.verwendungszweck}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <BetragCell betrag={tx.betrag} />
                          </TableCell>
                          <TableCell>
                            <ConfidenceBadge confidence={tx.matchConfidence} />
                          </TableCell>
                          <TableCell>
                            {receipt ? (
                              <button
                                className="text-left hover:underline"
                                onClick={() => setViewReceipt(receipt)}
                              >
                                <span className="font-medium text-sm">{receipt.haendler}</span>
                                <span className="text-muted-foreground text-xs ml-1.5">
                                  {formatDateIso(receipt.datum)} ·{" "}
                                  {formatCurrency(receipt.betrag, receipt.waehrung)}
                                </span>
                              </button>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {deleteConfirmTx === tx.id ? (
                                <DeleteCell
                                  txId={tx.id}
                                  isConfirming
                                  isBusy={busyTx === tx.id}
                                  onAskConfirm={() => setDeleteConfirmTx(tx.id)}
                                  onConfirm={() => handleDeleteTx(tx.id)}
                                  onCancel={() => setDeleteConfirmTx(null)}
                                />
                              ) : (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setAssignTx(tx)}
                                    disabled={busyTx === tx.id}
                                  >
                                    Neu zuordnen
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleUnmatch(tx)}
                                    disabled={busyTx === tx.id}
                                  >
                                    Aufheben
                                  </Button>
                                  <DeleteCell
                                    txId={tx.id}
                                    isConfirming={false}
                                    isBusy={busyTx === tx.id}
                                    onAskConfirm={() => setDeleteConfirmTx(tx.id)}
                                    onConfirm={() => handleDeleteTx(tx.id)}
                                    onCancel={() => setDeleteConfirmTx(null)}
                                  />
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ── Ignoriert ── */}
          <TabsContent value="ignored">
            <div className="rounded-xl border border-border overflow-hidden mt-2">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b border-border">
                    <TableHead>Datum</TableHead>
                    <TableHead>Händler</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                    <TableHead className="max-w-[200px]">Verwendungszweck</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ignored.length === 0 ? (
                    <EmptyRow colSpan={5} message="Keine ignorierten Transaktionen." />
                  ) : (
                    ignored.map((tx) => (
                      <TableRow
                        key={tx.id}
                        className="hover:bg-muted/30 transition-colors border-b border-border"
                      >
                        <TableCell className="text-muted-foreground">
                          {formatDateIso(tx.buchungsdatum)}
                        </TableCell>
                        <TableCell className="font-medium">{tx.haendler}</TableCell>
                        <TableCell className="text-right">
                          <BetragCell betrag={tx.betrag} />
                        </TableCell>
                        <TableCell
                          className="max-w-[200px] truncate text-muted-foreground text-xs"
                          title={tx.verwendungszweck}
                        >
                          {tx.verwendungszweck}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {deleteConfirmTx === tx.id ? (
                              <DeleteCell
                                txId={tx.id}
                                isConfirming
                                isBusy={busyTx === tx.id}
                                onAskConfirm={() => setDeleteConfirmTx(tx.id)}
                                onConfirm={() => handleDeleteTx(tx.id)}
                                onCancel={() => setDeleteConfirmTx(null)}
                              />
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleUnmatch(tx)}
                                  disabled={busyTx === tx.id}
                                >
                                  Wiederherstellen
                                </Button>
                                <DeleteCell
                                  txId={tx.id}
                                  isConfirming={false}
                                  isBusy={busyTx === tx.id}
                                  onAskConfirm={() => setDeleteConfirmTx(tx.id)}
                                  onConfirm={() => handleDeleteTx(tx.id)}
                                  onCancel={() => setDeleteConfirmTx(null)}
                                />
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
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
          qc.invalidateQueries({ queryKey: ["splits"] });
        }}
        alreadyMatchedReceiptIds={alreadyMatchedIds}
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
