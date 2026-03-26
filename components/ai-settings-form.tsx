"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { clearPrivateAIConfig, getPrivateAIConfig, savePrivateAIConfig } from "@/lib/client/private-store";

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
  const [provider, setProvider] = useState<"openai" | "mock">("mock");
  const [model, setModel] = useState("deterministic-coach");
  const [apiKey, setApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(!props.selected.hasApiKey);
  const [clearAllData, setClearAllData] = useState(false);
  const [clearConfirm, setClearConfirm] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isClearing, startClearingTransition] = useTransition();
  const [hasStoredApiKey, setHasStoredApiKey] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void getPrivateAIConfig()
      .then((config) => {
        if (cancelled) {
          return;
        }
        setProvider(config.provider);
        setModel(config.model);
        setHasStoredApiKey(Boolean(config.apiKey));
        setClearApiKey(false);
      })
      .catch(() => {
        if (!cancelled) {
          setProvider(props.selected.provider);
          setModel(props.selected.model);
          setHasStoredApiKey(props.selected.hasApiKey);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [props.selected.hasApiKey, props.selected.model, props.selected.provider]);

  const selectedProvider = props.providers.find((item) => item.name === provider) ?? props.providers[0];

  return (
    <form
      id="ai-coach"
      className="panel space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setNotice(null);

        startTransition(async () => {
          const current = await getPrivateAIConfig();
          const nextApiKey = clearApiKey ? null : apiKey.trim() || current.apiKey || null;
          await savePrivateAIConfig({
            provider,
            model,
            apiKey: nextApiKey
          });
          setApiKey("");
          setClearApiKey(false);
          setHasStoredApiKey(Boolean(nextApiKey));
          setNotice("Settings saved.");
          router.refresh();
        });
      }}
    >
      <div>
        <span className="badge">AI Settings</span>
        <h2 className="panel-title mt-3">Unlock AI coaching</h2>
        <p className="mt-2 text-sm text-muted">
          You already have engine analysis. Add your OpenAI token here to unlock deeper coaching, grounded coach chat,
          leak explanations, and recent-games style reports.
        </p>
      </div>

      <div className="tone-info rounded-[24px] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">What unlocks</p>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-strong">
          <li>Move-by-move coaching on game pages</li>
          <li>Coach chat grounded in your own games and saved notes</li>
          <li>Leak explanations and recent style reports across your latest games</li>
        </ul>
        <p className="mt-4 text-xs text-muted">
          Your token is stored only in this local app and used only when you explicitly run AI coaching features.
        </p>
      </div>

      <div className="surface-soft rounded-[24px] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">How to add your ChatGPT token</p>
        <ol className="mt-3 space-y-3 text-sm leading-6 text-muted-strong">
          <li>
            1. Create an OpenAI API token from{" "}
            <a
              className="font-semibold text-[color:var(--accent)] underline decoration-[color:var(--accent-soft)] underline-offset-4"
              href="https://platform.openai.com/api-keys"
              rel="noreferrer"
              target="_blank"
            >
              platform.openai.com/api-keys
            </a>
            .
          </li>
          <li>2. Keep `Provider` set to `openai` in ChessMe.</li>
          <li>3. Paste that token into the `API token` field below.</li>
          <li>4. Pick a model such as `gpt-5-mini` if you want a good default.</li>
          <li>5. Click `Save AI settings`, then go back to any game, leak, or coach page and use the AI actions there.</li>
        </ol>
        <div className="mt-4 rounded-[18px] border border-[color:var(--border)] bg-[color:var(--panel-strong)] px-4 py-3 text-sm text-muted-strong">
          <p className="font-semibold text-[color:var(--text)]">Important</p>
          <p className="mt-1">
            This app uses an OpenAI API token, not a generic ChatGPT login inside the app. The token stays only on
            this device and never becomes public server data.
          </p>
          <p className="mt-2">
            If you need help creating the token, OpenAI explains it here:{" "}
            <a
              className="font-semibold text-[color:var(--accent)] underline decoration-[color:var(--accent-soft)] underline-offset-4"
              href="https://help.openai.com/en/articles/4936850-how-to-create-and-use-an-api-key"
              rel="noreferrer"
              target="_blank"
            >
              Where do I find my OpenAI API key?
            </a>
          </p>
        </div>
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
          placeholder={hasStoredApiKey ? "Token already saved (enter to replace)" : "Paste token"}
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
        />
        <p className="mt-2 text-xs text-muted">
          Best experience: keep engine analysis on for all games, then use ChatGPT for coaching surfaces and deeper explanations.
        </p>
        {hasStoredApiKey ? (
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

              await clearPrivateAIConfig();
              setClearConfirm("");
              setClearAllData(false);
              if (clearAllData) {
                setProvider("mock");
                setModel("deterministic-coach");
                setApiKey("");
                setClearApiKey(false);
                setHasStoredApiKey(false);
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
