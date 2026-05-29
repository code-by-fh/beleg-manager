import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { shareLinksApi } from "@/api/shareLinks";
import { formatCurrency, formatDateIso } from "@/lib/formatters";
import { AlertCircle, FileText, Check, X, Eye, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";

const STATUS_LABELS: Record<string, string> = {
  pending:   "Ausstehend",
  accepted:  "Angenommen",
  rejected:  "Abgelehnt",
  cancelled: "Storniert",
  settled:   "Ausgeglichen",
};

const STATUS_CLS: Record<string, string> = {
  pending:   "bg-amber-100 text-amber-700",
  accepted:  "bg-green-100 text-green-700",
  rejected:  "bg-red-100 text-red-700",
  cancelled: "bg-zinc-100 text-zinc-600",
  settled:   "bg-blue-100 text-blue-700",
};

type Position = { name: string; amount: number; assigned: string[] };

type EditState = {
  positions: Position[];
};

/** All unique participant names in a position list */
function getAllParticipants(positions: Position[]): string[] {
  const seen = new Set<string>();
  for (const pos of positions) {
    for (const a of pos.assigned) seen.add(a);
  }
  return [...seen];
}

/** Compute betrag for a specific person from positions */
function computeBetrag(positions: Position[], name: string): number {
  const lc = name.toLowerCase();
  return positions.reduce((acc, pos) => {
    if (pos.assigned.length === 0) return acc;
    const mine = pos.assigned.some(a => a.toLowerCase() === lc);
    if (mine) return acc + pos.amount / pos.assigned.length;
    return acc;
  }, 0);
}

export function SharePage() {
  const { token } = useParams<{ token: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [editingState, setEditingState] = useState<Record<string, EditState>>({});

  function startEditing(requestId: string, initialPositions: Position[]) {
    setEditingState(prev => ({
      ...prev,
      [requestId]: {
        positions: initialPositions.map(p => ({ ...p, assigned: [...p.assigned] })),
      },
    }));
  }

  function cancelEditing(requestId: string) {
    setEditingState(prev => {
      const next = { ...prev };
      delete next[requestId];
      return next;
    });
  }

  function toggleAssignment(requestId: string, posIdx: number, participantName: string) {
    setEditingState(prev => {
      const state = prev[requestId];
      if (!state) return prev;
      const positions = state.positions.map((pos, i) => {
        if (i !== posIdx) return pos;
        const lc = participantName.toLowerCase();
        const has = pos.assigned.some(a => a.toLowerCase() === lc);
        return {
          ...pos,
          assigned: has
            ? pos.assigned.filter(a => a.toLowerCase() !== lc)
            : [...pos.assigned, participantName],
        };
      });
      return { ...prev, [requestId]: { positions } };
    });
  }

  const adjustMutation = useMutation({
    mutationFn: ({
      requestId,
      betrag,
      positions,
    }: {
      requestId: string;
      betrag: number;
      positions: Position[];
    }) => shareLinksApi.adjustSplit(token!, requestId, { betrag, positions }),
    onSuccess: (_, { requestId }) => {
      cancelEditing(requestId);
      qc.invalidateQueries({ queryKey: ["share", token] });
      toast({ title: "Aufteilung angepasst & akzeptiert!" });
    },
    onError: () => {
      toast({ title: "Fehler beim Speichern", variant: "destructive" });
    },
  });

  const { data, isLoading, error, isError } = useQuery({
    queryKey: ["share", token],
    queryFn: () => shareLinksApi.getPublic(token!),
    retry: false,
    enabled: !!token,
  });

  const statusMutation = useMutation({
    mutationFn: ({ requestId, status }: { requestId: string; status: "accepted" | "rejected" }) =>
      shareLinksApi.updateStatus(token!, requestId, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["share", token] }),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Wird geladen…</p>
      </div>
    );
  }

  if (isError) {
    const msg = (error as Error).message ?? "";
    const isExpired = msg.includes("410");
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-sm w-full text-center flex flex-col items-center gap-3">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <p className="font-semibold text-foreground">
            {isExpired ? "Dieser Link ist abgelaufen" : "Dieser Link ist nicht mehr gültig"}
          </p>
          <p className="text-sm text-muted-foreground">
            Bitte den Absender bitten, einen neuen Link zu erstellen.
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const expiryDate = new Date(data.expiresAt).toLocaleDateString("de-DE", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const previewRequest = previewId ? data.requests.find(r => r.id === previewId) : null;
  const previewUrl = previewId ? shareLinksApi.receiptPreviewUrl(token!, previewId) : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-10 min-h-screen flex flex-col w-full">
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Anforderungen für {data.personName}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Gültig bis {expiryDate}</p>
        </div>

        {data.requests.length === 0 ? (
          <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-border/80 bg-card/50 text-center py-10 px-4">
            <p className="text-sm text-muted-foreground">
              Keine Anforderungen vorhanden.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 flex-1">
            {data.requests.map(r => {
              const statusLabel = STATUS_LABELS[r.status] ?? r.status;
              const statusCls = STATUS_CLS[r.status] ?? "bg-zinc-100 text-zinc-600";
              const isPending = r.status === "pending";
              const isAccepted = r.status === "accepted";
              const isBusy = statusMutation.isPending && statusMutation.variables?.requestId === r.id;
              const isEditing = !!editingState[r.id];
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              const editState = editingState[r.id]!;
              const hasPositions = r.positions && r.positions.length > 0;
              const canEdit = (isPending || isAccepted) && !!hasPositions;
              const isSaving = adjustMutation.isPending && (adjustMutation.variables as any)?.requestId === r.id;

              // Participants in view mode (from stored assigned arrays)
              const viewParticipants = hasPositions ? getAllParticipants(r.positions!) : [];

              // Participants in edit mode
              const editParticipants = isEditing ? getAllParticipants(editState.positions) : [];

              // Recipient's calculated betrag in edit mode
              const editBetrag = isEditing
                ? Math.round(computeBetrag(editState.positions, data.personName) * 100) / 100
                : r.betrag;

              return (
                <div
                  key={r.id}
                  className={`rounded-xl border bg-card p-4 sm:p-5 flex flex-col gap-4 transition-all shadow-sm hover:shadow-md ${
                    isEditing ? "border-primary/40 ring-1 ring-primary/10 shadow-md" : "border-border"
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p 
                        className="font-bold text-base sm:text-lg text-foreground truncate max-w-[170px] sm:max-w-[280px]"
                        title={r.haendler}
                      >
                        {r.haendler}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDateIso(r.datum)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span className="font-bold text-base sm:text-lg text-foreground tracking-tight">
                        {formatCurrency(isEditing ? editBetrag : r.betrag, r.waehrung)}
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {(r as any).adjustedByRecipient && !isEditing && (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-orange-100 text-orange-700">
                            Angepasst
                          </span>
                        )}
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${statusCls}`}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  {r.nachricht && (
                    <div className="px-3 py-2 bg-primary/5 rounded-lg border-l-2 border-primary/20 text-xs text-muted-foreground italic">
                      „{r.nachricht}“
                    </div>
                  )}

                  {/* ── POSITIONS – VIEW MODE ── */}
                  {hasPositions && !isEditing && (
                    <div className="border-t border-border/50 pt-3.5 space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Belegpositionen & Aufteilung
                      </p>
                      <div className="max-h-64 overflow-y-auto pr-1 space-y-2.5 rounded-lg border border-border/40 p-2 bg-muted/10">
                        {r.positions!.map((pos, pIdx) => (
                          <div
                            key={pIdx}
                            className="flex flex-col gap-1.5 p-2.5 rounded-md border border-border/60 bg-card shadow-2xs"
                          >
                            <div className="flex justify-between items-start gap-2">
                              <span
                                className="text-sm font-medium text-foreground truncate max-w-[200px]"
                                title={pos.name}
                              >
                                {pos.name}
                              </span>
                              <span className="text-sm font-mono font-semibold text-primary flex-shrink-0">
                                {formatCurrency(pos.amount, r.waehrung)}
                              </span>
                            </div>
                            {pos.assigned.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {pos.assigned.map((name, nIdx) => {
                                  const isMe = name.toLowerCase() === data.personName.toLowerCase();
                                  return (
                                    <span
                                      key={nIdx}
                                      className={`px-2 py-0.5 rounded text-[10px] font-medium tracking-wide ${
                                        isMe
                                          ? "bg-primary text-primary-foreground shadow-sm"
                                          : "bg-muted/80 text-muted-foreground"
                                      }`}
                                    >
                                      {name === "Ich" ? "Ersteller" : name}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* View-mode participant summary */}
                      {viewParticipants.length > 0 && (
                        <div className="border-t border-border/60 pt-3 space-y-2">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Berechnete Anteile
                          </p>
                          <div className="space-y-1.5">
                            {viewParticipants.map(name => {
                              const amt = Math.round(computeBetrag(r.positions!, name) * 100) / 100;
                              const isMe = name.toLowerCase() === data.personName.toLowerCase();
                              return (
                                <div
                                  key={name}
                                  className={`flex justify-between items-center h-9 px-3 rounded-md border text-sm ${
                                    isMe
                                      ? "bg-primary/5 border-primary/20"
                                      : "bg-muted/20 border-border/40"
                                  }`}
                                >
                                  <span className={`font-semibold ${isMe ? "text-primary" : "text-muted-foreground"}`}>
                                    {name === "Ich" ? "Ersteller" : name}
                                    {isMe && " (du)"}
                                  </span>
                                  <span className="font-mono font-bold">
                                    {formatCurrency(amt, r.waehrung)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── POSITIONS – EDIT MODE ── */}
                  {hasPositions && isEditing && (
                    <div className="border-t border-border/50 pt-3.5 space-y-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                        Aufteilung anpassen
                      </p>

                      {/* Position cards */}
                      <div className="max-h-64 overflow-y-auto pr-1 space-y-2.5 rounded-lg border border-border/40 p-2 bg-muted/10">
                        {editState.positions.map((pos, pIdx) => {
                          const assigned = pos.assigned;
                          return (
                            <div
                              key={pIdx}
                              className="flex flex-col gap-2 p-2.5 rounded-md border border-border bg-card hover:border-border/80 transition-colors shadow-2xs"
                            >
                              <div className="flex justify-between items-start gap-2">
                                <span
                                  className="text-sm font-medium text-foreground truncate max-w-[200px]"
                                  title={pos.name}
                                >
                                  {pos.name}
                                </span>
                                <span className="text-sm font-mono font-semibold text-primary flex-shrink-0">
                                  {formatCurrency(pos.amount, r.waehrung)}
                                </span>
                              </div>
                              {/* Pill-toggle buttons — touch optimized for mobile */}
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {editParticipants.map(participant => {
                                  const isSelected = assigned.some(
                                    a => a.toLowerCase() === participant.toLowerCase()
                                  );
                                  return (
                                    <button
                                      key={participant}
                                      type="button"
                                      onClick={() => toggleAssignment(r.id, pIdx, participant)}
                                      className={`px-3 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all ${
                                        isSelected
                                          ? "bg-primary text-primary-foreground shadow-sm scale-102"
                                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                                      }`}
                                    >
                                      {participant === "Ich" ? "Ersteller" : participant}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Summary */}
                      <div className="border-t border-border/60 pt-3 space-y-2">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                          Berechnete Anteile
                        </span>
                        <div className="space-y-1.5">
                          {editParticipants.map(name => {
                            const amt = Math.round(
                              computeBetrag(editState.positions, name) * 100
                            ) / 100;
                            const isMe = name.toLowerCase() === data.personName.toLowerCase();
                            return (
                              <div
                                key={name}
                                className={`flex justify-between items-center h-9 px-3 rounded-md border text-sm ${
                                  isMe
                                    ? "bg-primary/5 border-primary/30"
                                    : "bg-muted/20 border-border/40"
                                }`}
                              >
                                <span className={`font-semibold ${isMe ? "text-primary" : "text-muted-foreground"}`}>
                                  {name === "Ich" ? "Ersteller" : name}
                                  {isMe && " (du)"}
                                </span>
                                <span className="font-mono font-bold">
                                  {formatCurrency(amt, r.waehrung)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Edit-mode save / cancel */}
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          className="flex-1 h-10 text-xs font-semibold gap-1.5"
                          disabled={isSaving || editBetrag <= 0}
                          onClick={() =>
                              adjustMutation.mutate({
                              requestId: r.id,
                              betrag: editBetrag,
                              positions: editState.positions,
                            })
                          }
                        >
                          <Check className="h-4 w-4" />
                          {isSaving ? "Speichern…" : "Speichern & Annehmen"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-10 px-4 text-xs font-semibold"
                          disabled={isSaving}
                          onClick={() => cancelEditing(r.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* ── ACTIONS (TOUCH OPTIMIZED FOR MOBILE) ── */}
                  {!isEditing && (
                    <div className="flex flex-col gap-2 pt-1">
                      {isPending && (
                        <Button
                          variant="default"
                          size="sm"
                          className="w-full h-10 text-xs font-semibold gap-1.5 bg-green-600 hover:bg-green-700 text-white shadow-sm"
                          disabled={isBusy}
                          onClick={() => statusMutation.mutate({ requestId: r.id, status: "accepted" })}
                        >
                          <Check className="h-4 w-4" /> Annehmen
                        </Button>
                      )}

                      {(r.hasReceipt || (isPending && canEdit)) && (
                        <div className="grid grid-cols-2 gap-2">
                          {r.hasReceipt && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-9 text-xs font-semibold gap-1.5 w-full"
                              onClick={() => setPreviewId(r.id)}
                            >
                              <Eye className="h-3.5 w-3.5" /> Beleg ansehen
                            </Button>
                          )}

                          {isPending && canEdit && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-9 text-xs font-semibold gap-1.5 w-full border-primary/40 text-primary hover:bg-primary/5"
                              onClick={() => startEditing(r.id, r.positions!)}
                            >
                              <Pencil className="h-3.5 w-3.5" /> Anpassen
                            </Button>
                          )}
                        </div>
                      )}

                      {isPending && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full h-9 text-xs font-semibold gap-1.5 border-red-200 text-red-600 hover:bg-red-50/50 hover:border-red-300"
                          disabled={isBusy}
                          onClick={() => statusMutation.mutate({ requestId: r.id, status: "rejected" })}
                        >
                          <X className="h-3.5 w-3.5" /> Ablehnen
                        </Button>
                      )}

                      {isAccepted && canEdit && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full h-9 text-xs font-semibold gap-1.5 border-primary/40 text-primary hover:bg-primary/5"
                          onClick={() => startEditing(r.id, r.positions!)}
                        >
                          <Pencil className="h-3.5 w-3.5" /> Aufteilung erneut anpassen
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Receipt preview dialog - Optimized for Mobile Viewports */}
      <Dialog open={!!previewId} onOpenChange={open => { if (!open) setPreviewId(null); }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-2xl p-0 overflow-hidden sm:rounded-2xl mx-auto">
          {previewRequest && previewUrl && (
            <div className="flex flex-col h-[75vh] sm:h-auto max-h-[85vh]">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2 bg-card">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <p className="text-sm font-semibold text-foreground truncate">
                    {previewRequest.haendler} – {formatDateIso(previewRequest.datum)}
                  </p>
                </div>
              </div>
              <div className="relative flex-1 bg-zinc-50 dark:bg-zinc-950 min-h-[40vh] h-full overflow-hidden">
                <img
                  src={previewUrl}
                  alt="Beleg"
                  className="w-full h-full object-contain"
                  onError={e => {
                    const el = e.currentTarget;
                    const parent = el.parentElement!;
                    el.remove();
                    const iframe = document.createElement("iframe");
                    iframe.src = previewUrl;
                    iframe.className = "w-full h-full border-0";
                    parent.appendChild(iframe);
                  }}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
