import { useRef, useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { receiptsApi } from "@/api/receipts";

export function PhotoUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!file) { setPreviewUrl(null); return; }
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [file]);

  function handleFile(f: File | undefined) {
    setFile(f ?? null);
  }

  async function submit() {
    if (!file) return toast({ title: "Bitte eine Datei wählen." });
    setBusy(true);
    try {
      await receiptsApi.upload(file, transcript || undefined);
      toast({ title: "Beleg wird verarbeitet", description: "Er erscheint in Kürze unter Belege." });
      setFile(null);
      setTranscript("");
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
          className="rounded-md border-2 border-dashed p-8 text-center cursor-pointer hover:bg-secondary/30 space-y-3"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Vorschau"
              className="max-h-48 mx-auto rounded-lg object-contain"
            />
          ) : file?.type === "application/pdf" ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <FileText className="h-10 w-10" />
              <span className="text-sm font-medium">{file.name}</span>
            </div>
          ) : null}
          <p className="text-sm text-muted-foreground">
            {file ? file.name : "Datei hier hineinziehen oder klicken zum Auswählen"}
          </p>
          <Input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
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
