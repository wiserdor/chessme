import { describe, expect, it } from "vitest";

import {
  buildDerivedTags,
  buildNoteHref,
  buildNoteTitle,
  dedupeTags,
  scoreNoteForGameContext
} from "@/lib/services/notes";

describe("note helpers", () => {
  it("builds derived tags from contextual note data", () => {
    expect(
      buildDerivedTags({
        anchorType: "move",
        gameId: "game_1",
        ply: 18,
        fen: "fen",
        opening: "Sicilian Defense",
        leakKey: "tactical-oversights",
        focusArea: "Focus of week",
        coachMessageContext: "game-coach"
      })
    ).toEqual(
      expect.arrayContaining([
        "move",
        "game-linked",
        "move-linked",
        "ply:18",
        "has-position",
        "opening:sicilian-defense",
        "leak:tactical-oversights",
        "focus:focus-of-week",
        "coach:game-coach"
      ])
    );
  });

  it("generates an automatic title when title is blank", () => {
    expect(
      buildNoteTitle({
        title: "",
        body: "Castle before you grab the pawn in this structure.",
        anchorType: "opening",
        opening: "French Defense"
      })
    ).toBe("Castle before you grab the pawn in this structure.");
  });

  it("builds deterministic deep links for move notes", () => {
    expect(
      buildNoteHref({
        anchorType: "move",
        sourcePath: "/games/game_1",
        gameId: "game_1",
        ply: 24,
        leakKey: null
      })
    ).toBe("/games/game_1?ply=24#replay");
  });

  it("dedupes and normalizes manual tags", () => {
    expect(dedupeTags(["  Tactics ", "tactics", " endgame "])).toEqual(["tactics", "endgame"]);
  });

  it("prefers exact game and ply matches for coach note ranking", () => {
    const exact = scoreNoteForGameContext(
      {
        gameId: "game_1",
        ply: 18,
        opening: "Sicilian Defense",
        leakKey: "tactical-oversights",
        focusArea: null
      },
      {
        gameId: "game_1",
        focusPly: 18,
        opening: "Sicilian Defense",
        leakKeys: ["tactical-oversights"]
      }
    );

    const openingOnly = scoreNoteForGameContext(
      {
        gameId: null,
        ply: null,
        opening: "Sicilian Defense",
        leakKey: null,
        focusArea: null
      },
      {
        gameId: "game_1",
        focusPly: 18,
        opening: "Sicilian Defense",
        leakKeys: ["tactical-oversights"]
      }
    );

    expect(exact).toBeGreaterThan(openingOnly);
  });
});
