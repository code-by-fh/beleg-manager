import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ExternalLink, Pencil, Trash2, ArrowUpDown, ChevronUp, ChevronDown, Search, X, SplitSquareHorizontal, ArrowLeftRight } from "lucide-react";
import { useReceipts } from "@/hooks/useReceipts";
import { formatCurrency, formatDateIso } from "@/lib/formatters";
import { ReceiptFilters, type Filters } from "./ReceiptFilters";
import { ReceiptForm } from "./ReceiptForm";
import { SplitDialog } from "./SplitDialog";
import { receiptsApi } from "@/api/receipts";
import { splitsApi } from "@/api/splits";
import { bankApi } from "@/api/bank";
import { useToast } from "@/components/ui/use-toast";
import type { ReceiptRow } from "@/types/receipt";

interface ReceiptTableProps {
  hideFilters?: boolean;
  limit?: number;
}

function SortableHeader({
  column,
  currentSort,
  onSort,
  children,
  className,
}: {
  column: keyof ReceiptRow;
  currentSort: { column: keyof ReceiptRow; direction: "asc" | "desc" };
  onSort: (column: keyof ReceiptRow) => void;
  children: ReactNode;
  className?: string;
}) {
  const isActive = currentSort.column === column;

  return (
    <TableHead className={className}>
      <button
        onClick={() => onSort(column)}
        className={`flex items-center gap-1 hover:text-foreground transition-colors group/btn w-full ${
          isActive ? "text-foreground font-bold" : "text-muted-foreground"
        } ${className?.includes("text-right") ? "justify-end" : ""}`}
      >
        {children}
        <span className="inline-flex">
          {isActive ? (
            currentSort.direction === "asc" ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )
          ) : (
            <ArrowUpDown className="h-3 w-3 opacity-0 group-hover/btn:opacity-50 transition-opacity" />
          )}
        </span>
      </button>
    </TableHead>
  );
}

