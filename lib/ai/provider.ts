import { z } from "zod";

import { CriticalMomentLearning, PortfolioReview, ProviderName, ReviewNarrative, TrainingCardPayload } from "@/lib/types";

export const reviewNarrativeSchema = z.object({
  summary: z.string(),
  coachingNotes: z.array(z.string()),
  actionItems: z.array(z.string()),
  confidence: z.number().min(0).max(1)
});

export const criticalMomentLearningSchema = z.object({
  ply: z.number(),
  label: z.string(),
  whatHappened: z.string(),
  whyItMatters: z.string(),
  whatToThink: z.string(),
  trainingFocus: z.string(),
  confidence: z.number().min(0).max(1)
});

export const trainingCardSchema = z.object({
  title: z.string(),
  theme: z.string(),
  promptFen: z.string(),
  expectedMove: z.string(),
  hint: z.string(),
  explanation: z.string(),
  tags: z.array(z.string()),
  sourceGameId: z.string(),
  sourcePly: z.number(),
  difficulty: z.number().min(1).max(5)
});

export const portfolioReviewSchema = z.object({
  summary: z.string(),
  styleProfile: z.array(z.string()),
  strengths: z.array(z.string()),
  recurringLeaks: z.array(z.string()),
  improvementPriorities: z.array(z.string()),
  trainingPlan: z.array(z.string()),
  confidence: z.number().min(0).max(1)
});

export interface ReviewPromptInput {
  opening: string;
  opponent: string;
  mistakes: Array<{
    ply: number;
    label: string;
    deltaCp: number;
    playedMove: string;
    bestMove: string;
    tags: string[];
  }>;
}

export interface GameAIInsights {
  review: ReviewNarrative;
  criticalMoments: CriticalMomentLearning[];
}

export interface TrainingPromptInput {
  theme: string;
  promptFen: string;
  expectedMove: string;
  explanationSeed: string;
  sourceGameId: string;
  sourcePly: number;
  tags: string[];
}

export interface LeakExamplePromptInput {
  exampleId: string;
  opening: string;
  ply: number;
  playedMove: string;
  bestMove: string;
  deltaCp: number;
  label: string;
}

export interface LeakExampleExplanation {
  exampleId: string;
  explanation: string;
  whyLeak: string;
}

export interface PortfolioReviewInput {
  sampleSize: number;
  results: {
    win: number;
    loss: number;
    draw: number;
    unknown: number;
  };
  openings: Array<{
    name: string;
    count: number;
  }>;
  leakLabels: Array<{
    label: string;
    count: number;
  }>;
  games: Array<{
    id: string;
    playedAt: string | null;
    opening: string;
    result: string;
    timeControl: string | null;
    biggestSwing: number;
    topMistakes: Array<{
      ply: number;
      label: string;
      deltaCp: number;
      playedMove: string;
      bestMove: string;
      tags: string[];
    }>;
  }>;
}

export interface GameCoachChatInput {
  question: string;
  opening: string;
  opponent: string;
  resultLabel: string;
  playerColor?: "white" | "black" | null;
  gameSummary?: string | null;
  actionItems: string[];
  criticalMoments: Array<{
    ply: number;
    label: string;
    deltaCp: number;
    playedMove: string;
    bestMove: string;
    tags: string[];
    whatHappened?: string;
    whyItMatters?: string;
    whatToThink?: string;
    trainingFocus?: string;
  }>;
  focusPly?: number;
}

export interface LLMProvider {
  name: ProviderName;
  model: string;
  generateStructuredReview(input: ReviewPromptInput): Promise<GameAIInsights>;
  generateStructuredReviews(inputs: ReviewPromptInput[]): Promise<GameAIInsights[]>;
  answerGameCoachQuestion(input: GameCoachChatInput): Promise<string>;
  generatePortfolioReview(input: PortfolioReviewInput): Promise<PortfolioReview>;
  generateTrainingCard(input: TrainingPromptInput): Promise<TrainingCardPayload>;
  generateTrainingCards(inputs: TrainingPromptInput[]): Promise<TrainingCardPayload[]>;
  generateLeakExplanations(input: {
    leakLabel: string;
    examples: LeakExamplePromptInput[];
  }): Promise<LeakExampleExplanation[]>;
}
