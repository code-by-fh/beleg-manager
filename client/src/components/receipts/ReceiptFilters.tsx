import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Calendar, X } from "lucide-react";

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
    <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
      <div className="relative flex-1 w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--muted-foreground))]" />
        <Input
          placeholder="Suche (Händler, Rechnungsnr., ...)"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          className="pl-9 bg-card border-border/40 shadow-sm focus-visible:ring-1"
        />
      </div>
      
      <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
        <div className="w-full md:w-[180px] md:flex-shrink-0">
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
        
        <div className="relative w-full md:w-[140px]">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input 
            type="date" 
            value={filters.from} 
            onChange={(e) => setFilters({ ...filters, from: e.target.value })} 
            className={`pl-9 pr-8 w-full bg-card border-border/40 shadow-sm focus-visible:ring-1 appearance-none [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-clear-button]:hidden [&::-webkit-inner-spin-button]:hidden ${!filters.from ? "text-transparent focus:text-foreground" : ""}`}
          />
          {!filters.from ? (
            <span className="absolute left-9 top-1/2 -translate-y-1/2 text-sm text-muted-foreground/60 pointer-events-none">
              Von
            </span>
          ) : (
            <button
              onClick={() => setFilters({ ...filters, from: "" })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground p-0.5 rounded-full hover:bg-muted transition-colors z-10"
              title="Datum löschen"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="relative w-full md:w-[140px]">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input 
            type="date" 
            value={filters.to} 
            onChange={(e) => setFilters({ ...filters, to: e.target.value })} 
            className={`pl-9 pr-8 w-full bg-card border-border/40 shadow-sm focus-visible:ring-1 appearance-none [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-clear-button]:hidden [&::-webkit-inner-spin-button]:hidden ${!filters.to ? "text-transparent focus:text-foreground" : ""}`}
          />
          {!filters.to ? (
            <span className="absolute left-9 top-1/2 -translate-y-1/2 text-sm text-muted-foreground/60 pointer-events-none">
              Bis
            </span>
          ) : (
            <button
              onClick={() => setFilters({ ...filters, to: "" })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground p-0.5 rounded-full hover:bg-muted transition-colors z-10"
              title="Datum löschen"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