export function ReceiptTable({ hideFilters, limit }: ReceiptTableProps) {
  const navigate = useNavigate();
  const { data, isLoading } = useReceipts();
  const { data: splitsData } = useQuery({ queryKey: ["splits"], queryFn: () => splitsApi.list() });
  const { data: bankData } = useQuery({ queryKey: ["bank-transactions"], queryFn: () => bankApi.listTransactions() });
  const qc = useQueryClient();

  const allSplits = splitsData?.splits ?? [];
  const splitReceiptIds = useMemo(() => new Set(allSplits.map((s) => s.receiptId)), [allSplits]);
  const knownPersons = useMemo(() => [...new Set(allSplits.map((s) => s.person))].sort(), [allSplits]);
  // Map receiptId → bankTxId for matched transactions
  const matchedReceiptTxMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const tx of bankData?.transactions ?? []) {
      if (tx.matchStatus === "matched" && tx.matchedReceiptId) map.set(tx.matchedReceiptId, tx.id);
    }
    return map;
  }, [bankData]);
  const { toast } = useToast();
  const [filters, setFilters] = useState<Filters>({ search: "", kategorie: "__all__", from: "", to: "" });
  const [editRow, setEditRow] = useState<ReceiptRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<ReceiptRow | null>(null);
  const [splitRow, setSplitRow] = useState<ReceiptRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ column: keyof ReceiptRow; direction: "asc" | "desc" }>({
    column: "datum",
    direction: "desc",
  });

  const handleSort = (column: keyof ReceiptRow) => {
    setSortConfig((current) => ({
      column,
      direction: current.column === column && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of data?.rows ?? []) if (r.kategorie) set.add(r.kategorie);
    return [...set].sort();
  }, [data]);

  const filtered = useMemo(() => {
    let rows = (data?.rows ?? []).slice();

    // Filter
    rows = rows.filter((r) => {
      if (filters.kategorie !== "__all__" && r.kategorie !== filters.kategorie) return false;
      if (filters.from && r.datum < filters.from) return false;
      if (filters.to && r.datum > filters.to) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const hay = [r.haendler, r.rechnungsnummer, r.kategorie, r.zahlungsmethode].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // Sort
    rows.sort((a, b) => {
      const aVal = a[sortConfig.column];
      const bVal = b[sortConfig.column];

      if (aVal === bVal) return 0;

      const multiplier = sortConfig.direction === "asc" ? 1 : -1;

      if (typeof aVal === "string" && typeof bVal === "string") {
        return aVal.localeCompare(bVal) * multiplier;
      }
      
      if (typeof aVal === "number" && typeof bVal === "number") {
        return (aVal - bVal) * multiplier;
      }

      return 0;
    });
    
    return limit ? rows.slice(0, limit) : rows;
  }, [data, filters, sortConfig, limit]);

  async function handleEdit(values: import("@/lib/validators").ReceiptFormValues) {
    if (!editRow) return;
    setBusy(true);
    try {
      await receiptsApi.update(editRow.id, values);
      qc.invalidateQueries({ queryKey: ["receipts"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast({ title: "Beleg aktualisiert" });
      setEditRow(null);
    } catch (e) {
      toast({ title: "Speichern fehlgeschlagen", description: String((e as Error).message) });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!deleteRow) return;
    setBusy(true);
    try {
      await receiptsApi.delete(deleteRow.id);
      qc.invalidateQueries({ queryKey: ["receipts"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast({ title: "Beleg gelöscht" });
      setDeleteRow(null);
    } catch (e) {
      toast({ title: "Löschen fehlgeschlagen", description: String((e as Error).message) });
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <>
      <div className="space-y-6">
        {!hideFilters && (
          <div className="space-y-2">
            <ReceiptFilters filters={filters} setFilters={setFilters} categories={categories} />
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                {filtered.length} {filtered.length === 1 ? "Ergebnis" : "Ergebnisse"}
              </span>
            </div>
          </div>
        )}
        
        <div className={hideFilters ? "" : "clay-card-static rounded-2xl overflow-hidden"}>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-[hsl(var(--border))]">
                <SortableHeader column="datum" currentSort={sortConfig} onSort={handleSort}>Datum</SortableHeader>
                <SortableHeader column="haendler" currentSort={sortConfig} onSort={handleSort}>Händler</SortableHeader>
                <SortableHeader column="betrag" currentSort={sortConfig} onSort={handleSort} className="text-right">Betrag</SortableHeader>
                <SortableHeader column="mwst" currentSort={sortConfig} onSort={handleSort} className="text-right">MwSt</SortableHeader>
                <SortableHeader column="trinkgeld" currentSort={sortConfig} onSort={handleSort} className="text-right">Trinkgeld</SortableHeader>
                <SortableHeader column="kategorie" currentSort={sortConfig} onSort={handleSort}>Kategorie</SortableHeader>
                <SortableHeader column="zahlungsmethode" currentSort={sortConfig} onSort={handleSort}>Zahlung</SortableHeader>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Keine Belege gefunden.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((r) => (
                <TableRow key={r.id} className="group hover:bg-[var(--hover-bg)] transition-colors border-b border-[hsl(var(--border))]">
                  <TableCell className="text-muted-foreground font-medium">{formatDateIso(r.datum)}</TableCell>
                  <TableCell className="font-medium">{r.haendler}</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.betrag, r.waehrung)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.mwst, r.waehrung)}</TableCell>
                  <TableCell className="text-right">
                    {r.trinkgeld > 0 ? formatCurrency(r.trinkgeld, r.waehrung) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      {r.kategorie}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{r.zahlungsmethode}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditRow(r)} aria-label="Bearbeiten">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSplitRow(r)}
                        aria-label="Aufteilen"
                        title={splitReceiptIds.has(r.id) ? "Aufteilung bearbeiten" : "Aufteilen"}
                        className={splitReceiptIds.has(r.id) ? "text-blue-500 hover:text-blue-600" : ""}
                      >
                        <SplitSquareHorizontal className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteRow(r)} aria-label="Löschen" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      {matchedReceiptTxMap.has(r.id) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Im Kontoabgleich anzeigen"
                          aria-label="Im Kontoabgleich anzeigen"
                          className="text-blue-500 hover:text-blue-600"
                          onClick={() => navigate("/kontoabgleich?tab=matched")}
                        >
                          <ArrowLeftRight className="h-4 w-4" />
                        </Button>
                      )}
                      {r.driveLink && (
                        <Button asChild variant="ghost" size="icon">
                          <a href={r.driveLink} target="_blank" rel="noreferrer" aria-label="In Drive öffnen">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={editRow !== null} onOpenChange={(open) => { if (!open) setEditRow(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Beleg bearbeiten</DialogTitle>
          </DialogHeader>
          {editRow && (
            <ReceiptForm
              initial={{
                datum: editRow.datum,
                haendler: editRow.haendler,
                betrag: editRow.betrag,
                mwst: editRow.mwst,
                trinkgeld: editRow.trinkgeld,
                waehrung: editRow.waehrung,
                kategorie: editRow.kategorie,
                zahlungsmethode: editRow.zahlungsmethode,
                rechnungsnummer: editRow.rechnungsnummer,
              }}
              busy={busy}
              onSubmit={handleEdit}
              submitLabel="Änderungen speichern"
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deleteRow !== null} onOpenChange={(open) => { if (!open) setDeleteRow(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Beleg löschen</DialogTitle>
            <DialogDescription>
              Bist du sicher, dass du den Beleg von <span className="font-bold text-foreground">{deleteRow?.haendler}</span> über <span className="font-bold text-foreground">{deleteRow && formatCurrency(deleteRow.betrag, deleteRow.waehrung)}</span> löschen möchtest? Diese Aktion kann nicht rückgängig gemacht werden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setDeleteRow(null)} disabled={busy}>
              Abbrechen
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={busy}>
              {busy ? "Wird gelöscht..." : "Endgültig löschen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SplitDialog receipt={splitRow} allSplits={allSplits} knownPersons={knownPersons} onClose={() => setSplitRow(null)} />
    </>
  );
}
