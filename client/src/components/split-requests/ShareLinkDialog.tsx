import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { useCreateShareLink } from "@/hooks/useShareLinks";
import { Copy, Check, Mail } from "lucide-react";

type Props = {
  personName: string;
  prefillEmail?: string;
  open: boolean;
  onClose: () => void;
};

export function ShareLinkDialog({ personName, prefillEmail, open, onClose }: Props) {
  const [email, setEmail] = useState(prefillEmail ?? "");
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const { toast } = useToast();
  const createLink = useCreateShareLink();

  function handleClose() {
    setEmail(prefillEmail ?? "");
    setCopied(false);
    setShareUrl(null);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const result = await createLink.mutateAsync({ personName, personEmail: email });
      setShareUrl(result.shareUrl);
    } catch {
      toast({ title: "Fehler beim Erstellen des Links", variant: "destructive" });
    }
  }

  async function handleCopy() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link teilen — {personName}</DialogTitle>
          <DialogDescription>
            Der Link zeigt alle Anforderungen für diese Person. Er ist 20 Tage gültig.
          </DialogDescription>
        </DialogHeader>

        {!shareUrl ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="share-email">E-Mail-Adresse</Label>
              <Input
                id="share-email"
                type="email"
                placeholder="person@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus={!prefillEmail}
                readOnly={!!prefillEmail}
                className={prefillEmail ? "bg-muted/50" : ""}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleClose}>Abbrechen</Button>
              <Button type="submit" disabled={createLink.isPending}>
                <Mail className="h-4 w-4 mr-1.5" />
                {createLink.isPending ? "Wird gesendet..." : "Link senden"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-4 mt-2">
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
              Link wurde per E-Mail an <strong>{email}</strong> verschickt.
            </p>
            <div className="flex gap-2">
              <Input value={shareUrl} readOnly className="text-xs bg-muted/50 font-mono" />
              <Button variant="outline" size="icon" onClick={handleCopy} title="Kopieren">
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleClose}>Schließen</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
