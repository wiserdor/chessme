import { getRecentGamesForPortfolioReview } from "@/lib/services/repository";

type BlindspotKey =
  | "tactical-awareness"
  | "opening-discipline"
  | "endgame-technique"
  | "safety-check"
  | "plan-stability";

type CriticalMoment = {
  gameId: string;
  opening: string;
  playedAt: string | null;
  ply: number;
  label: string;
  deltaCp: number;
  playedMove: string;
  bestMove: string;
  blindspot: BlindspotKey;
  href: string;
};

type BlindspotCard = {
  key: BlindspotKey;
  label: string;
  count: number;
  averageSwing: number;
  rule: string;
  whyItHurts: string;
  href: string;
  examples: Array<{
    label: string;
    href: string;
  }>;
};

export type CoachLabSnapshot = {
  sampleSize: number;
  criticalMoments: CriticalMoment[];
  blindspots: BlindspotCard[];
  reminders: string[];
  focusOfWeek: {
    label: string;
    rule: string;
    whyItHurts: string;
    href: string;
  } | null;
};

function leakHrefForBlindspot(key: BlindspotKey) {
  switch (key) {
    case "tactical-awareness":
      return "/leaks/tactical-oversights";
    case "opening-discipline":
      return "/leaks/opening-leaks";
    case "endgame-technique":
      return "/leaks/endgame-conversion";
    case "safety-check":
      return "/leaks/large-blunders";
    default:
      return "/leaks/decision-drift";
  }
}

function blindspotForMistake(label: string, tags: string[]): BlindspotKey {
  if (label === "opening-leak" || tags.includes("opening")) {
    return "opening-discipline";
  }

  if (label === "endgame-error" || tags.includes("endgame")) {
    return "endgame-technique";
  }

  if (label === "missed-tactic" || tags.includes("capture") || tags.includes("check")) {
    return "tactical-awareness";
  }

  if (label === "blunder") {
    return "safety-check";
  }

  return "plan-stability";
}

function blindspotMeta(key: BlindspotKey) {
  switch (key) {
    case "tactical-awareness":
      return {
        label: "Tactical awareness",
        rule: "Before every critical move, scan checks, captures, and threats for both sides.",
        whyItHurts: "You are missing forcing ideas, so playable positions turn sharply against you."
      };
    case "opening-discipline":
      return {
        label: "Opening discipline",
        rule: "In the first 10 moves, prioritize development, king safety, and central control over side ideas.",
        whyItHurts: "You are leaking evaluation before the middlegame even starts."
      };
    case "endgame-technique":
      return {
        label: "Endgame technique",
        rule: "In simplified positions, improve king activity first and only then calculate pawn play.",
        whyItHurts: "You are giving back winning or defensible endgames through technical drift."
      };
    case "safety-check":
      return {
        label: "Safety check",
        rule: "Before you move, ask what becomes loose, hanging, or tactically vulnerable after the move.",
        whyItHurts: "Single-move oversights are causing the largest rating damage in your sample."
      };
    default:
      return {
        label: "Plan stability",
        rule: "Name two candidate moves and compare plans before choosing one.",
        whyItHurts: "Your decisions are drifting when the position is not forcing enough to guide you."
      };
  }
}

function formatPlayedAt(value: string | null) {
  if (!value) {
    return "Unknown time";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
}

export async function loadCoachLab(limit = 20): Promise<CoachLabSnapshot> {
  const recent = await getRecentGamesForPortfolioReview(limit);
  const moments: CriticalMoment[] = [];

  for (const game of recent.games) {
    for (const mistake of game.topMistakes) {
      moments.push({
        gameId: game.id,
        opening: game.opening,
        playedAt: game.playedAt,
        ply: mistake.ply,
        label: mistake.label,
        deltaCp: mistake.deltaCp,
        playedMove: mistake.playedMove,
        bestMove: mistake.bestMove,
        blindspot: blindspotForMistake(mistake.label, mistake.tags),
        href: `/games/${game.id}?ply=${mistake.ply}#replay`
      });
    }
  }

  const criticalMoments = moments.sort((left, right) => right.deltaCp - left.deltaCp).slice(0, 10);
  const blindspotBuckets = new Map<
    BlindspotKey,
    {
      count: number;
      totalSwing: number;
      examples: Array<{
        label: string;
        href: string;
      }>;
    }
  >();

  for (const moment of moments) {
    const bucket = blindspotBuckets.get(moment.blindspot) ?? {
      count: 0,
      totalSwing: 0,
      examples: []
    };
    bucket.count += 1;
      bucket.totalSwing += moment.deltaCp;
      if (bucket.examples.length < 3) {
        bucket.examples.push({
          label: `${moment.opening} • ply ${moment.ply} • ${moment.deltaCp}cp`,
          href: moment.href
        });
      }
      blindspotBuckets.set(moment.blindspot, bucket);
    }

  const blindspots = Array.from(blindspotBuckets.entries())
    .map(([key, bucket]) => {
      const meta = blindspotMeta(key);
      return {
        key,
        label: meta.label,
        count: bucket.count,
        averageSwing: Math.round(bucket.totalSwing / bucket.count),
        rule: meta.rule,
        whyItHurts: meta.whyItHurts,
        href: leakHrefForBlindspot(key),
        examples: bucket.examples
      };
    })
    .sort((left, right) => right.count * right.averageSwing - left.count * left.averageSwing);

  const reminders = blindspots.slice(0, 3).map((blindspot, index) => {
    const prefix = ["Reminder 1", "Reminder 2", "Reminder 3"][index] ?? `Reminder ${index + 1}`;
    return `${prefix}: ${blindspot.rule}`;
  });

  const focus = blindspots[0]
    ? {
        label: blindspots[0].label,
        rule: blindspots[0].rule,
        whyItHurts: blindspots[0].whyItHurts,
        href: blindspots[0].href
      }
    : null;

  return {
    sampleSize: recent.sampleSize,
    criticalMoments: criticalMoments.map((moment) => ({
      ...moment,
      opening: `${moment.opening} • ${formatPlayedAt(moment.playedAt)}`
    })),
    blindspots,
    reminders,
    focusOfWeek: focus
  };
}
