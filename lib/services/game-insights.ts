type ReviewRow = {
  ply: number;
  playedMove: string;
  bestMove: string;
  deltaCp: number;
  label: string;
  tags: string[];
};

type PositionRow = {
  ply: number;
  tags: string[];
};

type GameDetailInput = {
  game: {
    opening: string | null;
    result: string;
  };
  resultLabel?: string;
  positions: PositionRow[];
  engineReviews: ReviewRow[];
  review: {
    actionItems: string[];
  } | null;
};

export type GameInsightBundle = {
  wentWrong: Array<{
    title: string;
    detail: string;
    ply?: number;
  }>;
  wentRight: string[];
  nextThink: string[];
  extraIdeas: string[];
  analyzedLeaks: Array<{
    key: string;
    label: string;
    count: number;
    focus: string;
  }>;
  primaryLeakKey?: string;
};

const labelToLeakKey: Record<string, string> = {
  "opening-leak": "opening-leaks",
  "endgame-error": "endgame-conversion",
  "missed-tactic": "tactical-oversights",
  blunder: "large-blunders",
  mistake: "decision-drift",
  inaccuracy: "decision-drift"
};

const leakKeyToLabel: Record<string, string> = {
  "opening-leaks": "Opening leaks",
  "endgame-conversion": "Endgame conversion",
  "tactical-oversights": "Tactical oversights",
  "large-blunders": "Large blunders",
  "decision-drift": "Decision drift"
};

const leakKeyToFocus: Record<string, string> = {
  "opening-leaks": "Stabilize first 10 moves with safer structure and development priorities.",
  "endgame-conversion": "Simplify winning positions and activate the king earlier.",
  "tactical-oversights": "Run checks-captures-threats scan before each critical move.",
  "large-blunders": "Add a final blunder check in sharp positions and time pressure.",
  "decision-drift": "Compare two candidates before committing and align with a clear plan."
};

function phaseFromTags(tags: string[]) {
  if (tags.includes("opening")) {
    return "opening";
  }

  if (tags.includes("endgame")) {
    return "endgame";
  }

  return "middlegame";
}

function thinkPromptForLabel(label: string) {
  switch (label) {
    case "opening-leak":
      return "Before moving in the opening, ask: am I improving development and king safety?";
    case "missed-tactic":
      return "Scan checks, captures, and threats for both sides before committing.";
    case "blunder":
      return "Run a final blunder check: what changed after my move and what is hanging?";
    case "endgame-error":
      return "In endgames, ask which king move improves conversion or defense immediately.";
    default:
      return "Name two candidate moves, then compare plans before picking one.";
  }
}

function topUniqueByLabel(reviews: ReviewRow[]) {
  const seen = new Set<string>();
  const prompts: string[] = [];

  for (const review of reviews) {
    if (seen.has(review.label)) {
      continue;
    }

    seen.add(review.label);
    prompts.push(thinkPromptForLabel(review.label));
    if (prompts.length >= 3) {
      break;
    }
  }

  return prompts;
}

export function buildGameInsights(input: GameDetailInput): GameInsightBundle {
  const reviews = [...input.engineReviews].sort((left, right) => right.deltaCp - left.deltaCp);
  const topMistakes = reviews.slice(0, 3);
  const severe = reviews.filter((review) => review.deltaCp >= 150);

  const wentWrong =
    topMistakes.length > 0
      ? topMistakes.map((review) => {
          const phase = phaseFromTags(review.tags);
          return {
            title: `Ply ${review.ply} (${phase})`,
            detail: `${review.playedMove} missed ${review.bestMove} with a swing of about ${review.deltaCp} centipawns.`,
            ply: review.ply
          };
        })
      : [
          {
            title: "No large swings found",
            detail: "No major mistakes were detected in the sampled positions."
          }
        ];

  const phaseStats = {
    opening: { total: 0, severe: 0 },
    middlegame: { total: 0, severe: 0 },
    endgame: { total: 0, severe: 0 }
  };

  for (const position of input.positions) {
    const phase = phaseFromTags(position.tags) as keyof typeof phaseStats;
    phaseStats[phase].total += 1;
  }

  for (const review of severe) {
    const phase = phaseFromTags(review.tags) as keyof typeof phaseStats;
    phaseStats[phase].severe += 1;
  }

  const wentRight: string[] = [];
  const orderedPhases: Array<keyof typeof phaseStats> = ["opening", "middlegame", "endgame"];
  for (const phase of orderedPhases) {
    const stats = phaseStats[phase];
    if (!stats.total) {
      continue;
    }

    const severeRate = stats.severe / stats.total;
    if (severeRate <= 0.12) {
      wentRight.push(`Your ${phase} phase was relatively stable with limited large mistakes.`);
    }
  }

  if (!wentRight.length) {
    wentRight.push("You still created playable positions despite mistakes, which is a good recovery signal.");
  }

  if (input.resultLabel?.toLowerCase() === "win") {
    wentRight.push("You converted enough critical moments to secure a win, which is worth preserving.");
  }

  const nextThink = topUniqueByLabel(reviews);
  if (nextThink.length < 3) {
    nextThink.push("After every opponent move, ask what changed before calculating your own plan.");
  }

  const primaryLabel = topMistakes[0]?.label;
  const primaryLeakKey = primaryLabel ? labelToLeakKey[primaryLabel] : undefined;
  const leakCounts = new Map<string, number>();
  for (const review of reviews) {
    const key = labelToLeakKey[review.label];
    if (!key) {
      continue;
    }
    leakCounts.set(key, (leakCounts.get(key) ?? 0) + 1);
  }

  const analyzedLeaks = Array.from(leakCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([key, count]) => ({
      key,
      label: leakKeyToLabel[key] ?? key,
      count,
      focus: leakKeyToFocus[key] ?? "Apply a consistent correction rule and drill it this week."
    }));
  const extraIdeas: string[] = [];
  if (primaryLeakKey) {
    extraIdeas.push(`Open /leaks/${primaryLeakKey} and run a 15-minute focused coach session.`);
  }

  const criticalPlys = topMistakes.map((review) => review.ply).slice(0, 2);
  if (criticalPlys.length) {
    extraIdeas.push(`Replay critical plies ${criticalPlys.join(", ")} and explain the best move in your own words.`);
  }

  extraIdeas.push("Before your next rated game, complete 3 drills from this game's recurring pattern.");

  for (const actionItem of input.review?.actionItems ?? []) {
    if (extraIdeas.length >= 4) {
      break;
    }
    extraIdeas.push(actionItem);
  }

  return {
    wentWrong,
    wentRight: wentRight.slice(0, 3),
    nextThink: nextThink.slice(0, 4),
    extraIdeas: extraIdeas.slice(0, 4),
    analyzedLeaks,
    primaryLeakKey
  };
}
