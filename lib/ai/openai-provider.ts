import OpenAI from "openai";
import { z } from "zod";

import {
  GameCoachChatInput,
  criticalMomentLearningSchema,
  GameAIInsights,
  LeakExampleExplanation,
  LeakExamplePromptInput,
  LLMProvider,
  PortfolioReviewInput,
  portfolioReviewSchema,
  ReviewPromptInput,
  TrainingPromptInput,
  reviewNarrativeSchema,
  trainingCardSchema
} from "@/lib/ai/provider";
import { CriticalMomentLearning, PortfolioReview, ReviewNarrative, TrainingCardPayload } from "@/lib/types";

const leakExampleSchema = z.object({
  explanations: z.array(
    z.object({
      exampleId: z.string(),
      explanation: z.string(),
      whyLeak: z.string()
    })
  )
});

const trainingCardsSchema = z.object({
  cards: z.array(trainingCardSchema)
});

const batchedReviewsSchema = z.object({
  reviews: z.array(z.unknown())
});

const criticalMomentArraySchema = z.array(criticalMomentLearningSchema);

function extractJsonString(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("OpenAI returned an empty response.");
  }

  if (trimmed.startsWith("```")) {
    const fenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    if (fenced.trim()) {
      return fenced.trim();
    }
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  throw new Error("OpenAI did not return valid JSON.");
}

function parseLooseJson(text: string): unknown {
  return JSON.parse(extractJsonString(text));
}

function fallbackReviewNotes(input: ReviewPromptInput): string[] {
  const first = input.mistakes[0];
  const second = input.mistakes[1];
  return [
    first
      ? `Review ply ${first.ply}: compare ${first.playedMove} with ${first.bestMove} and explain the difference before moving.`
      : "Review the biggest evaluation swing and compare your move with the engine move.",
    second
      ? `Pay extra attention to ${second.label} spots and slow down when forcing moves appear.`
      : "When the position turns tactical, scan checks, captures, and threats before committing."
  ];
}

function fallbackReviewActions(input: ReviewPromptInput): string[] {
  const first = input.mistakes[0];
  return [
    first
      ? `Replay ply ${first.ply} and say out loud why ${first.bestMove} was stronger than ${first.playedMove}.`
      : "Replay the biggest engine swing from this game.",
    `Train 3 short drills related to ${input.mistakes[0]?.label ?? "your main recurring mistake"} before your next game.`
  ];
}

function normalizeReviewNarrative(raw: unknown, input: ReviewPromptInput): ReviewNarrative {
  const candidate = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const summary =
    typeof candidate.summary === "string" && candidate.summary.trim()
      ? candidate.summary.trim()
      : `Engine review for ${input.opening}: your biggest mistakes came from ${input.mistakes
          .slice(0, 2)
          .map((mistake) => `${mistake.playedMove} instead of ${mistake.bestMove}`)
          .join(", ")}.`;

  const coachingNotes = Array.isArray(candidate.coachingNotes)
    ? candidate.coachingNotes.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  const actionItems = Array.isArray(candidate.actionItems)
    ? candidate.actionItems.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  const confidence =
    typeof candidate.confidence === "number"
      ? Math.min(1, Math.max(0, candidate.confidence))
      : 0.55;

  return reviewNarrativeSchema.parse({
    summary,
    coachingNotes: coachingNotes.length ? coachingNotes : fallbackReviewNotes(input),
    actionItems: actionItems.length ? actionItems : fallbackReviewActions(input),
    confidence
  });
}

function fallbackCriticalMoments(input: ReviewPromptInput): CriticalMomentLearning[] {
  return input.mistakes.slice(0, 4).map((mistake) => ({
    ply: mistake.ply,
    label: mistake.label,
    whatHappened: `${mistake.playedMove} missed ${mistake.bestMove} and dropped about ${mistake.deltaCp} centipawns.`,
    whyItMatters:
      mistake.label === "missed-tactic"
        ? "Forcing tactical moments swing the game quickly, so one missed idea can erase a good position."
        : "This was a decision point where the position demanded a more accurate plan than the move played.",
    whatToThink:
      mistake.label === "opening-leak"
        ? "Ask whether your move improves development, king safety, or central control before making it."
        : "Before moving, compare your idea with checks, captures, threats, and the opponent's most forcing reply.",
    trainingFocus: `Replay ply ${mistake.ply} and explain why ${mistake.bestMove} was stronger than ${mistake.playedMove}.`,
    confidence: 0.56
  }));
}

