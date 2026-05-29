import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencySpinnerInput } from "@/components/ui/currency-spinner";
import { ReceiptFormZ, type ReceiptFormValues } from "@/lib/validators";
import { settingsApi } from "@/api/settings";

export const DEFAULT_KATEGORIEN = [
  "Restaurant", "Café", "Supermarkt", "Bäckerei", "Drogerie",
  "Tankstelle", "Parkgebühr", "ÖPNV", "Taxi/Uber",
  "Büromaterial", "Software", "Hardware", "Telefon/Internet",
  "Reise", "Unterkunft", "Flug", "Mietwagen",
  "Kleidung", "Apotheke", "Arzt/Gesundheit",
  "Freizeit", "Sport", "Haushalt",
  "Versicherung", "Steuerberatung",
  "Sonstiges",
];

const ZAHLUNGSMETHODEN = ["(Kredit-)Karte", "Bar", "Sonstiges"];
const WAEHRUNGEN = ["EUR", "USD", "CHF", "GBP"];

export function ReceiptForm({
  initial,
  onSubmit,
  busy,
  submitLabel = "Speichern und archivieren",
  onValuesChange,
  submitDisabled = false,
}: {
  initial: Partial<ReceiptFormValues>;
  onSubmit: (values: ReceiptFormValues) => Promise<void>;
  busy: boolean;
  submitLabel?: string;
  onValuesChange?: (values: { haendler: string; betrag: number; datum: string }) => void;
  submitDisabled?: boolean;
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
      zahlungsmethode: initial.zahlungsmethode ?? "(Kredit-)Karte",
      rechnungsnummer: initial.rechnungsnummer ?? "",
    },
  });

  const { data: categoriesData } = useQuery({
    queryKey: ["custom-categories"],
    queryFn: () => settingsApi.getCategories(),
    staleTime: 300_000,
  });

  const allKategorien = [
    ...DEFAULT_KATEGORIEN,
    ...(categoriesData?.categories ?? []).filter((c) => !DEFAULT_KATEGORIEN.includes(c)),
  ];

  const watchedValues = watch(["haendler", "betrag", "datum"]);

  useEffect(() => {
    const [haendler, betrag, datum] = watchedValues;
    if (onValuesChange) {
      onValuesChange({
        haendler: haendler ?? "",
        betrag: Number(betrag ?? 0),
        datum: datum ?? "",
      });
    }
  }, [watchedValues, onValuesChange]);

  return (
    <form className="space-y-2.5" onSubmit={handleSubmit(onSubmit)}>
      <Field label="Händler" error={errors.haendler?.message}>
        <Input {...register("haendler")} />
      </Field>
      <Field label="Datum" error={errors.datum?.message}>
        <Input type="date" {...register("datum")} />
      </Field>
      <Field label="Betrag (brutto)" error={errors.betrag?.message}>
        <CurrencySpinnerInput
          value={watch("betrag") ?? 0}
          onChange={(v) => setValue("betrag", v, { shouldValidate: true })}
          currency={watch("waehrung") ?? "EUR"}
        />
      </Field>
      <Field label="MwSt" error={errors.mwst?.message}>
        <CurrencySpinnerInput
          value={watch("mwst") ?? 0}
          onChange={(v) => setValue("mwst", v, { shouldValidate: true })}
          currency={watch("waehrung") ?? "EUR"}
        />
      </Field>
      <Field label="Trinkgeld" error={errors.trinkgeld?.message}>
        <CurrencySpinnerInput
          value={watch("trinkgeld") ?? 0}
          onChange={(v) => setValue("trinkgeld", v, { shouldValidate: true })}
          currency={watch("waehrung") ?? "EUR"}
        />
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
          <SelectContent>{allKategorien.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field label="Zahlungsmethode" error={errors.zahlungsmethode?.message}>
        <Select value={watch("zahlungsmethode")} onValueChange={(v) => setValue("zahlungsmethode", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{ZAHLUNGSMETHODEN.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field label="Rechnungsnr." error={errors.rechnungsnummer?.message}>
        <Input {...register("rechnungsnummer")} />
      </Field>
      <div className="pt-2">
        <Button type="submit" disabled={busy || submitDisabled} className="w-full">
          {busy ? "Speichere..." : submitDisabled ? "Duplikat blockiert" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Label className="w-28 flex-shrink-0 text-right text-xs text-muted-foreground">{label}</Label>
      <div className="flex-1 min-w-0">
        {children}
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      </div>
    </div>
  );
}
