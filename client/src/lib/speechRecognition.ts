type SpeechRecognitionResult = {
  transcript: string;
  isFinal: boolean;
};

export type SpeechController = {
  start: () => void;
  stop: () => void;
};

export function isSpeechRecognitionSupported(): boolean {
  return typeof window !== "undefined" &&
    (("SpeechRecognition" in window) || ("webkitSpeechRecognition" in window));
}

export function createRecognizer(opts: {
  lang?: string;
  onResult: (r: SpeechRecognitionResult) => void;
  onError?: (e: Event) => void;
  onEnd?: () => void;
}): SpeechController | null {
  if (!isSpeechRecognitionSupported()) return null;
  const Ctor = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
  const rec = new Ctor();
  rec.lang = opts.lang ?? "de-DE";
  rec.continuous = true;
  rec.interimResults = true;
  rec.onresult = (event: any) => {
    let interim = "";
    let final = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) final += result[0].transcript;
      else interim += result[0].transcript;
    }
    if (final) opts.onResult({ transcript: final, isFinal: true });
    if (interim) opts.onResult({ transcript: interim, isFinal: false });
  };
  rec.onerror = (e: Event) => opts.onError?.(e);
  rec.onend = () => opts.onEnd?.();
  return {
    start: () => rec.start(),
    stop: () => rec.stop(),
  };
}
