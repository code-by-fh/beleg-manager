import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";

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
    <div className="flex flex-col md:flex-row gap-3 items-end md:items-center">
      <div className="relative flex-1 w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--muted-foreground))]" />
        <Input
          placeholder="Suche (Händler, Rechnungsnr., ...)"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          className="pl-9 bg-card border-border/40 shadow-sm focus-visible:ring-1"
        />
      </div>
      
      <div className="flex flex-wrap gap-2 w-full md:w-auto">
        <div className="w-[180px] flex-shrink-0">
          <Select value={filters.kategorie} onValueChange={(v) => setFilters({ ...filters, kategorie: v })}>
            <SelectTrigger className="bg-card border-border/40 shadow-sm focus:ring-1">
              <SelectValue placeholder="Kategorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Alle Kategorien</SelectItem>
              {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        
        <Input 
          type="date" 
          value={filters.from} 
          onChange={(e) => setFilters({ ...filters, from: e.target.value })} 
          className="w-[140px] bg-card border-border/40 shadow-sm focus-visible:ring-1 appearance-none"
        />
        <Input 
          type="date" 
          value={filters.to} 
          onChange={(e) => setFilters({ ...filters, to: e.target.value })} 
          className="w-[140px] bg-card border-border/40 shadow-sm focus-visible:ring-1 appearance-none"
        />
      </div>
    </div>
  );
}
