import {
  CoachLabChatInput,
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
    const priorCoachMessage = [...input.history].reverse().find((message) => message.role === "coach");

    return [
      focus
        ? `At ply ${focus.ply}, ${focus.playedMove} was critical because ${focus.bestMove} kept more control and your move gave up about ${focus.deltaCp} centipawns.`
        : `In ${input.opening}, your main issue was not checking the most forcing continuation before moving.`,
      priorCoachMessage ? `Building on the earlier coach note: ${priorCoachMessage.content}` : null,
      focus?.whatToThink
        ? `Next time think: ${focus.whatToThink}`
        : "Next time ask what the opponent threatens before calculating your own idea.",
      input.notes[0] ? `Saved note to reuse: ${input.notes[0].title} - ${input.notes[0].excerpt}` : null,
      focus?.trainingFocus
        ? `Training: ${focus.trainingFocus}`
        : `Training: revisit one critical move from this game and explain the better alternative in your own words.`
    ]
      .filter((item): item is string => Boolean(item))
      .join(" ");
  }

  async answerCoachLabQuestion(input: CoachLabChatInput): Promise<string> {
    const focus = input.focusArea || input.focusOfWeek?.label || input.blindspots[0]?.label || "your main leak";
    const primaryBlindspot = input.blindspots[0];
    const priorCoachMessage = [...input.history].reverse().find((message) => message.role === "coach");

    return [
      `Your coach-lab focus right now is ${focus}.`,
      primaryBlindspot
        ? `${primaryBlindspot.label} is hurting because it appears ${primaryBlindspot.count} times with about ${primaryBlindspot.averageSwing}cp average damage. ${primaryBlindspot.whyItHurts}`
        : "You need a clearer recurring pattern from analyzed games before the coach can be more specific.",
      input.focusOfWeek ? `Main rule: ${input.focusOfWeek.rule}` : null,
      input.trend?.summary ? `Trend: ${input.trend.summary}` : null,
      input.notes[0] ? `One of your saved notes says: ${input.notes[0].title} - ${input.notes[0].excerpt}` : null,
      priorCoachMessage ? `Building on the earlier coach answer: ${priorCoachMessage.content}` : null,
      "Next step: review one linked example, then do a short training block on that exact pattern."
    ]
      .filter((item): item is string => Boolean(item))
      .join(" ");
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
