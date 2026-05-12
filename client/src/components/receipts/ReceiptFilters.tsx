import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type Filters = {
  search: string;
  kategorie: string;
  from: string;
  to: string;
};

export function ReceiptFilters({
  filters,
  setFilters,
  categories,
}: {
  filters: Filters;
  setFilters: (next: Filters) => void;
  categories: string[];
}) {
  return (
    <div className="grid gap-2 md:grid-cols-4">
      <Input
        placeholder="Suche (Händler, Rechnungsnr., ...)"
        value={filters.search}
        onChange={(e) => setFilters({ ...filters, search: e.target.value })}
      />
      <Select value={filters.kategorie} onValueChange={(v) => setFilters({ ...filters, kategorie: v })}>
        <SelectTrigger><SelectValue placeholder="Kategorie" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Alle Kategorien</SelectItem>
          {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
      <Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
    </div>
  );
}