function normalizeCriticalMoments(raw: unknown, input: ReviewPromptInput): CriticalMomentLearning[] {
  const validPlys = new Set(input.mistakes.map((mistake) => mistake.ply));
  const parsed = Array.isArray(raw) ? raw : [];
  const normalized = parsed
    .map((item) => {
      const candidate = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const ply = typeof candidate.ply === "number" ? candidate.ply : null;
      if (ply === null || !validPlys.has(ply)) {
        return null;
      }

      return {
        ply,
        label: typeof candidate.label === "string" && candidate.label.trim() ? candidate.label.trim() : "critical-moment",
        whatHappened:
          typeof candidate.whatHappened === "string" && candidate.whatHappened.trim()
            ? candidate.whatHappened.trim()
            : `This move was one of the largest swings in the game.`,
        whyItMatters:
          typeof candidate.whyItMatters === "string" && candidate.whyItMatters.trim()
            ? candidate.whyItMatters.trim()
            : "This moment changed the evaluation and should become part of your review routine.",
        whatToThink:
          typeof candidate.whatToThink === "string" && candidate.whatToThink.trim()
            ? candidate.whatToThink.trim()
            : "Pause and ask what your opponent's best forcing reply is before committing.",
        trainingFocus:
          typeof candidate.trainingFocus === "string" && candidate.trainingFocus.trim()
            ? candidate.trainingFocus.trim()
            : `Revisit this position and say why the best move was stronger.`,
        confidence:
          typeof candidate.confidence === "number" ? Math.min(1, Math.max(0, candidate.confidence)) : 0.55
      };
    })
    .filter((item): item is CriticalMomentLearning => Boolean(item));

  const ensured = normalized.length ? normalized : fallbackCriticalMoments(input);
  return criticalMomentArraySchema.parse(ensured);
}

function normalizePortfolioReview(raw: unknown, input: PortfolioReviewInput): PortfolioReview {
  const candidate = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const asStringArray = (value: unknown, fallback: string[]) => {
    if (!Array.isArray(value)) {
      return fallback;
    }

    const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    return items.length ? items : fallback;
  };

  return portfolioReviewSchema.parse({
    summary:
      typeof candidate.summary === "string" && candidate.summary.trim()
        ? candidate.summary.trim()
        : `Review of your last ${input.sampleSize} games shows repeated evaluation swings around ${input.leakLabels[0]?.label ?? "decision-making"}.`,
    styleProfile: asStringArray(candidate.styleProfile, [
      "You aim for active, practical positions rather than sterile equality.",
      "Your style becomes less stable when the position turns forcing or tactical."
    ]),
    strengths: asStringArray(candidate.strengths, [
      "You repeatedly reach playable positions from familiar structures.",
      "You keep enough activity to stay in games after smaller mistakes."
    ]),
    recurringLeaks: asStringArray(candidate.recurringLeaks, [
      `${input.leakLabels[0]?.label ?? "Decision drift"} is the most repeated leak in the sample.`,
      "Large swings suggest your final blunder-check routine is not consistent enough yet."
    ]),
    improvementPriorities: asStringArray(candidate.improvementPriorities, [
      "Reduce one recurring leak first instead of trying to fix every phase at once.",
      "Review the first major swing from each recent game and explain the missed idea in plain words."
    ]),
    trainingPlan: asStringArray(candidate.trainingPlan, [
      "Do a short checks-captures-threats scan before every critical move.",
      "Train from your own lost positions before starting new rated sessions."
    ]),
    confidence:
      typeof candidate.confidence === "number"
        ? Math.min(1, Math.max(0, candidate.confidence))
        : 0.6
  });
}

export class OpenAIProvider implements LLMProvider {
  name = "openai" as const;
  model: string;
  private readonly client: OpenAI;

  constructor(model: string, apiKey: string) {
    this.model = model;
    this.client = new OpenAI({
      apiKey
    });
  }

  async generateStructuredReview(input: ReviewPromptInput): Promise<GameAIInsights> {
    const reviews = await this.generateStructuredReviews([input]);
    const review = reviews[0];
    if (!review) {
      throw new Error("OpenAI did not return a structured review.");
    }
    return review;
  }

