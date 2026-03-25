import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { engineReviews, games } from "@/lib/db/schema";

type TacticalExample = {
  text: string;
  href?: string;
  gameId: string;
  ply?: number;
  opening: string;
  deltaCp?: number;
  playedMove?: string;
  bestMove?: string;
  label?: string;
  tags?: string[];
  explanation: string;
  whyLeak: string;
  source: "ai" | "fallback";
};

type MotifKey =
  | "forcing-moves"
  | "auto-capture"
  | "opening-shots"
  | "king-danger"
  | "one-move-punishment";

type MotifSummary = {
  key: MotifKey;
  title: string;
  count: number;
  averageSwing: number;
  blindspot: string;
  trigger: string;
  rule: string;
  examples: TacticalExample[];
};

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function phaseForExample(example: TacticalExample) {
  if (example.tags?.includes("opening") || (typeof example.ply === "number" && example.ply <= 16)) {
    return "opening";
  }

  if (example.tags?.includes("endgame") || (typeof example.ply === "number" && example.ply >= 50)) {
    return "endgame";
  }

  return "middlegame";
}

function motifForExample(example: TacticalExample): {
  key: MotifKey;
  title: string;
  blindspot: string;
  trigger: string;
  rule: string;
} {
  const played = example.playedMove ?? "";
  const best = example.bestMove ?? "";
  const opening = phaseForExample(example) === "opening";
  const checking = example.tags?.includes("check") || best.includes("+") || best.includes("#");
  const captureReflex = played.includes("x");
  const hugeSwing = (example.deltaCp ?? 0) >= 280;

  if (opening) {
    return {
      key: "opening-shots",
      title: "Opening tactical drift",
      blindspot: "You accept tactical tension before development is stable.",
      trigger: "The tactics start while pieces are still undeveloped or the king is unready.",
      rule: "Before grabbing material in the opening, ask whether the move helps your opponent develop with tempo."
    };
  }

  if (checking) {
    return {
      key: "forcing-moves",
      title: "Forcing move blindness",
      blindspot: "You are not scanning checks and direct threats early enough.",
      trigger: "The better move was a forcing check or a direct tactical threat.",
      rule: "In sharp positions, search checks first, then captures, then threats before choosing a quiet move."
    };
  }

  if (captureReflex) {
    return {
      key: "auto-capture",
      title: "Auto-capture reflex",
      blindspot: "You stop calculating after the first natural capture.",
      trigger: "The tactical miss came right after an exchange or tempting recapture.",
      rule: "After every capture, pause and list the opponent's forcing replies before you recapture automatically."
    };
  }

  if (example.tags?.includes("check")) {
    return {
      key: "king-danger",
      title: "King danger alarms",
      blindspot: "You are underestimating how quickly king exposure turns into tactics.",
      trigger: "Loose king cover or open lines create tactical punishment immediately.",
      rule: "If lines are opening near a king, switch from planning mode into pure safety and forcing-move calculation."
    };
  }

  if (hugeSwing) {
    return {
      key: "one-move-punishment",
      title: "One-move punishment",
      blindspot: "You miss short tactical punishments, not deep combinations.",
      trigger: "The position only needed one accurate forcing move to punish the mistake.",
      rule: "Assume every loose move can be punished in one move and search the immediate tactical refutation."
    };
  }

  return {
    key: "forcing-moves",
    title: "Forcing move blindness",
    blindspot: "You are not checking the opponent's most forcing reply before moving.",
    trigger: "The tactical idea appears right after a natural-looking move.",
    rule: "Use a short checks-captures-threats scan whenever the position becomes unstable."
  };
}

function averageSwing(examples: TacticalExample[]) {
  if (!examples.length) {
    return 0;
  }

  const total = examples.reduce((sum, example) => sum + (example.deltaCp ?? 0), 0);
  return Math.round(total / examples.length);
}

