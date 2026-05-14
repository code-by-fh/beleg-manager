import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReceiptFormZ, type ReceiptFormValues } from "@/lib/validators";

const KATEGORIEN = ["Restaurant", "Tankstelle", "Büromaterial", "Reise", "Unterkunft", "Software", "Sonstiges"];
const ZAHLUNGSMETHODEN = ["Karte", "Kreditkarte", "Bar", "Überweisung", "PayPal", "Sonstiges"];
const WAEHRUNGEN = ["EUR", "USD", "CHF", "GBP"];

export function ReceiptForm({
  initial,
  onSubmit,
  busy,
  submitLabel = "Speichern und archivieren",
}: {
  initial: Partial<ReceiptFormValues>;
  onSubmit: (values: ReceiptFormValues) => Promise<void>;
  busy: boolean;
  submitLabel?: string;
}) {
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<ReceiptFormValues>({
    resolver: zodResolver(ReceiptFormZ),
    defaultValues: {
      datum: initial.datum ?? new Date().toISOString().slice(0, 10),
      haendler: initial.haendler ?? "",
      betrag: initial.betrag ?? 0,
      mwst: initial.mwst ?? 0,
      trinkgeld: initial.trinkgeld ?? 0,
      waehrung: initial.waehrung ?? "EUR",
      kategorie: initial.kategorie ?? "Sonstiges",
      zahlungsmethode: initial.zahlungsmethode ?? "Karte",
      rechnungsnummer: initial.rechnungsnummer ?? "",
    },
  });

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit(onSubmit)}>
      <Field label="Datum" error={errors.datum?.message}>
        <Input type="date" {...register("datum")} />
      </Field>
      <Field label="Händler" error={errors.haendler?.message}>
        <Input {...register("haendler")} />
      </Field>
      <Field label="Betrag (brutto)" error={errors.betrag?.message}>
        <Input type="number" step="0.01" {...register("betrag")} />
      </Field>
      <Field label="MwSt" error={errors.mwst?.message}>
        <Input type="number" step="0.01" {...register("mwst")} />
      </Field>
      <Field label="Trinkgeld" error={errors.trinkgeld?.message}>
        <Input type="number" step="0.01" {...register("trinkgeld")} />
      </Field>
      <Field label="Währung" error={errors.waehrung?.message}>
        <Select value={watch("waehrung")} onValueChange={(v) => setValue("waehrung", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{WAEHRUNGEN.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field label="Kategorie" error={errors.kategorie?.message}>
        <Select value={watch("kategorie")} onValueChange={(v) => setValue("kategorie", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{KATEGORIEN.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field label="Zahlungsmethode" error={errors.zahlungsmethode?.message}>
        <Select value={watch("zahlungsmethode")} onValueChange={(v) => setValue("zahlungsmethode", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{ZAHLUNGSMETHODEN.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field label="Rechnungsnummer" error={errors.rechnungsnummer?.message}>
        <Input {...register("rechnungsnummer")} />
      </Field>
      <div className="md:col-span-2">
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Speichere..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
