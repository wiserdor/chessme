type LeakPlaybook = {
  title: string;
  bestPractices: string[];
  dos: string[];
  donts: string[];
  coachNotes: string[];
  trainingFocus: string[];
};

const PLAYBOOKS: Record<string, LeakPlaybook> = {
  "opening-leaks": {
    title: "Opening leaks",
    bestPractices: [
      "Use one reliable setup per side before expanding your repertoire.",
      "Review your first 10 moves for development, king safety, and center control.",
      "Stop memorizing long lines without understanding the resulting plans."
    ],
    dos: [
      "Do compare your move against one engine-approved alternative each opening phase.",
      "Do keep a short opening notebook with recurring mistakes and fixes.",
      "Do prioritize positions you actually get in your own games."
    ],
    donts: [
      "Don't switch openings every week after one bad result.",
      "Don't grab pawns early if it delays king safety and development.",
      "Don't continue a line if you no longer know the plan."
    ],
    coachNotes: [
      "Your opening goal is playable middlegames, not perfect memorization.",
      "Use structure and plans as anchors, then memorize only the critical tactical branches."
    ],
    trainingFocus: [
      "Run drills from your worst opening positions first.",
      "Set a pregame rule: no risky pawn grabs before castling."
    ]
  },
  "endgame-conversion": {
    title: "Endgame conversion",
    bestPractices: [
      "Trade into winning endgames only when your king activity improves.",
      "Convert with technique: activate king, improve worst piece, create passed pawn.",
      "Use simple plans and avoid unnecessary tactical complications."
    ],
    dos: [
      "Do calculate forcing lines first when queens are off.",
      "Do centralize your king early in reduced-material positions.",
      "Do practice fundamental king-and-pawn and rook endgames repeatedly."
    ],
    donts: [
      "Don't rush pawn pushes that create new weaknesses.",
      "Don't allow perpetual checks when a safer winning path exists.",
      "Don't ignore opposition and zugzwang motifs."
    ],
    coachNotes: [
      "Most lost wins come from impatience. Slow down once you're better.",
      "If the position is winning, choose the line with the smallest counterplay."
    ],
    trainingFocus: [
      "Prioritize drills tagged endgame or conversion.",
      "After each missed win, replay with a three-step conversion plan."
    ]
  },
  "tactical-oversights": {
    title: "Tactical oversights",
    bestPractices: [
      "Before every move, scan checks, captures, and threats for both sides.",
      "Treat unstable kings and loose pieces as tactical alarms.",
      "When in doubt, spend extra time in forcing sequences."
    ],
    dos: [
      "Do run a two-ply blunder scan before committing.",
      "Do look for opponent tactical resources after your intended move.",
      "Do solve short tactical sets before rated play."
    ],
    donts: [
      "Don't auto-recapture without checking intermediate moves.",
      "Don't assume forcing lines end after one move.",
      "Don't ignore back-rank and overloaded-piece motifs."
    ],
    coachNotes: [
      "Your tactical ceiling grows from consistent process, not occasional brilliance.",
      "Blunder checks under time pressure are worth more than deep strategic plans."
    ],
    trainingFocus: [
      "Start each session with 10 tactical oversights drills from your games.",
      "Track motif repetition and reinforce the worst two motifs weekly."
    ]
  },
  "large-blunders": {
    title: "Large blunders",
    bestPractices: [
      "Use a final safety check before every move in sharp positions.",
      "Stabilize first when you are already better; avoid unnecessary risks.",
      "Prefer moves that reduce your opponent's tactical opportunities."
    ],
    dos: [
      "Do ask: what is my opponent threatening right now?",
      "Do simplify when your position is clearly better.",
      "Do keep time for critical moments by moving faster in easy positions."
    ],
    donts: [
      "Don't play forcing moves automatically without verification.",
      "Don't enter tactical chaos with undeveloped pieces.",
      "Don't burn time early and then blitz in decisive positions."
    ],
    coachNotes: [
      "Most blunders are attention errors, not knowledge errors.",
      "Build a repeatable pre-move checklist and never skip it in tactical positions."
    ],
    trainingFocus: [
      "Drill your largest eval swings first.",
      "Re-solve failed blunder cards after 24 hours."
    ]
  },
  "decision-drift": {
    title: "Decision drift",
    bestPractices: [
      "Generate two candidate moves, then compare plans before choosing.",
      "Tie each move to a clear objective: improve piece, attack weakness, or defend threat.",
      "Re-evaluate after every major exchange to avoid autopilot."
    ],
    dos: [
      "Do keep your move selection process consistent across all phases.",
      "Do identify the worst-placed piece before searching tactical ideas.",
      "Do use short postgame reviews to catch repeated decision patterns."
    ],
    donts: [
      "Don't make plan changes every move without reason.",
      "Don't play only by feeling when the position requires concrete calculation.",
      "Don't ignore opponent plans while pursuing your own."
    ],
    coachNotes: [
      "Consistency in thought process is your biggest rating accelerator.",
      "When you feel uncertain, choose the line with clearer plans and fewer tactical liabilities."
    ],
    trainingFocus: [
      "Work through mixed drills and explain your plan before each move.",
      "Review one lost game daily and write one corrected decision rule."
    ]
  }
};

function toTitleFromKey(key: string) {
  return key
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getLeakPlaybook(key: string, fallbackTitle?: string): LeakPlaybook {
  const playbook = PLAYBOOKS[key];
  if (playbook) {
    return playbook;
  }

  const title = fallbackTitle || toTitleFromKey(key);
  return {
    title,
    bestPractices: [
      "Review recurring examples and isolate one repeatable correction rule.",
      "Convert that rule into short daily drills from your own games.",
      "Track this leak weekly and adjust focus by recent mistakes."
    ],
    dos: [
      "Do keep your correction rule short and practical.",
      "Do revisit solved examples after 24-48 hours.",
      "Do prioritize training positions that match recent losses."
    ],
    donts: [
      "Don't chase too many leak types in the same session.",
      "Don't skip postgame review after painful losses.",
      "Don't ignore recurring patterns just because the game result was good."
    ],
    coachNotes: [
      "Treat this as a process leak, not a one-off mistake.",
      "Small consistent corrections beat occasional deep study marathons."
    ],
    trainingFocus: [
      "Train this leak first in each daily session.",
      "Use focused review blocks on your most recent examples."
    ]
  };
}
