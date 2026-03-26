export type ProviderName = "openai" | "mock";
export type NoteAnchorType = "general" | "game" | "move" | "position" | "opening" | "leak" | "coach-flow" | "training-card";

export type MistakeLabel =
  | "inaccuracy"
  | "mistake"
  | "blunder"
  | "missed-tactic"
  | "opening-leak"
  | "endgame-error";

export type GameColor = "white" | "black";

export interface ImportedGame {
  externalId: string;
  source: "chesscom" | "pgn";
  sourceUrl?: string;
  pgn: string;
  whitePlayer: string;
  blackPlayer: string;
  result: string;
  playedAt?: string;
  timeControl?: string;
  opening?: string;
  eco?: string;
}

export interface PositionSnapshot {
  ply: number;
  san: string;
  fenBefore: string;
  fenAfter: string;
  moveBy: GameColor;
  tags: string[];
}

export interface EngineReview {
  ply: number;
  fen: string;
  playedMove: string;
  bestMove: string;
  evaluationCp: number;
  bestLineCp: number;
  deltaCp: number;
  label: MistakeLabel;
  tags: string[];
}

export interface WeaknessPatternInput {
  key: string;
  label: string;
  severity: number;
  examples: string[];
  suggestedFocus: string;
  count: number;
}

export interface TrainingCardPayload {
  title: string;
  theme: string;
  promptFen: string;
  expectedMove: string;
  hint: string;
  explanation: string;
  tags: string[];
  sourceGameId: string;
  sourcePly: number;
  difficulty: number;
}

export interface ReviewNarrative {
  summary: string;
  coachingNotes: string[];
  actionItems: string[];
  confidence: number;
}

export interface CriticalMomentLearning {
  ply: number;
  label: string;
  whatHappened: string;
  whyItMatters: string;
  whatToThink: string;
  trainingFocus: string;
  confidence: number;
}

export interface PortfolioReview {
  summary: string;
  styleProfile: string[];
  strengths: string[];
  recurringLeaks: string[];
  improvementPriorities: string[];
  trainingPlan: string[];
  confidence: number;
}

export interface DashboardSnapshot {
  profile: {
    username: string;
    provider: ProviderName;
    model: string;
  } | null;
  hasApiKey: boolean;
  activeAnalysisJob: {
    id: string;
    status: string;
    totalGames: number;
    processedGames: number;
    message: string | null;
  } | null;
  totals: {
    games: number;
    analyzedGames: number;
    dueCards: number;
    weaknessCount: number;
  };
  weaknesses: Array<{
    id: string;
    key: string;
    label: string;
    severity: number;
    count: number;
    suggestedFocus: string;
  }>;
  recentGames: Array<{
    id: string;
    opponent: string;
    result: string;
    opening: string;
    playedAt: string;
    status: string;
    isFavorite: boolean;
  }>;
  favoriteGames: Array<{
    id: string;
    opponent: string;
    result: string;
    opening: string;
    playedAt: string;
    status: string;
  }>;
}

export interface NoteRecord {
  id: string;
  title: string;
  body: string;
  manualTags: string[];
  derivedTags: string[];
  anchorType: NoteAnchorType;
  anchorLabel: string;
  sourcePath: string;
  gameId?: string | null;
  ply?: number | null;
  fen?: string | null;
  opening?: string | null;
  leakKey?: string | null;
  trainingCardId?: string | null;
  focusArea?: string | null;
  coachMessageContext?: string | null;
  href: string;
  excerpt: string;
  createdAt: number;
  updatedAt: number;
}

export interface PrivateAIConfig {
  provider: ProviderName;
  model: string;
  apiKey: string | null;
  updatedAt: number;
}

export interface SavedProfileShortcut {
  username: string;
  savedAt: number;
  lastOpenedAt: number;
}

export interface PrivateCoachMessage {
  id: string;
  profileKey: string;
  gameId: string;
  role: "user" | "coach";
  content: string;
  focusPly?: number | null;
  focusArea?: string | null;
  createdAt: number;
}

export interface PrivateGameAIReview {
  gameId: string;
  profileKey: string;
  review: ReviewNarrative;
  criticalMoments: CriticalMomentLearning[];
  provider: string;
  model: string;
  updatedAt: number;
}

export interface PrivateLeakExplanationCache {
  leakKey: string;
  profileKey: string;
  examples: Array<{
    gameId: string;
    ply?: number | null;
    explanation: string;
    whyLeak: string;
    source: "ai" | "engine";
  }>;
  provider: string;
  model: string;
  updatedAt: number;
}

export interface PrivateAIReportCache {
  reportType: string;
  profileKey: string;
  title: string;
  gamesCount: number;
  payload: PortfolioReview;
  provider: string;
  model: string;
  updatedAt: number;
}

export interface PrivateTrainingProgress {
  cardId: string;
  profileKey: string;
  intervalDays: number;
  streak: number;
  dueAt: number;
  lastAnsweredAt?: number | null;
}
