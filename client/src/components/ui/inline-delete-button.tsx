import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export function InlineDeleteButton({
  isConfirming,
  isBusy,
  onAskConfirm,
  onConfirm,
  onCancel,
}: {
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
