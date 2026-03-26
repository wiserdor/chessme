import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { Chess } from "chess.js";

import { EngineReview, MistakeLabel, PositionSnapshot } from "@/lib/types";

type StockfishMessageTarget = {
  postMessage: (message: string) => void;
  onmessage: ((event: { data: string }) => void) | null;
};

const nodeRequire = createRequire(import.meta.url);

const PIECE_VALUES: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0
};

export function classifyMistake(deltaCp: number, tags: string[]): MistakeLabel {
  if (tags.includes("opening") && deltaCp >= 140) {
    return "opening-leak";
  }

  if (tags.includes("endgame") && deltaCp >= 160) {
    return "endgame-error";
  }

  if (tags.includes("capture") && deltaCp >= 220) {
    return "missed-tactic";
  }

  if (deltaCp >= 300) {
    return "blunder";
  }

  if (deltaCp >= 150) {
    return "mistake";
  }

  return "inaccuracy";
}

function simpleEvaluateFen(fen: string): number {
  const [board] = fen.split(" ");
  let score = 0;

  for (const char of board) {
    if (char === "/") {
      continue;
    }

    if (/\d/.test(char)) {
      continue;
    }

    const lower = char.toLowerCase();
    const value = PIECE_VALUES[lower] ?? 0;
    score += char === lower ? -value : value;
  }

  return score;
}

async function createStockfishEngine(): Promise<StockfishMessageTarget | null> {
  if (process.env.ENABLE_STOCKFISH === "false") {
    return null;
  }

  try {
    const stockfishDir = path.resolve(process.cwd(), "node_modules", "stockfish", "src");
    if (!fs.existsSync(stockfishDir)) {
      return null;
    }

    const candidates = [
      () => nodeRequire("stockfish/src/stockfish-17.1-lite-single-03e3232.js"),
      () => nodeRequire("stockfish/src/stockfish-17.1-lite-51f59da.js"),
      () => nodeRequire("stockfish/src/stockfish-17.1-single-a496a04.js"),
      () => nodeRequire("stockfish/src/stockfish-17.1-8e4d048.js")
    ];

    for (const loadCandidate of candidates) {
      try {
        const imported: any = loadCandidate();
        const factory =
          typeof imported.default === "function"
            ? imported.default
            : typeof imported === "function"
              ? imported
              : null;

        if (factory) {
          return factory() as StockfishMessageTarget;
        }
      } catch {
        continue;
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function analyzeFenWithStockfish(fen: string): Promise<{ bestMove: string; evaluation: number } | null> {
  const engine = await createStockfishEngine();
  if (!engine) {
    return null;
  }

  return new Promise((resolve) => {
    let bestMove = "";
    let evaluation = 0;
    const timeout = setTimeout(() => resolve(null), 3000);

    engine.onmessage = (event) => {
      const line = event.data;
      if (line.startsWith("info depth") && line.includes(" score cp ")) {
        const match = line.match(/score cp (-?\d+)/);
        if (match) {
          evaluation = Number(match[1]);
        }
      }

      if (line.startsWith("bestmove")) {
        clearTimeout(timeout);
        bestMove = line.split(" ")[1] ?? "";
        resolve({
          bestMove,
          evaluation
        });
      }
    };

    engine.postMessage("uci");
    engine.postMessage(`position fen ${fen}`);
    engine.postMessage("go depth 10");
  });
}

async function evaluateFen(fen: string): Promise<{ bestMove: string; evaluation: number }> {
  const stockfishResult = await analyzeFenWithStockfish(fen);
  if (stockfishResult) {
    return stockfishResult;
  }

  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });
  const firstMove = moves[0];
  const fallbackMove =
    firstMove?.lan ??
    (firstMove?.from && firstMove?.to ? `${firstMove.from}${firstMove.to}` : undefined) ??
    "0000";

  return {
    bestMove: fallbackMove,
    evaluation: simpleEvaluateFen(fen)
  };
}

export async function analyzePositions(positions: PositionSnapshot[]): Promise<EngineReview[]> {
  const sampled = positions.filter((position, index) => {
    if (index < 10) {
      return true;
    }

    return position.tags.includes("capture") || position.tags.includes("check") || index % 4 === 0;
  });

  const reviews: EngineReview[] = [];

  for (const position of sampled) {
    const current = await evaluateFen(position.fenBefore);
    const after = await evaluateFen(position.fenAfter);
    const deltaCp = Math.max(0, Math.abs(current.evaluation - after.evaluation));
    const label = classifyMistake(deltaCp, position.tags);

    if (deltaCp < 60) {
      continue;
    }

    reviews.push({
      ply: position.ply,
      fen: position.fenBefore,
      playedMove: position.san,
      bestMove: current.bestMove,
      evaluationCp: after.evaluation,
      bestLineCp: current.evaluation,
      deltaCp,
      label,
      tags: position.tags
    });
  }

  return reviews.sort((left, right) => right.deltaCp - left.deltaCp);
}
