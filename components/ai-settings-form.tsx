"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ProviderConfig = {
  name: string;
  models: string[];
};

type Props = {
  selected: {
    provider: "openai" | "mock";
    model: string;
    hasApiKey: boolean;
  };
  providers: ProviderConfig[];
};

export function AISettingsForm(props: Props) {
  const router = useRouter();
  const [provider, setProvider] = useState<"openai" | "mock">(props.selected.provider);
  const [model, setModel] = useState(props.selected.model);
  const [apiKey, setApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [clearAllData, setClearAllData] = useState(false);
  const [clearConfirm, setClearConfirm] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isClearing, startClearingTransition] = useTransition();

  const selectedProvider = props.providers.find((item) => item.name === provider) ?? props.providers[0];

  return (
    <form
      className="panel space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setNotice(null);

        startTransition(async () => {
          const response = await fetch("/api/settings/models", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider,
              model,
              apiKey: apiKey || undefined,
              clearApiKey
            })
          });

          const payload = (await response.json()) as { ok: boolean; error?: string };
          if (!response.ok || payload.ok === false) {
            setNotice(payload.error || "Could not save settings.");
            return;
          }

          setApiKey("");
          setClearApiKey(false);
          setNotice("Settings saved.");
          router.refresh();
        });
      }}
    >
      <div>
        <span className="badge">AI Settings</span>
        <h2 className="panel-title mt-3">Model and token</h2>
        <p className="mt-2 text-sm text-muted">
          Store your API token here instead of `.env`. ChatGPT is used only when you request it from a game or leak page.
        </p>
      </div>

      {notice ? <p className="status-info">{notice}</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="provider">
            Provider
          </label>
          <select
            className="field mt-2"
            id="provider"
            value={provider}
            onChange={(event) => {
              const nextProvider = event.target.value as "openai" | "mock";
              setProvider(nextProvider);
              const defaultModel = props.providers.find((item) => item.name === nextProvider)?.models[0] ?? model;
              setModel(defaultModel);
            }}
          >
            {props.providers.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="model-suggestions">
            Suggested models
          </label>
          <select
            className="field mt-2"
            id="model-suggestions"
            value={selectedProvider?.models.includes(model) ? model : ""}
            onChange={(event) => {
              if (event.target.value) {
                setModel(event.target.value);
              }
            }}
          >
            <option value="">Use custom model id</option>
            {selectedProvider?.models.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="model">
            Model id
          </label>
          <input
            className="field mt-2"
            id="model"
            list="model-suggestions-list"
            value={model}
            placeholder="gpt-5-mini"
            onChange={(event) => setModel(event.target.value)}
          />
          <datalist id="model-suggestions-list">
            {selectedProvider?.models.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="api-key">
          API token
        </label>
        <input
          className="field mt-2"
          id="api-key"
          placeholder={props.selected.hasApiKey ? "Token already saved (enter to replace)" : "Paste token"}
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
        />
        {props.selected.hasApiKey ? (
          <label className="mt-3 flex items-center gap-2 text-sm text-muted">
            <input checked={clearApiKey} type="checkbox" onChange={(event) => setClearApiKey(event.target.checked)} />
            Remove stored token
          </label>
        ) : null}
      </div>

      <button className="btn-primary px-5 py-3 text-sm" disabled={isPending}>
        {isPending ? "Saving..." : "Save AI settings"}
      </button>

      <section className="danger-card">
        <p className="text-xs font-semibold uppercase tracking-[0.14em]">Danger Zone</p>
        <h3 className="mt-2 font-display text-2xl">Clear data</h3>
        <p className="mt-2 text-sm">
          Removes imported games, analysis, leaks, training cards, sessions, and cached AI leak explanations.
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input checked={clearAllData} type="checkbox" onChange={(event) => setClearAllData(event.target.checked)} />
          Also clear profile + AI settings (full reset)
        </label>
        <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.12em]" htmlFor="clear-confirm">
          Type DELETE to confirm
        </label>
        <input
          className="field mt-2"
          id="clear-confirm"
          value={clearConfirm}
          onChange={(event) => setClearConfirm(event.target.value)}
        />
        <button
          className="btn-danger mt-4 px-5 py-3 text-sm"
          disabled={isClearing}
          onClick={() => {
            if (clearConfirm !== "DELETE") {
              setNotice("Type DELETE before clearing data.");
              return;
            }

            setNotice(null);
            startClearingTransition(async () => {
              const response = await fetch("/api/settings/data", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  includeSettings: clearAllData
                })
              });

              const payload = (await response.json()) as { ok: boolean; error?: string };
              if (!response.ok || payload.ok === false) {
                setNotice(payload.error || "Could not clear data.");
                return;
              }

              setClearConfirm("");
              setClearAllData(false);
              if (clearAllData) {
                setProvider("mock");
                setModel("deterministic-coach");
                setApiKey("");
                setClearApiKey(false);
              }
              setNotice("Data cleared.");
              router.refresh();
            });
          }}
          type="button"
        >
          {isClearing ? "Clearing..." : "Clear data"}
        </button>
      </section>
    </form>
  );
}
