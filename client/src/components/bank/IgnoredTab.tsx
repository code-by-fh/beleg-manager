import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatDateIso } from "@/lib/formatters";
import { AmountCell } from "@/components/ui/amount-cell";
import { EmptyRow } from "@/components/ui/empty-row";
import { InlineDeleteButton } from "@/components/ui/inline-delete-button";
import type { BankTransaction } from "@/types/bank";

export interface IgnoredTabProps {
  ignored: BankTransaction[];
  deleteConfirmTx: string | null;
  busyTx: string | null;
  onAskConfirm: (id: string) => void;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: () => void;
  onRestore: (tx: BankTransaction) => void;
}

export function IgnoredTab({
  ignored,
  deleteConfirmTx,
  busyTx,
  onAskConfirm,
  onConfirmDelete,
  onCancelDelete,
  onRestore,
}: IgnoredTabProps) {
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
          {ignored.length === 0 ? (
            <EmptyRow colSpan={5} message="Keine ignorierten Transaktionen." />
          ) : (
            ignored.map((tx) => (
              <TableRow
                key={tx.id}
                className="hover:bg-muted/30 transition-colors border-b border-border"
              >
                <TableCell className="text-muted-foreground">
                  {formatDateIso(tx.buchungsdatum)}
                </TableCell>
                <TableCell className="font-medium">{tx.haendler}</TableCell>
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
                          variant="ghost"
                          onClick={() => onRestore(tx)}
                          disabled={busyTx === tx.id}
                        >
                          Wiederherstellen
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
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
