import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tag, X, PlusCircle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { settingsApi } from "@/api/settings";
import { DEFAULT_KATEGORIEN } from "@/components/receipts/ReceiptForm";

export function CategoriesCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  
  const { data: categoriesData, refetch: refetchCategories } = useQuery({
    queryKey: ["custom-categories"],
    queryFn: () => settingsApi.getCategories(),
  });
  
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [catSaving, setCatSaving] = useState(false);

  useEffect(() => {
    if (categoriesData) setCustomCategories(categoriesData.categories);
  }, [categoriesData]);

  async function saveCategories() {
    setCatSaving(true);
    try {
      await settingsApi.setCategories(customCategories);
      qc.invalidateQueries({ queryKey: ["custom-categories"] });
      refetchCategories();
      toast({ title: "Kategorien gespeichert" });
    } catch {
      toast({ title: "Speichern fehlgeschlagen", variant: "destructive" });
    } finally {
      setCatSaving(false);
    }
  }

  function addCategory() {
    const trimmed = newCategory.trim();
    if (!trimmed || customCategories.includes(trimmed) || DEFAULT_KATEGORIEN.includes(trimmed)) return;
    setCustomCategories((prev) => [...prev, trimmed]);
    setNewCategory("");
  }

  function removeCategory(cat: string) {
    setCustomCategories((prev) => prev.filter((c) => c !== cat));
  }

  return (
    <div className="flat-card p-6 space-y-4 h-full flex flex-col">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[var(--active-bg)] flex items-center justify-center flex-shrink-0">
          <Tag className="h-6 w-6 text-[hsl(var(--foreground))]" />
        </div>
        <div>
          <p className="text-foreground font-bold text-sm">Eigene Kategorien</p>
          <p className="text-muted-foreground text-xs font-medium">{customCategories.length} eigene Kategorien</p>
        </div>
      </div>
      <div className="flex-grow space-y-3 border-t border-border/40 pt-3">
        <p className="text-muted-foreground text-xs leading-relaxed">
          Ergänze eigene Kategorien. Sie werden in der Belegliste und bei der KI-Erkennung verwendet.
        </p>
        {customCategories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {customCategories.map((cat) => (
              <span key={cat} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-primary/10 text-primary text-xs font-medium">
                {cat}
                <button onClick={() => removeCategory(cat)} className="ml-0.5 hover:text-red-500 transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            placeholder="Neue Kategorie…"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCategory(); } }}
            className="h-9 text-sm flex-1"
            maxLength={50}
          />
          <Button onClick={addCategory} disabled={!newCategory.trim()} size="sm" variant="outline">
            <PlusCircle className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <Button onClick={saveCategories} disabled={catSaving} size="sm" className="w-full mt-auto">
        {catSaving ? "Speichern…" : "Speichern"}
      </Button>
    </div>
  );
}
