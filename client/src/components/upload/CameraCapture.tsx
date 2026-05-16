import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { receiptsApi } from "@/api/receipts";

export function CameraCapture() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<Blob | null>(null);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (e) {
        setError(`Kamerazugriff verweigert oder nicht verfügbar: ${(e as Error).message}`);
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function takePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      setSnapshot(blob);
      if (snapshotUrl) URL.revokeObjectURL(snapshotUrl);
      setSnapshotUrl(URL.createObjectURL(blob));
    }, "image/jpeg", 0.92);
  }

  async function submit() {
    if (!snapshot) return;
    setBusy(true);
    try {
      const file = new File([snapshot], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
      await receiptsApi.upload(file);
      toast({ title: "Beleg wird verarbeitet", description: "Er erscheint in Kürze unter Belege." });
      setSnapshot(null);
      if (snapshotUrl) URL.revokeObjectURL(snapshotUrl);
      setSnapshotUrl(null);
    } catch (e) {
      toast({ title: "Upload fehlgeschlagen", description: String((e as Error).message) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mit Kamera aufnehmen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-md bg-black aspect-video" />
            <canvas ref={canvasRef} className="hidden" />
            {snapshotUrl && (
              <img src={snapshotUrl} alt="Aufnahme" className="w-full rounded-md border" />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={takePhoto} className="flex-1">
                {snapshot ? "Neu aufnehmen" : "Foto aufnehmen"}
              </Button>
              <Button onClick={submit} disabled={!snapshot || busy} className="flex-1">
                {busy ? "Verarbeite..." : "Verarbeiten"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
