# Beleg Erfassen — Mobile-First Redesign

**Date:** 2026-05-29  
**Status:** Approved

## Ziel

Die "Beleg erfassen"-Seite (`/upload`) wird mobile-first redesignt. Die Belege-Inbox wird zum zentralen Bestandteil der Seite. Die Eingabewahl (Text oder Dokument) erfolgt über einen FAB-Button mit Bottom-Sheet. Die bestehende Logik bleibt vollständig erhalten — es ist ein reines Frontend-Refactoring mit Komponentenzerlegung.

## Designentscheidungen (aus Brainstorming)

| Frage | Entscheidung |
|---|---|
| Seitenstruktur | Inbox-First mit schwebendem FAB (`+`) |
| Text-Eingabe | Bottom-Sheet morpht zu Texteingabe (kein Seitenwechsel) |
| Foto-Countdown | Vollbild-Overlay mit Bildvorschau, immer sichtbar (auch mobil) |
| Implementierungsansatz | Komponentenzerlegung (Ansatz B) |

## Komponentenstruktur

### `UnifiedInput.tsx` — Orchestrator (bleibt)

Hält den globalen State und alle API-Calls. Rendert die neuen Unterkomponenten.

**State:**
```ts
type Mode = "idle" | "fab-open" | "text-sheet" | "countdown";
```

**State-Übergänge:**
- `FAB tap` → `idle` → `fab-open`
- `"Foto" tap im Sheet` → `fab-open` → Datei-Picker → nach Auswahl → `countdown`
- `"Text" tap im Sheet` → `fab-open` → `text-sheet`
- `Sheet schließen / Backdrop` → beliebig → `idle`
- `Countdown endet (0s)` → `countdown` → Upload-API → `idle`
- `"Abbrechen" im Countdown` → `countdown` → `idle`
- `Text abgesendet` → `text-sheet` → API → `idle`

**Unverändert bleibt:**
- `uploadFile()`, `submitText()`, `importDriveFile()`
- `useDriveInbox()`, `useQueryClient()`, `useNavigate()`
- Preview-Dialog und Discard-Dialog (als `<Dialog>`-Komponenten inline)

---

### `InboxList.tsx` *(neu — `client/src/components/upload/`)*

Reine Darstellungskomponente für die Inbox-Einträge.

**Props:**
```ts
interface InboxListProps {
  files: DriveInboxFile[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
  busyId: string | null;
  onImport: (id: string) => void;
  onDiscard: (id: string) => void;
  onPreview: (file: DriveInboxFile) => void;
  onRefetch: () => void;
}
```

**Rendering:**
- Ladezustand: Skeleton-Rows (3 Stück)
- Fehlerzustand: Fehlermeldung mit Retry-Button
- Leerer Zustand: zentriertes Inbox-Icon + "Noch keine Belege in der Inbox"
- Items: `bg-surface rounded-xl` Card mit Dateiname, Statustext (farbig), Trash-Icon, Start/Review-Button

---

### `CaptureSheet.tsx` *(neu — `client/src/components/upload/`)*

Bottom-Sheet für die Eingabewahl und Texteingabe.

**Props:**
```ts
interface CaptureSheetProps {
  open: boolean;
  mode: "choice" | "text";
  textInput: string;
  busy: boolean;
  onClose: () => void;
  onTextChange: (value: string) => void;
  onSubmitText: () => void;
  onOpenFilePicker: () => void;
}
```

Das `<input type="file">` bleibt in `UnifiedInput` — `CaptureSheet` ruft nur `onOpenFilePicker()` auf und kennt den Datei-Picker nicht weiter.

**Modus "choice":**
- Radix `<Dialog>` mit `DialogContent` überschrieben auf `fixed bottom-0 inset-x-0 top-auto rounded-t-2xl translate-y-0` via className-Override, `animate-in slide-in-from-bottom`
- Handle-Bar oben
- Zwei nebeneinander liegende Karten: **Foto** (Upload-Icon, "JPG, PNG, PDF") | **Text** (Type-Icon, "Beleg beschreiben")
- Tap Foto → `onOpenFilePicker()` → Sheet bleibt offen bis `mode` sich extern ändert
- Tap Text → Parent setzt `mode` auf `"text"` → Sheet morpht

**Modus "text":**
- Animierter Übergang (Height-Animation via CSS transition)
- Handle-Bar + "Text eingeben" + X-Button oben rechts
- `<textarea>` volle Breite, `rows={4}`, `autoFocus`, max 500 Zeichen
- "Verarbeiten"-Button — disabled wenn leer oder `busy`

---

### `CountdownOverlay.tsx` *(neu — `client/src/components/upload/`)*

Vollbild-Overlay während des 5-Sekunden-Countdowns.

**Props:**
```ts
interface CountdownOverlayProps {
  file: File;
  countdown: number;
  previewUrl: string | null;
  onCancel: () => void;
}
```

**Layout:**
- `fixed inset-0 z-50 bg-background flex flex-col items-center justify-center gap-6 px-6`
- SVG-Countdown-Ring: `80×80px`, animierter Stroke-Dashoffset, Zahl in der Mitte
- Bildvorschau: `max-h-[45vh] max-w-full object-contain rounded-2xl` — immer sichtbar (kein Toggle auf Mobile)
- PDF/kein Bild: Datei-Icon statt Preview
- Dateiname + Dateigröße (kleinerer Text)
- "Abbrechen"-Button: volle Breite, `variant="outline"`

---

## Layout der Hauptseite

**Struktur:**
```
<div className="relative h-full flex flex-col">
  <header>  ← "Beleg erfassen" + Inbox-Counter-Badge + Aktualisieren-Button
  <main>    ← scrollbar, <InboxList> füllt den Raum
  <button>  ← FAB: fixed bottom-6 right-6, h-14 w-14, rounded-full, bg-foreground
</div>
```

**FAB:**
- `fixed bottom-6 right-6` (überlappt nicht mit Mobile-Nav, da Nav unten ist — ggf. `bottom-20` auf Mobile prüfen)
- `Plus`-Icon aus Lucide, `h-6 w-6`
- `shadow-xl`, `z-40`

## Keine API-Änderungen

Ausschließlich frontend-seitiges Refactoring. Keine neuen Endpoints, keine Schema-Änderungen, keine neuen Hooks.

## Dateien betroffen

| Datei | Änderung |
|---|---|
| `client/src/components/upload/UnifiedInput.tsx` | Refactoring zum Orchestrator, neuer State, neue JSX-Struktur |
| `client/src/components/upload/InboxList.tsx` | Neu |
| `client/src/components/upload/CaptureSheet.tsx` | Neu |
| `client/src/components/upload/CountdownOverlay.tsx` | Neu |
| `client/src/pages/Upload.tsx` | Unverändert |
