import { AccountCard } from "@/components/settings/AccountCard";
import { GmailCard } from "@/components/settings/GmailCard";
import { TelegramCard } from "@/components/settings/TelegramCard";
import { UISettingsCard } from "@/components/settings/UISettingsCard";
import { CategoriesCard } from "@/components/settings/CategoriesCard";
import { DangerZoneCard } from "@/components/settings/DangerZoneCard";

export function SettingsPage() {
  return (
    <div className="h-full overflow-auto">
      <div className="max-w-7xl mx-auto px-4 py-6 pb-10">
        <h1
          className="text-2xl font-black gradient-text mb-8"
          style={{ fontFamily: "'DM Sans', sans-serif" }}
        >
          Einstellungen
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <AccountCard />
          <GmailCard />
          <TelegramCard />
          <UISettingsCard />
          <CategoriesCard />
          <DangerZoneCard />
        </div>
      </div>
    </div>
  );
}
