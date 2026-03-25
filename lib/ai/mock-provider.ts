import {
  GameCoachChatInput,
  GameAIInsights,
  LeakExampleExplanation,
  LeakExamplePromptInput,
  LLMProvider,
  PortfolioReviewInput,
  ReviewPromptInput,
  TrainingPromptInput
} from "@/lib/ai/provider";
import { CriticalMomentLearning, PortfolioReview, TrainingCardPayload } from "@/lib/types";

export class MockProvider implements LLMProvider {
  name = "mock" as const;
  model = "deterministic-coach";

  private buildCriticalMoments(input: ReviewPromptInput): CriticalMomentLearning[] {
    return input.mistakes.slice(0, 4).map((mistake) => ({
      ply: mistake.ply,
      label: mistake.label,
      whatHappened: `${mistake.playedMove} allowed a better continuation with ${mistake.bestMove} and cost about ${mistake.deltaCp} centipawns.`,
      whyItMatters: "This was a real decision point, so the missed idea should become part of your review memory.",
      whatToThink: "Pause and compare your move with the most forcing replies for both sides.",
      trainingFocus: `Replay ply ${mistake.ply} and explain why ${mistake.bestMove} was the cleaner move.`,
      confidence: 0.56
    }));
  }

  async generateStructuredReview(input: ReviewPromptInput): Promise<GameAIInsights> {
    const topMistakes = input.mistakes.slice(0, 3);

    return {
      review: {
        summary: `You drifted in ${input.opening || "the opening"} and gave away practical chances against ${input.opponent}. The biggest swing came from ${topMistakes[0]?.playedMove ?? "a loose move"} on ply ${topMistakes[0]?.ply ?? "?"}.`,
        coachingNotes: [
          "Pause after every forcing move and compare your move with the engine's candidate.",
          "When the position becomes tactical, reduce move speed and scan checks, captures, and threats."
        ],
        actionItems: [
          `Review ${topMistakes[0]?.label ?? "mistakes"} in your last games before your next session.`,
          "Train one short tactical drill set before playing rated games."
        ],
        confidence: 0.56
      },
      criticalMoments: this.buildCriticalMoments(input)
    };
  }

  async generateStructuredReviews(inputs: ReviewPromptInput[]): Promise<GameAIInsights[]> {
    const reviews: GameAIInsights[] = [];
    for (const input of inputs) {
      reviews.push(await this.generateStructuredReview(input));
    }
    return reviews;
  }

  async answerGameCoachQuestion(input: GameCoachChatInput): Promise<string> {
    const focus =
      input.focusPly !== undefined ? input.criticalMoments.find((moment) => moment.ply === input.focusPly) : input.criticalMoments[0];

    return [
      focus
        ? `At ply ${focus.ply}, ${focus.playedMove} was critical because ${focus.bestMove} kept more control and your move gave up about ${focus.deltaCp} centipawns.`
        : `In ${input.opening}, your main issue was not checking the most forcing continuation before moving.`,
      focus?.whatToThink
        ? `Next time think: ${focus.whatToThink}`
        : "Next time ask what the opponent threatens before calculating your own idea.",
      focus?.trainingFocus
        ? `Training: ${focus.trainingFocus}`
        : `Training: revisit one critical move from this game and explain the better alternative in your own words.`
    ].join(" ");
  }

  async generatePortfolioReview(input: PortfolioReviewInput): Promise<PortfolioReview> {
    const topLeak = input.leakLabels[0]?.label ?? "Decision drift";
    const topOpening = input.openings[0]?.name ?? "your usual structures";

    return {
      summary: `Across your last ${input.sampleSize} games, the clearest pattern is ${topLeak.toLowerCase()} showing up out of ${topOpening}.`,
      styleProfile: [
        "You play for practical chances and keep games alive even after evaluation swings.",
        "Your decisions become less stable once the position turns tactical or forcing."
      ],
      strengths: [
        "You keep reaching playable middlegames from familiar openings.",
        "You usually create enough activity to stay in the game after small mistakes."
      ],
      recurringLeaks: [
        `${topLeak} is the most repeated issue in the sample.`,
        "Large evaluation swings suggest candidate-move checks are not consistent enough yet."
      ],
      improvementPriorities: [
        "Reduce one repeated mistake family first instead of trying to fix everything at once.",
        "Review the first major swing in each recent game and name the missed idea before playing again."
      ],
      trainingPlan: [
        "Do a short checks-captures-threats scan before every critical move.",
        "Run 3 to 5 drills from your own worst positions before rated games."
      ],
      confidence: 0.58
    };
  }

  async generateTrainingCard(input: TrainingPromptInput): Promise<TrainingCardPayload> {
    return {
      title: `${input.theme} repair drill`,
      theme: input.theme,
      promptFen: input.promptFen,
      expectedMove: input.expectedMove,
      hint: `Look for a move that fixes the ${input.theme.toLowerCase()} issue first.`,
      explanation: input.explanationSeed,
      tags: input.tags,
      sourceGameId: input.sourceGameId,
      sourcePly: input.sourcePly,
      difficulty: Math.min(5, Math.max(1, input.tags.length + 1))
    };
  }

  async generateTrainingCards(inputs: TrainingPromptInput[]): Promise<TrainingCardPayload[]> {
    const cards: TrainingCardPayload[] = [];
    for (const input of inputs) {
      cards.push(await this.generateTrainingCard(input));
    }
    return cards;
  }

  async generateLeakExplanations(input: {
    leakLabel: string;
    examples: LeakExamplePromptInput[];
  }): Promise<LeakExampleExplanation[]> {
    return input.examples.map((example) => ({
      exampleId: example.exampleId,
      explanation: `In ${example.opening}, move ${example.playedMove} on ply ${example.ply} gave up about ${example.deltaCp} centipawns compared with ${example.bestMove}.`,
      whyLeak: `This matches ${input.leakLabel.toLowerCase()} because the same decision pattern keeps losing evaluation in similar positions.`
    }));
  }
}
