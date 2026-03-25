import Link from "next/link";

import { getGameHistory } from "@/lib/services/repository";

export const dynamic = "force-dynamic";

function formatGameTime(value?: string | null) {
  if (!value) {
    return "Unknown time";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function StatCard(props: { label: string; value: number; tone: string }) {
  return (
    <div className={`rounded-[20px] p-4 ${props.tone}`}>
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{props.label}</p>
      <p className="mt-2 font-display text-3xl">{props.value}</p>
    </div>
  );
}

export default async function GamesHistoryPage(props: {
  searchParams?: Promise<{
    q?: string;
    opening?: string;
    leak?: string;
    status?: string;
    result?: string;
    minSwing?: string;
  }>;
}) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const minSwingNumber = searchParams.minSwing ? Number.parseInt(searchParams.minSwing, 10) : 0;

  const history = await getGameHistory({
    query: searchParams.q,
    opening: searchParams.opening,
    leakKey: searchParams.leak,
    status: searchParams.status,
    result: searchParams.result,
    minSwing: Number.isFinite(minSwingNumber) ? minSwingNumber : 0
  });

  const resultCounts = history.games.reduce(
    (acc, game) => {
      acc[game.resultBucket] += 1;
      return acc;
    },
    {
      win: 0,
      loss: 0,
      draw: 0,
      unknown: 0
    }
  );

  return (
    <main className="space-y-6">
      <section className="panel space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="badge">History</span>
            <h1 className="mt-3 font-display text-4xl">All game history</h1>
            <p className="mt-2 text-sm text-muted">
              Search and filter by leaks, openings, results, analysis status, and mistake severity.
            </p>
          </div>
          <Link className="btn-secondary text-sm" href="/">
            Back to dashboard
          </Link>
        </div>

        <form action="/games" className="surface-soft grid gap-4 p-4 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="q">
              Search
            </label>
            <input
              className="field mt-2"
              id="q"
              name="q"
              placeholder="opening, player, result, ECO..."
              defaultValue={searchParams.q ?? ""}
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="opening">
              Opening
            </label>
            <select className="field mt-2" id="opening" name="opening" defaultValue={searchParams.opening ?? ""}>
              <option value="">All openings</option>
              {history.openings.map((opening) => (
                <option key={opening} value={opening}>
                  {opening}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="leak">
              Leak
            </label>
            <select className="field mt-2" id="leak" name="leak" defaultValue={searchParams.leak ?? ""}>
              <option value="">All leaks</option>
              {history.leakOptions.map((leak) => (
                <option key={leak.key} value={leak.key}>
                  {leak.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="status">
              Analysis
            </label>
            <select className="field mt-2" id="status" name="status" defaultValue={searchParams.status ?? "all"}>
              <option value="all">All</option>
              <option value="analyzed">Analyzed</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="result">
              Result
            </label>
            <select className="field mt-2" id="result" name="result" defaultValue={searchParams.result ?? "all"}>
              <option value="all">All</option>
              <option value="win">Win bucket</option>
              <option value="loss">Loss bucket</option>
              <option value="draw">Draw bucket</option>
              <option value="unknown">Unknown bucket</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="minSwing">
              Min swing
            </label>
            <select className="field mt-2" id="minSwing" name="minSwing" defaultValue={searchParams.minSwing ?? "0"}>
              <option value="0">Any</option>
              <option value="100">100+ cp</option>
              <option value="150">150+ cp</option>
              <option value="200">200+ cp</option>
              <option value="300">300+ cp</option>
            </select>
          </div>

          <div className="flex flex-wrap items-end gap-2 lg:col-span-6">
            <button className="btn-primary px-5 py-3 text-sm" type="submit">
              Apply filters
            </button>
            <Link className="btn-secondary px-5 py-3 text-sm" href="/games">
              Clear
            </Link>
          </div>
        </form>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Filtered games" value={history.totals.filtered} tone="border border-amber-500/20 bg-amber-500/10" />
          <StatCard label="All games" value={history.totals.all} tone="border border-[color:var(--border)] bg-[color:var(--panel-soft)]" />
          <StatCard label="Wins in view" value={resultCounts.win} tone="border border-emerald-500/20 bg-emerald-500/10" />
          <StatCard label="Losses in view" value={resultCounts.loss} tone="border border-rose-500/20 bg-rose-500/10" />
        </div>
      </section>

      <section className="panel">
        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="badge">Results</span>
            <h2 className="panel-title mt-3">Filtered games</h2>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {history.games.length ? (
            history.games.map((game) => (
              <article key={game.id} className="surface-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="font-display text-2xl">{game.opening}</h3>
                    <p className="mt-1 text-sm text-muted-strong">
                      {game.whitePlayer} vs {game.blackPlayer}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.12em] text-muted">
                      {formatGameTime(game.playedAt)} • {game.resultLabel}
                    </p>
                  </div>
                  <div className="text-right text-sm text-muted">
                    <p>Biggest swing: {game.biggestSwing} cp</p>
                    <p>Mistakes: {game.mistakeCount}</p>
                    <p className="uppercase tracking-[0.12em]">{game.status}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {game.leaks.length ? (
                    game.leaks.map((leak) => (
                      <Link
                        key={leak.key}
                        className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-indigo-700"
                        href={`/leaks/${leak.key}`}
                      >
                        {leak.label} ({leak.count})
                      </Link>
                    ))
                  ) : (
                    <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--panel-soft)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-strong">
                      No leak tags yet
                    </span>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link className="btn-primary text-sm" href={`/games/${game.id}`}>
                    Open game review
                  </Link>
                  {game.leaks[0] ? (
                    <Link className="btn-accent text-sm" href={`/leaks/${game.leaks[0].key}`}>
                      Focus top leak
                    </Link>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <p className="surface-soft p-5 text-sm text-muted-strong">No games match the current filters.</p>
          )}
        </div>
      </section>
    </main>
  );
}
