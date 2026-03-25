import { eq, inArray } from "drizzle-orm";

import { createProvider } from "@/lib/ai";
import { db } from "@/lib/db";
import { leakExampleNotes } from "@/lib/db/schema";
import { getAISettings } from "@/lib/services/repository";
import { nowTs } from "@/lib/utils/time";

type LeakExample = {
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
};

type ExplainedLeakExample = LeakExample & {
  explanation: string;
  whyLeak: string;
  source: "ai" | "fallback";
};

const MAX_AI_EXAMPLES_PER_REQUEST = 4;

function fallbackExplanation(leakLabel: string, example: LeakExample) {
  const swing = typeof example.deltaCp === "number" ? `${example.deltaCp} centipawns` : "material/evaluation";
  const played = example.playedMove || "the played move";
  const best = example.bestMove || "a stronger alternative";
  return {
    explanation: `In ${example.opening}, ${played} at ply ${example.ply ?? "?"} dropped roughly ${swing} compared with ${best}.`,
    whyLeak: `This is tagged as ${leakLabel.toLowerCase()} because the same type of decision is repeatedly losing objective evaluation.`
  };
}

export async function explainLeakExamples(
  leakLabel: string,
  leakKey: string,
  examples: LeakExample[],
  options?: {
    mode?: "cache-only" | "enrich";
  }
): Promise<ExplainedLeakExample[]> {
  if (!examples.length) {
    return [];
  }

  const aiSettings = await getAISettings();
  const provider = createProvider({
    provider: aiSettings.provider,
    model: aiSettings.model,
    apiKey: aiSettings.apiKey
  });
  const aiInputs = examples
    .filter(
      (example) =>
        typeof example.ply === "number" &&
        typeof example.deltaCp === "number" &&
        typeof example.playedMove === "string" &&
        typeof example.bestMove === "string" &&
        typeof example.label === "string"
    )
    .map((example) => ({
      exampleId: `${example.gameId}:${example.ply}`,
      opening: example.opening,
      ply: example.ply as number,
      playedMove: example.playedMove as string,
      bestMove: example.bestMove as string,
      deltaCp: example.deltaCp as number,
      label: example.label as string
    }));

  const aiMap = new Map<string, { explanation: string; whyLeak: string }>();
  if (aiInputs.length > 0) {
    const ids = aiInputs.map((item) => item.exampleId);
    const cached = await db
      .select()
      .from(leakExampleNotes)
      .where(inArray(leakExampleNotes.id, ids));

    for (const row of cached) {
      aiMap.set(row.id, {
        explanation: row.explanation,
        whyLeak: row.whyLeak
      });
    }

    const missing = aiInputs.filter((item) => !aiMap.has(item.exampleId)).slice(0, MAX_AI_EXAMPLES_PER_REQUEST);

    if (
      options?.mode === "enrich" &&
      missing.length > 0 &&
      aiSettings.provider === "openai" &&
      aiSettings.apiKey
    ) {
      try {
        const explanations = await provider.generateLeakExplanations({
          leakLabel,
          examples: missing
        });

        for (const item of explanations) {
          const existing = await db
            .select()
            .from(leakExampleNotes)
            .where(eq(leakExampleNotes.id, item.exampleId))
            .limit(1);

          const [gameId, plyValue] = item.exampleId.split(":");
          const ply = Number.parseInt(plyValue, 10);
          if (existing[0]) {
            await db
              .update(leakExampleNotes)
              .set({
                provider: aiSettings.provider,
                model: aiSettings.model,
                explanation: item.explanation,
                whyLeak: item.whyLeak,
                updatedAt: nowTs()
              })
              .where(eq(leakExampleNotes.id, existing[0].id));
          } else if (gameId && Number.isFinite(ply)) {
            await db.insert(leakExampleNotes).values({
              id: item.exampleId,
              leakKey,
              gameId,
              ply,
              provider: aiSettings.provider,
              model: aiSettings.model,
              explanation: item.explanation,
              whyLeak: item.whyLeak,
              updatedAt: nowTs()
            });
          }

          aiMap.set(item.exampleId, {
            explanation: item.explanation,
            whyLeak: item.whyLeak
          });
        }
      } catch {
        // Keep graceful fallback below.
      }
    }
  }

  return examples.map((example) => {
    const key = `${example.gameId}:${example.ply ?? "n/a"}`;
    const ai = aiMap.get(key);
    if (ai) {
      return {
        ...example,
        explanation: ai.explanation,
        whyLeak: ai.whyLeak,
        source: "ai"
      };
    }

    const fallback = fallbackExplanation(leakLabel, example);
    return {
      ...example,
      explanation: fallback.explanation,
      whyLeak: fallback.whyLeak,
      source: "fallback"
    };
  });
}
