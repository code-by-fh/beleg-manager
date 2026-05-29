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
import type { BankTransaction } from "@/types/bank";
import type { OutgoingRequest } from "@/api/splitRequests";

export interface UnmatchedTabProps {
  unmatched: BankTransaction[];
  splitsByTxId: Map<string, OutgoingRequest[]>;
  deleteConfirmTx: string | null;
  busyTx: string | null;
  onAskConfirm: (id: string) => void;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: () => void;
  onAssign: (tx: BankTransaction) => void;
  onSplit: (tx: BankTransaction) => void;
  onIgnore: (tx: BankTransaction) => void;
}

export function UnmatchedTab({
  unmatched,
  splitsByTxId,
  deleteConfirmTx,
  busyTx,
  onAskConfirm,
  onConfirmDelete,
  onCancelDelete,
  onAssign,
  onSplit,
  onIgnore,
}: UnmatchedTabProps) {
  return (
    <div className="rounded-xl border border-border overflow-hidden mt-2">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b border-border">
            <TableHead>Datum</TableHead>
            <TableHead>Händler</TableHead>
            <TableHead className="text-right">Betrag</TableHead>
            <TableHead className="max-w-[200px]">Verwendungszweck</TableHead>
            <TableHead className="text-right">Aktionen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {unmatched.length === 0 ? (
            <EmptyRow colSpan={5} message="Alle Transaktionen sind zugeordnet oder ignoriert." />
          ) : (
            unmatched.map((tx) => {
              const linkedSplits = splitsByTxId.get(tx.id) ?? [];
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
                    {linkedSplits.length > 0 && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <ArrowDownLeft className="h-3 w-3 text-green-600 shrink-0" />
                        <span className="text-xs text-green-700 font-medium">
                          {linkedSplits.map((s) => s.freeName ?? s.toUser?.name ?? "Unbekannt").join(", ")}
                          {" · "}{formatCurrency(linkedSplits.reduce((sum, s) => sum + s.betrag, 0))}
                        </span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <AmountCell amount={tx.betrag} />
                  </TableCell>
                  <TableCell
                    className="max-w-[200px] truncate text-muted-foreground text-xs"
                    title={tx.verwendungszweck}
                  >
                    {tx.verwendungszweck}
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
                            onClick={() => onAssign(tx)}
                            disabled={busyTx === tx.id}
                          >
                            Zuordnen
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
                            onClick={() => onIgnore(tx)}
                            disabled={busyTx === tx.id}
                          >
                            Ignorieren
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
