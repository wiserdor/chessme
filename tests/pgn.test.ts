import { describe, expect, it } from "vitest";

import { extractPositions, splitPgnBundle } from "@/lib/services/pgn";

const SAMPLE_PGN = `
[Event "Live Chess"]
[Site "https://www.chess.com/game/live/1"]
[Date "2025.02.03"]
[White "player"]
[Black "opponent"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0
`.trim();

describe("PGN helpers", () => {
  it("splits a PGN bundle into separate games", () => {
    const games = splitPgnBundle(`${SAMPLE_PGN}\n\n${SAMPLE_PGN}`);
    expect(games).toHaveLength(2);
  });

  it("extracts move positions from a PGN", () => {
    const positions = extractPositions(SAMPLE_PGN);
    expect(positions).toHaveLength(6);
    expect(positions[0]?.san).toBe("e4");
    expect(positions[0]?.tags).toContain("opening");
  });
});
