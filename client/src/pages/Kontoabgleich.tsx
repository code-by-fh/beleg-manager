import { useRef, useState, useMemo } from "react";
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
import { Upload } from "lucide-react";
import { bankApi } from "@/api/bank";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency, formatDateIso } from "@/lib/formatters";
import { BelegZuordnenDialog } from "@/components/bank/BelegZuordnenDialog";
import type { BankTransaction } from "@/types/bank";

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

// ── Main page ─────────────────────────────────────────────────────────────────

export function KontoabgleichPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importing, setImporting] = useState(false);
  const [assignTx, setAssignTx] = useState<BankTransaction | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busyClear, setBusyClear] = useState(false);
  const [busyTx, setBusyTx] = useState<string | null>(null); // id of tx being acted on
  const [lastImportErrors, setLastImportErrors] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["bank-transactions"],
    queryFn: () => bankApi.listTransactions(),
  });

  const transactions = data?.transactions ?? [];
  const unmatched = transactions.filter((t) => t.matchStatus === "unmatched");
  const matched   = transactions.filter((t) => t.matchStatus === "matched");
  const ignored   = transactions.filter((t) => t.matchStatus === "ignored");

  const alreadyMatchedIds = useMemo(
    () => new Set(transactions.filter(t => t.matchedReceiptId).map(t => t.matchedReceiptId!)),
    [transactions]
  );

  // ── CSV upload ──────────────────────────────────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const result = await bankApi.importCsv(file);
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      setLastImportErrors(result.parseErrors);
      toast({
        title: `${result.imported} Transaktionen importiert`,
        description: `${result.autoMatched} automatisch abgeglichen · ${result.unmatched} offen${
          result.parseErrors.length > 0 ? ` · ${result.parseErrors.length} Fehler` : ""
        }`,
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

  // Works for both matched→unmatched and ignored→unmatched:
  // backend sets match_status = 'unmatched' when receiptId is null
  async function handleUnmatch(tx: BankTransaction) {
    setBusyTx(tx.id);
    try {
      await bankApi.matchTransaction(tx.id, null);
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      toast({ title: "Zuordnung aufgehoben" });
    } catch {
      toast({ title: "Fehler", variant: "destructive" });
    } finally {
      setBusyTx(null);
    }
  }

  // ── Clear all ────────────────────────────────────────────────────────────────

  async function handleClear() {
    setBusyClear(true);
    try {
      const res = await bankApi.clearTransactions();
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      toast({ title: `${res.deleted} Transaktionen gelöscht` });
      setConfirmClear(false);
    } catch {
      toast({ title: "Fehler beim Löschen", variant: "destructive" });
    } finally {
      setBusyClear(false);
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
      </div>

      {/* Stats bar */}
      {isLoading ? (
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Gesamt",          value: transactions.length,   cls: "" },
            { label: "Abgeglichen",     value: matched.length,        cls: "text-green-600" },
            { label: "Nicht zugeordnet",value: unmatched.length,      cls: "text-yellow-600" },
            { label: "Ignoriert",       value: ignored.length,        cls: "text-muted-foreground" },
          ].map(({ label, value, cls }) => (
            <div key={label} className="rounded-xl border border-border bg-card p-4 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
              <p className={`text-2xl font-bold ${cls}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Tabs defaultValue="unmatched">
          <TabsList>
            <TabsTrigger value="unmatched">
              Nicht zugeordnet {unmatched.length > 0 && <span className="ml-1.5 rounded-full bg-yellow-100 text-yellow-700 px-1.5 text-[10px] font-bold">{unmatched.length}</span>}
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
                      <TableRow key={tx.id} className="hover:bg-muted/30 transition-colors border-b border-border">
                        <TableCell className="text-muted-foreground">{formatDateIso(tx.buchungsdatum)}</TableCell>
                        <TableCell className="font-medium">{tx.haendler}</TableCell>
                        <TableCell className="text-right"><BetragCell betrag={tx.betrag} /></TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground text-xs" title={tx.verwendungszweck}>
                          {tx.verwendungszweck}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
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
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matched.length === 0 ? (
                    <EmptyRow colSpan={5} message="Noch keine Transaktionen abgeglichen." />
                  ) : (
                    matched.map((tx) => (
                      <TableRow key={tx.id} className="hover:bg-muted/30 transition-colors border-b border-border">
                        <TableCell className="text-muted-foreground">{formatDateIso(tx.buchungsdatum)}</TableCell>
                        <TableCell className="font-medium">{tx.haendler}</TableCell>
                        <TableCell className="text-right"><BetragCell betrag={tx.betrag} /></TableCell>
                        <TableCell><ConfidenceBadge confidence={tx.matchConfidence} /></TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleUnmatch(tx)}
                            disabled={busyTx === tx.id}
                          >
                            Aufheben
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
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
                      <TableRow key={tx.id} className="hover:bg-muted/30 transition-colors border-b border-border">
                        <TableCell className="text-muted-foreground">{formatDateIso(tx.buchungsdatum)}</TableCell>
                        <TableCell className="font-medium">{tx.haendler}</TableCell>
                        <TableCell className="text-right"><BetragCell betrag={tx.betrag} /></TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground text-xs" title={tx.verwendungszweck}>
                          {tx.verwendungszweck}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleUnmatch(tx)}
                            disabled={busyTx === tx.id}
                          >
                            Wiederherstellen
                          </Button>
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

      {/* Abgleich abschließen */}
      {transactions.length > 0 && (
        <div className="flex justify-end pt-2">
          <Button variant="destructive" onClick={() => setConfirmClear(true)}>
            Abgleich abschließen
          </Button>
        </div>
      )}

      {/* BelegZuordnenDialog */}
      <BelegZuordnenDialog
        transaction={assignTx}
        onClose={() => setAssignTx(null)}
        onAssigned={() => {
          setAssignTx(null);
          qc.invalidateQueries({ queryKey: ["bank-transactions"] });
        }}
        alreadyMatchedReceiptIds={alreadyMatchedIds}
      />

      {/* Confirm clear dialog */}
      <Dialog open={confirmClear} onOpenChange={(open) => { if (!open) setConfirmClear(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abgleich abschließen</DialogTitle>
            <DialogDescription>
              Alle <span className="font-bold text-foreground">{transactions.length}</span> Transaktionen werden unwiderruflich gelöscht. Fortfahren?
              {unmatched.length > 0 && (
                <p className="text-amber-600 text-sm mt-1">
                  Davon sind {unmatched.length} Transaktion(en) noch nicht zugeordnet.
                </p>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setConfirmClear(false)} disabled={busyClear}>
              Abbrechen
            </Button>
            <Button variant="destructive" onClick={handleClear} disabled={busyClear}>
              {busyClear ? "Wird gelöscht…" : "Alle löschen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
