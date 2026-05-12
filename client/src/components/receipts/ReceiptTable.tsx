import { useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { useReceipts } from "@/hooks/useReceipts";
import { formatCurrency, formatDateIso } from "@/lib/formatters";
import { ReceiptFilters, type Filters } from "./ReceiptFilters";

export function ReceiptTable() {
  const { data, isLoading } = useReceipts();
  const [filters, setFilters] = useState<Filters>({ search: "", kategorie: "__all__", from: "", to: "" });

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of data?.rows ?? []) if (r.kategorie) set.add(r.kategorie);
    return [...set].sort();
  }, [data]);

  const filtered = useMemo(() => {
    const rows = (data?.rows ?? []).slice().sort((a, b) => b.datum.localeCompare(a.datum));
    return rows.filter((r) => {
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
  }, [data, filters]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <ReceiptFilters filters={filters} setFilters={setFilters} categories={categories} />
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Datum</TableHead>
              <TableHead>Händler</TableHead>
              <TableHead className="text-right">Betrag</TableHead>
              <TableHead>Kategorie</TableHead>
              <TableHead>Zahlung</TableHead>
              <TableHead className="text-right">MwSt</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Keine Belege gefunden.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{formatDateIso(r.datum)}</TableCell>
                <TableCell className="font-medium">{r.haendler}</TableCell>
                <TableCell className="text-right">{formatCurrency(r.betrag, r.waehrung)}</TableCell>
                <TableCell>{r.kategorie}</TableCell>
                <TableCell>{r.zahlungsmethode}</TableCell>
                <TableCell className="text-right">{formatCurrency(r.mwst, r.waehrung)}</TableCell>
                <TableCell className="text-right">
                  {r.driveLink && (
                    <Button asChild variant="ghost" size="icon">
                      <a href={r.driveLink} target="_blank" rel="noreferrer" aria-label="In Drive öffnen">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