export async function buildTacticalOversightsModel(examples: TacticalExample[]) {
  const grouped = new Map<MotifKey, MotifSummary>();

  for (const example of examples) {
    const motif = motifForExample(example);
    const current = grouped.get(motif.key) ?? {
      ...motif,
      count: 0,
      averageSwing: 0,
      examples: []
    };
    current.count += 1;
    current.examples.push(example);
    grouped.set(motif.key, current);
  }

  const motifs = Array.from(grouped.values())
    .map((item) => ({
      ...item,
      averageSwing: averageSwing(item.examples),
      examples: item.examples.slice(0, 3)
    }))
    .sort((left, right) => right.count - left.count || right.averageSwing - left.averageSwing);

  const topMotif = motifs[0] ?? null;
  const aiBackedCount = examples.filter((example) => example.source === "ai").length;
  const openingCount = examples.filter((example) => phaseForExample(example) === "opening").length;
  const middlegameCount = examples.filter((example) => phaseForExample(example) === "middlegame").length;
  const endgameCount = examples.filter((example) => phaseForExample(example) === "endgame").length;

  const diagnosis = topMotif
    ? `You are not mainly missing long combinations. Most tactical damage comes from ${topMotif.title.toLowerCase()} and ${topMotif.blindspot.toLowerCase()}`
    : "You are losing tactical points because forcing moves are not being checked consistently enough.";

  const coachRead = topMotif
    ? [
        `Main blindspot: ${topMotif.blindspot}`,
        `Most common trigger: ${topMotif.trigger}`,
        `Primary correction rule: ${topMotif.rule}`
      ]
    : [
        "Main blindspot: the position turns tactical before your calculation does.",
        "Most common trigger: natural moves that allow one forcing reply.",
        "Primary correction rule: run checks, captures, and threats before committing."
      ];

  const recentGames = await db
    .select({
      id: games.id,
      playedAt: games.playedAt
    })
    .from(games)
    .where(eq(games.analysisStatus, "analyzed"))
    .orderBy(desc(games.playedAt), desc(games.updatedAt))
    .limit(20);

  const recentGameIds = recentGames.map((game) => game.id);
  const tacticRows = recentGameIds.length
    ? await db
        .select({
          gameId: engineReviews.gameId,
          deltaCp: engineReviews.deltaCp
        })
        .from(engineReviews)
        .where(and(inArray(engineReviews.gameId, recentGameIds), eq(engineReviews.label, "missed-tactic")))
    : [];

  const byGame = new Map<string, { count: number; averageSwing: number }>();
  for (const row of tacticRows) {
    const current = byGame.get(row.gameId) ?? { count: 0, averageSwing: 0 };
    current.count += 1;
    current.averageSwing += row.deltaCp;
    byGame.set(row.gameId, current);
  }

  const gameStats = recentGames.map((game) => {
    const current = byGame.get(game.id) ?? { count: 0, averageSwing: 0 };
    return {
      gameId: game.id,
      count: current.count,
      averageSwing: current.count ? Math.round(current.averageSwing / current.count) : 0
    };
  });

  const splitIndex = Math.max(3, Math.ceil(gameStats.length / 2));
  const recentHalf = gameStats.slice(0, splitIndex);
  const earlierHalf = gameStats.slice(splitIndex);
  const recentMisses = recentHalf.reduce((sum, game) => sum + game.count, 0);
  const earlierMisses = earlierHalf.reduce((sum, game) => sum + game.count, 0);
  const recentAvgSwing = recentHalf.length
    ? Math.round(recentHalf.reduce((sum, game) => sum + game.averageSwing, 0) / recentHalf.length)
    : 0;
  const earlierAvgSwing = earlierHalf.length
    ? Math.round(earlierHalf.reduce((sum, game) => sum + game.averageSwing, 0) / earlierHalf.length)
    : 0;

  const trendDirection =
    recentMisses < earlierMisses || (recentMisses === earlierMisses && recentAvgSwing < earlierAvgSwing)
      ? "up"
      : recentMisses > earlierMisses || recentAvgSwing > earlierAvgSwing
        ? "down"
        : "flat";

  return {
    diagnosis,
    coachRead,
    summaryStats: {
      aiBackedCount,
      averageSwing: averageSwing(examples),
      openingShare: examples.length ? openingCount / examples.length : 0,
      middlegameShare: examples.length ? middlegameCount / examples.length : 0,
      endgameShare: examples.length ? endgameCount / examples.length : 0
    },
    motifs,
    trend: {
      direction: trendDirection,
      summary:
        trendDirection === "up"
          ? "Your recent tactical misses are lighter than the earlier half of the sample."
          : trendDirection === "down"
            ? "Your recent games are still leaking too many immediate tactics."
            : "Your tactical oversight rate is mostly flat right now.",
      bullets: [
        `Earlier half vs recent half: ${earlierMisses} tactical misses -> ${recentMisses}`,
        `Average tactical swing: ${earlierAvgSwing}cp -> ${recentAvgSwing}cp`,
        `Where it hurts most: opening ${formatPercent(examples.length ? openingCount / examples.length : 0)}, middlegame ${formatPercent(examples.length ? middlegameCount / examples.length : 0)}, endgame ${formatPercent(examples.length ? endgameCount / examples.length : 0)}`
      ]
    },
    quickDrills: examples.slice(0, 3).map((example) => {
      const motif = motifForExample(example);
      return {
        title: `${motif.title} • ply ${example.ply ?? "?"}`,
        prompt:
          motif.key === "forcing-moves"
            ? "Before looking at the answer, ask: what forcing move exists here for either side?"
            : motif.key === "auto-capture"
              ? "Before recapturing, ask: what changes if the opponent gets one forcing move first?"
              : "Pause and name the tactical alarm in this position before moving.",
        rule: motif.rule,
        reviewHref: example.href,
        coachHref: example.href ? `${example.href}#review-coach` : undefined
      };
    }),
    examples: examples.map((example) => {
      const motif = motifForExample(example);
      return {
        ...example,
        motifTitle: motif.title,
        trigger: motif.trigger,
        rule: motif.rule,
        reviewHref: example.href,
        coachHref: example.href ? `${example.href}#review-coach` : undefined
      };
    })
  };
}