  async generateStructuredReviews(inputs: ReviewPromptInput[]): Promise<GameAIInsights[]> {
    if (!inputs.length) {
      return [];
    }

    const response = await this.client.responses.create({
      model: this.model,
      input: [
        {
          role: "system",
          content:
            "You are a practical chess coach. Use only the engine facts provided. Explain what the player was trying to do, why it failed, what pattern repeated, and what to think about next time. Return strict JSON only as {\"reviews\": [...]} with exactly one review per input item in the same order. Each review must have keys: summary, coachingNotes, actionItems, confidence, criticalMoments. coachingNotes and actionItems must be arrays of short, specific strings tied to the actual mistakes. criticalMoments must be an array of objects for the top mistakes from the input and each item must contain: ply, label, whatHappened, whyItMatters, whatToThink, trainingFocus, confidence. In criticalMoments, explicitly explain why this exact move was critical, what root cause caused the miss, and what concrete thought process would stop the same mistake next time."
        },
        {
          role: "user",
          content: JSON.stringify({ inputs })
        }
      ]
    });

    const text = response.output_text;
    const parsed = batchedReviewsSchema.parse(parseLooseJson(text));
    return inputs.map((input, index) => {
      const raw = parsed.reviews[index];
      const candidate = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      return {
        review: normalizeReviewNarrative(raw, input),
        criticalMoments: normalizeCriticalMoments(candidate.criticalMoments, input)
      };
    });
  }

  async answerGameCoachQuestion(input: GameCoachChatInput): Promise<string> {
    const response = await this.client.responses.create({
      model: this.model,
      input: [
        {
          role: "system",
          content:
            "You are a personal chess trainer. Answer only from the supplied analyzed game context. Be practical, specific, improvement-first, and concise. Explain why the move or pattern mattered, what the player likely missed, and what thought process would prevent the same mistake next time. If a focusPly is supplied, center the answer on that moment. Do not invent lines or evaluations beyond the provided facts."
        },
        {
          role: "user",
          content: JSON.stringify(input)
        }
      ]
    });

    const text = response.output_text?.trim();
    if (!text) {
      throw new Error("OpenAI returned an empty coach response.");
    }

    return text;
  }

  async generatePortfolioReview(input: PortfolioReviewInput): Promise<PortfolioReview> {
    const response = await this.client.responses.create({
      model: this.model,
      input: [
        {
          role: "system",
          content:
            "You are an elite chess improvement coach. Analyze the player's last sample of games using only the provided engine-backed aggregates and mistakes. Focus on style of play, repeated weaknesses, strengths worth preserving, and the highest-leverage changes to improve. Be specific and practical, not generic. Return strict JSON only with keys: summary, styleProfile, strengths, recurringLeaks, improvementPriorities, trainingPlan, confidence."
        },
        {
          role: "user",
          content: JSON.stringify(input)
        }
      ]
    });

    const text = response.output_text;
    return normalizePortfolioReview(parseLooseJson(text), input);
  }

  async generateTrainingCard(input: TrainingPromptInput): Promise<TrainingCardPayload> {
    const cards = await this.generateTrainingCards([input]);
    const card = cards[0];
    if (!card) {
      throw new Error("OpenAI did not return a training card.");
    }
    return card;
  }

  async generateTrainingCards(inputs: TrainingPromptInput[]): Promise<TrainingCardPayload[]> {
    if (!inputs.length) {
      return [];
    }

    const response = await this.client.responses.create({
      model: this.model,
      input: [
        {
          role: "system",
          content:
            "You create concise chess training cards from engine facts. Return strict JSON as {\"cards\": [...]}. Return exactly one card per input item and preserve sourceGameId/sourcePly/promptFen/expectedMove."
        },
        {
          role: "user",
          content: JSON.stringify({ inputs })
        }
      ]
    });

    const text = response.output_text;
    const parsed = trainingCardsSchema.parse(parseLooseJson(text));
    if (parsed.cards.length !== inputs.length) {
      throw new Error(`OpenAI returned ${parsed.cards.length} cards for ${inputs.length} inputs.`);
    }
    return parsed.cards;
  }

  async generateLeakExplanations(input: {
    leakLabel: string;
    examples: LeakExamplePromptInput[];
  }): Promise<LeakExampleExplanation[]> {
    const response = await this.client.responses.create({
      model: this.model,
      input: [
        {
          role: "system",
          content:
            "You explain chess mistakes concisely. Keep each field under 30 words. Return strict JSON with key 'explanations'. For each example include exampleId, explanation, whyLeak."
        },
        {
          role: "user",
          content: JSON.stringify(input)
        }
      ]
    });

    const text = response.output_text;
    const parsed = leakExampleSchema.parse(parseLooseJson(text));
    return parsed.explanations;
  }
}
