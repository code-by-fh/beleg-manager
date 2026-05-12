import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Mic, MicOff } from "lucide-react";
import { receiptsApi } from "@/api/receipts";
import { createRecognizer, isSpeechRecognitionSupported, type SpeechController } from "@/lib/speechRecognition";

export function VoiceInput() {
  const [supported] = useState<boolean>(isSpeechRecognitionSupported());
  const [recording, setRecording] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [busy, setBusy] = useState(false);
  const recRef = useRef<SpeechController | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!supported) return;
    recRef.current = createRecognizer({
      lang: "de-DE",
      onResult: (r) => {
        if (r.isFinal) {
          setFinalText((prev) => (prev ? prev + " " : "") + r.transcript.trim());
          setInterim("");
        } else {
          setInterim(r.transcript);
        }
      },
      onError: () => setRecording(false),
      onEnd: () => setRecording(false),
    });
  }, [supported]);

  function toggle() {
    if (!recRef.current) return;
    if (recording) {
      recRef.current.stop();
      setRecording(false);
    } else {
      setFinalText("");
      setInterim("");
      recRef.current.start();
      setRecording(true);
    }
  }

  async function submit() {
    const transcript = (finalText + " " + interim).trim();
    if (!transcript) return toast({ title: "Bitte zuerst etwas einsprechen." });
    setBusy(true);
    try {
      const res = await receiptsApi.voice(transcript);
      navigate(`/review/${res.pendingId}`, { state: { extraction: res.extraction } });
    } catch (e) {
      toast({ title: "Verarbeitung fehlgeschlagen", description: String((e as Error).message) });
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Spracheingabe</CardTitle>
          <CardDescription>Dein Browser unterstützt die Web-Speech-API nicht. Verwende Chrome, Edge oder Safari.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spracheingabe (Deutsch)</CardTitle>
        <CardDescription>Beschreibe den Beleg, z.B. "Heute 45 Euro beim Restaurant Mayer, Geschäftsessen mit Karte gezahlt".</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={toggle} variant={recording ? "destructive" : "default"} className="w-full">
          {recording ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
          {recording ? "Aufnahme stoppen" : "Aufnahme starten"}
        </Button>
        <div className="rounded-md border p-3 min-h-[6rem] text-sm">
          <span>{finalText}</span>
          <span className="text-muted-foreground italic"> {interim}</span>
          {!finalText && !interim && <span className="text-muted-foreground">Transkript erscheint hier...</span>}
        </div>
        <Button onClick={submit} disabled={busy || (!finalText && !interim)} className="w-full">
          {busy ? "Verarbeite..." : "Verarbeiten"}
        </Button>
      </CardContent>
    </Card>
  );
}
