import { describe, expect, it } from "vitest";

import { classifyMistake } from "@/lib/services/engine";
import { calculateNextInterval } from "@/lib/services/training-service";

describe("training helpers", () => {
  it("resets the interval on wrong answers", () => {
    expect(calculateNextInterval(8, false)).toBe(1);
  });

  it("doubles the interval on correct answers", () => {
    expect(calculateNextInterval(4, true)).toBe(8);
  });

  it("classifies opening leaks before generic labels", () => {
    expect(classifyMistake(180, ["opening"])).toBe("opening-leak");
  });

  it("classifies large tactical losses as blunders", () => {
    expect(classifyMistake(320, ["middlegame"])).toBe("blunder");
  });
});
