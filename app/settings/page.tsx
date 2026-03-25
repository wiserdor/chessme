import Link from "next/link";

import { AISettingsForm } from "@/components/ai-settings-form";
import { PROVIDER_MODELS } from "@/lib/ai";
import { getAISettings } from "@/lib/services/repository";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getAISettings();
  const providers = Object.entries(PROVIDER_MODELS).map(([name, models]) => ({
    name,
    models: [...models]
  }));

  return (
    <main className="space-y-6">
      <section className="panel">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="badge">Settings</span>
            <h1 className="mt-3 font-display text-4xl">App settings</h1>
            <p className="mt-2 text-sm text-muted">
              Configure AI provider, model, and token directly in the app.
            </p>
          </div>
          <Link className="btn-secondary text-sm" href="/">
            Back to dashboard
          </Link>
        </div>
      </section>

      <AISettingsForm
        providers={providers}
        selected={{
          provider: settings.provider,
          model: settings.model,
          hasApiKey: settings.hasApiKey
        }}
      />
    </main>
  );
}
