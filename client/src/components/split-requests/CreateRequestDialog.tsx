import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserSearch } from "@/hooks/useUserSearch";
import { useCreateRequest } from "@/hooks/useSplitRequests";
import { useToast } from "@/components/ui/use-toast";
import { receiptsApi } from "@/api/receipts";
import { formatCurrency, formatDateIso } from "@/lib/formatters";
import type { UserSearchResult } from "@/api/users";
import type { ReceiptRow } from "@/types/receipt";

type Props = {
  open: boolean;
  onClose: () => void;
};

function extractDriveFileId(driveLink: string): string | null {
  const match = driveLink.match(/\/file\/d\/([^/?]+)/);
  return match?.[1] ?? null;
}

export function CreateRequestDialog({ open, onClose }: Props) {
  const { toast } = useToast();
  const { inputValue, setInputValue, users, isLoading: searchLoading } = useUserSearch();
  const createRequest = useCreateRequest();

  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptRow | null>(null);
  const [betrag, setBetrag] = useState("");
  const [nachricht, setNachricht] = useState("");

  const { data: receiptsData } = useQuery({
    queryKey: ["receipts"],
    queryFn: () => receiptsApi.list(),
    enabled: open,
  });
  const receipts = receiptsData?.rows ?? [];

  function handleClose() {
    setSelectedUser(null);
    setSelectedReceipt(null);
    setBetrag("");
    setNachricht("");
    setInputValue("");
    onClose();
  }

  async function handleSubmit() {
    if (!selectedUser || !selectedReceipt || !betrag) return;
    const betragNum = parseFloat(betrag);
    if (isNaN(betragNum) || betragNum <= 0) return;

    const receiptFileId = extractDriveFileId(selectedReceipt.driveLink);
    if (!receiptFileId) {
      toast({ title: "Beleg hat keine gültige Drive-Verknüpfung", variant: "destructive" });
      return;
    }

    try {
      await createRequest.mutateAsync({
        toUserId: selectedUser.id,
        receiptId: receiptFileId,
        receiptMeta: {
          haendler: selectedReceipt.haendler,
          datum: selectedReceipt.datum,
          gesamtbetrag: selectedReceipt.betrag,
          waehrung: selectedReceipt.waehrung,
        },
        betrag: betragNum,
        nachricht,
      });
      toast({ title: "Anforderung gesendet" });
      handleClose();
    } catch {
      toast({ title: "Fehler beim Senden", variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Aufteilung anfordern</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <Label className="mb-1.5 block text-sm">Beleg auswählen</Label>
            <Select
              value={selectedReceipt?.id ?? ""}
              onValueChange={(id) => {
                const r = receipts.find((x) => x.id === id) ?? null;
                setSelectedReceipt(r);
                if (r) setBetrag(String(r.betrag));
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Beleg wählen..." />
              </SelectTrigger>
              <SelectContent>
                {receipts.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.haendler} — {formatDateIso(r.datum)} — {formatCurrency(r.betrag, r.waehrung)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1.5 block text-sm">Nutzer suchen</Label>
            {selectedUser ? (
              <div className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{selectedUser.name}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{selectedUser.email}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setSelectedUser(null)}>Ändern</Button>
              </div>
            ) : (
              <Command className="rounded-lg border border-[hsl(var(--border))]">
                <CommandInput
                  placeholder="Name oder E-Mail..."
                  value={inputValue}
                  onValueChange={setInputValue}
                />
                <CommandList>
                  {inputValue.length >= 2 && !searchLoading && users.length === 0 && (
                    <CommandEmpty>Kein Nutzer gefunden</CommandEmpty>
                  )}
                  {users.map((u) => (
                    <CommandItem key={u.id} value={u.email} onSelect={() => setSelectedUser(u)}>
                      <div>
                        <p className="text-sm font-medium">{u.name}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">{u.email}</p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandList>
              </Command>
            )}
          </div>

          <div>
            <Label htmlFor="betrag" className="mb-1.5 block text-sm">
              Angeforderter Betrag {selectedReceipt ? `(${selectedReceipt.waehrung})` : ""}
            </Label>
            <Input
              id="betrag"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={betrag}
              onChange={(e) => setBetrag(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="nachricht" className="mb-1.5 block text-sm">Nachricht (optional)</Label>
            <Input
              id="nachricht"
              placeholder="z.B. Anteil Mittagessen"
              value={nachricht}
              maxLength={500}
              onChange={(e) => setNachricht(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Abbrechen</Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedUser || !selectedReceipt || !betrag || createRequest.isPending}
          >
            Anforderung senden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
