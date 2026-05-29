import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ArrowDownLeft, SplitSquareHorizontal } from "lucide-react";
import { formatCurrency, formatDateIso } from "@/lib/formatters";
import { AmountCell } from "@/components/ui/amount-cell";
import { EmptyRow } from "@/components/ui/empty-row";
import { InlineDeleteButton } from "@/components/ui/inline-delete-button";
import { ConfidenceBadge } from "@/components/bank/ConfidenceBadge";
import type { BankTransaction } from "@/types/bank";
import type { OutgoingRequest } from "@/api/splitRequests";
import type { ReceiptRow } from "@/types/receipt";

export interface MatchedTabProps {
  matched: BankTransaction[];
  splitsByTxId: Map<string, OutgoingRequest[]>;
  receiptMap: Map<string, ReceiptRow>;
  deleteConfirmTx: string | null;
  busyTx: string | null;
  onAskConfirm: (id: string) => void;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: () => void;
  onReassign: (tx: BankTransaction) => void;
  onSplit: (tx: BankTransaction) => void;
  onUnmatch: (tx: BankTransaction) => void;
  onViewReceipt: (receipt: ReceiptRow) => void;
}

export function MatchedTab({
  matched,
  splitsByTxId,
  receiptMap,
  deleteConfirmTx,
  busyTx,
  onAskConfirm,
  onConfirmDelete,
  onCancelDelete,
  onReassign,
  onSplit,
  onUnmatch,
  onViewReceipt,
}: MatchedTabProps) {
  return (
    <div className="rounded-xl border border-border overflow-hidden mt-2">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b border-border">
            <TableHead>Datum</TableHead>
            <TableHead>Händler</TableHead>
            <TableHead className="text-right">Betrag</TableHead>
            <TableHead>Konfidenz</TableHead>
            <TableHead>Verknüpfter Beleg</TableHead>
            <TableHead className="text-right">Aktionen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {matched.length === 0 ? (
            <EmptyRow colSpan={6} message="Noch keine Transaktionen abgeglichen." />
          ) : (
            matched.map((tx) => {
              const receipt = tx.matchedReceiptId
                ? receiptMap.get(tx.matchedReceiptId)
                : undefined;
              return (
                <TableRow
                  key={tx.id}
                  className="hover:bg-muted/30 transition-colors border-b border-border"
                >
                  <TableCell className="text-muted-foreground">
                    {formatDateIso(tx.buchungsdatum)}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium leading-tight">{tx.haendler}</div>
                    {tx.verwendungszweck && (
                      <div
                        className="text-xs text-muted-foreground truncate max-w-[200px]"
                        title={tx.verwendungszweck}
                      >
                        {tx.verwendungszweck}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <AmountCell amount={tx.betrag} />
                  </TableCell>
                  <TableCell>
                    <ConfidenceBadge confidence={tx.matchConfidence} />
                  </TableCell>
                  <TableCell>
                    {receipt ? (
                      <button
                        className="text-left hover:underline"
                        onClick={() => onViewReceipt(receipt)}
                      >
                        <span className="font-medium text-sm">{receipt.haendler}</span>
                        <span className="text-muted-foreground text-xs ml-1.5">
                          {formatDateIso(receipt.datum)} ·{" "}
                          {formatCurrency(receipt.betrag, receipt.waehrung)}
                        </span>
                      </button>
                    ) : (() => {
                      const linked = splitsByTxId.get(tx.id) ?? [];
                      if (linked.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
                      return (
                        <div className="flex items-center gap-1">
                          <ArrowDownLeft className="h-3.5 w-3.5 text-green-600 shrink-0" />
                          <span className="text-sm font-medium text-green-700">
                            {linked.map((s) => s.freeName ?? s.toUser?.name ?? "Unbekannt").join(", ")}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            · {formatCurrency(linked.reduce((sum, s) => sum + s.betrag, 0))}
                          </span>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {deleteConfirmTx === tx.id ? (
                        <InlineDeleteButton
                          isConfirming
                          isBusy={busyTx === tx.id}
                          onAskConfirm={() => onAskConfirm(tx.id)}
                          onConfirm={() => onConfirmDelete(tx.id)}
                          onCancel={onCancelDelete}
                        />
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onReassign(tx)}
                            disabled={busyTx === tx.id}
                          >
                            Neu zuordnen
                          </Button>
                          <Button
                            size="sm"
                            variant={splitsByTxId.has(tx.id) ? "secondary" : "outline"}
                            onClick={() => onSplit(tx)}
                            disabled={busyTx === tx.id}
                            title="Aufteilung anfordern"
                            className={splitsByTxId.has(tx.id) ? "text-blue-600" : ""}
                          >
                            <SplitSquareHorizontal className="h-3.5 w-3.5 mr-1" />
                            Aufteilen
                            {(splitsByTxId.get(tx.id)?.length ?? 0) > 0 && (
                              <span className="ml-1 rounded-full bg-blue-200 text-blue-700 px-1.5 text-[10px] font-bold leading-none">
                                {splitsByTxId.get(tx.id)!.length}
                              </span>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onUnmatch(tx)}
                            disabled={busyTx === tx.id}
                          >
                            Aufheben
                          </Button>
                          <InlineDeleteButton
                            isConfirming={false}
                            isBusy={busyTx === tx.id}
                            onAskConfirm={() => onAskConfirm(tx.id)}
                            onConfirm={() => onConfirmDelete(tx.id)}
                            onCancel={onCancelDelete}
                          />
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
