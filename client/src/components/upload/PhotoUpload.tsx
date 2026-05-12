import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { receiptsApi } from "@/api/receipts";

export function PhotoUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  async function submit() {
    if (!file) return toast({ title: "Bitte eine Datei wählen." });
    setBusy(true);
    try {
      const res = await receiptsApi.upload(file, transcript || undefined);
      navigate(`/review/${res.pendingId}`, { state: { extraction: res.extraction, fileName: res.fileName } });
    } catch (e) {
      toast({ title: "Upload fehlgeschlagen", description: String((e as Error).message) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Foto hochladen</CardTitle>
        <CardDescription>JPG, PNG, WEBP oder PDF, bis 10 MB.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="rounded-md border-2 border-dashed p-8 text-center cursor-pointer hover:bg-secondary/30"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) setFile(f);
          }}
        >
          <p className="text-sm text-muted-foreground">
            {file ? file.name : "Datei hier hineinziehen oder klicken zum Auswählen"}
          </p>
          <Input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="transcript-photo">Optionaler Sprachkontext</Label>
          <Input
            id="transcript-photo"
            placeholder="z.B. Geschäftsessen mit Kunde XYZ"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
          />
        </div>
        <Button onClick={submit} disabled={!file || busy} className="w-full">
          {busy ? "Verarbeite..." : "Verarbeiten"}
        </Button>
      </CardContent>
    </Card>
  );
}
