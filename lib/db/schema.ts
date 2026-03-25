import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  provider: text("provider").notNull().default("openai"),
  model: text("model").notNull().default("gpt-4.1-mini"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull()
});

export const aiConfigs = sqliteTable("ai_configs", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull().default("mock"),
  model: text("model").notNull().default("deterministic-coach"),
  apiKey: text("api_key"),
  quotaCooldownUntil: integer("quota_cooldown_until"),
  lastError: text("last_error"),
  updatedAt: integer("updated_at").notNull()
});

export const leakExampleNotes = sqliteTable("leak_example_notes", {
  id: text("id").primaryKey(),
  leakKey: text("leak_key").notNull(),
  gameId: text("game_id").notNull(),
  ply: integer("ply").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  explanation: text("explanation").notNull(),
  whyLeak: text("why_leak").notNull(),
  updatedAt: integer("updated_at").notNull()
});

export const criticalMomentNotes = sqliteTable("critical_moment_notes", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  ply: integer("ply").notNull(),
  label: text("label").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  whatHappened: text("what_happened").notNull(),
  whyItMatters: text("why_it_matters").notNull(),
  whatToThink: text("what_to_think").notNull(),
  trainingFocus: text("training_focus").notNull(),
  confidence: integer("confidence").notNull().default(0),
  updatedAt: integer("updated_at").notNull()
});

export const gameImports = sqliteTable("game_imports", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  sourceId: text("source_id").notNull(),
  status: text("status").notNull(),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: integer("created_at").notNull()
});

export const analysisJobs = sqliteTable("analysis_jobs", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  optionsJson: text("options_json").notNull().default("{}"),
  totalGames: integer("total_games").notNull().default(0),
  processedGames: integer("processed_games").notNull().default(0),
  message: text("message"),
  error: text("error"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull()
});

export const games = sqliteTable("games", {
  id: text("id").primaryKey(),
  externalId: text("external_id").notNull().unique(),
  source: text("source").notNull(),
  sourceUrl: text("source_url"),
  pgn: text("pgn").notNull(),
  whitePlayer: text("white_player").notNull(),
  blackPlayer: text("black_player").notNull(),
  result: text("result").notNull(),
  playedAt: text("played_at"),
  timeControl: text("time_control"),
  opening: text("opening"),
  eco: text("eco"),
  analysisStatus: text("analysis_status").notNull().default("pending"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull()
});

export const positions = sqliteTable("positions", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  ply: integer("ply").notNull(),
  san: text("san").notNull(),
  fenBefore: text("fen_before").notNull(),
  fenAfter: text("fen_after").notNull(),
  moveBy: text("move_by").notNull(),
  tagsJson: text("tags_json").notNull().default("[]")
});

export const engineReviews = sqliteTable("engine_reviews", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  ply: integer("ply").notNull(),
  fen: text("fen").notNull(),
  playedMove: text("played_move").notNull(),
  bestMove: text("best_move").notNull(),
  evaluationCp: integer("evaluation_cp").notNull(),
  bestLineCp: integer("best_line_cp").notNull(),
  deltaCp: integer("delta_cp").notNull(),
  label: text("label").notNull(),
  tagsJson: text("tags_json").notNull().default("[]"),
  createdAt: integer("created_at").notNull()
});

export const gameReviews = sqliteTable("game_reviews", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull().unique(),
  summary: text("summary").notNull(),
  coachingNotesJson: text("coaching_notes_json").notNull().default("[]"),
  actionItemsJson: text("action_items_json").notNull().default("[]"),
  confidence: integer("confidence").notNull().default(0),
  coachSource: text("coach_source").notNull().default("mock"),
  coachProvider: text("coach_provider"),
  coachModel: text("coach_model"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull()
});

export const aiReports = sqliteTable("ai_reports", {
  id: text("id").primaryKey(),
  reportType: text("report_type").notNull().unique(),
  title: text("title").notNull(),
  gamesCount: integer("games_count").notNull(),
  payloadJson: text("payload_json").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  updatedAt: integer("updated_at").notNull()
});

export const weaknessPatterns = sqliteTable("weakness_patterns", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  severity: integer("severity").notNull(),
  count: integer("count").notNull(),
  examplesJson: text("examples_json").notNull().default("[]"),
  suggestedFocus: text("suggested_focus").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull()
});

export const trainingCards = sqliteTable("training_cards", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  theme: text("theme").notNull(),
  promptFen: text("prompt_fen").notNull(),
  expectedMove: text("expected_move").notNull(),
  hint: text("hint").notNull(),
  explanation: text("explanation").notNull(),
  tagsJson: text("tags_json").notNull().default("[]"),
  sourceGameId: text("source_game_id").notNull(),
  sourcePly: integer("source_ply").notNull(),
  difficulty: integer("difficulty").notNull(),
  intervalDays: integer("interval_days").notNull().default(1),
  streak: integer("streak").notNull().default(0),
  dueAt: integer("due_at").notNull(),
  lastAnsweredAt: integer("last_answered_at")
});

export const trainingSessions = sqliteTable("training_sessions", {
  id: text("id").primaryKey(),
  cardId: text("card_id").notNull(),
  move: text("move").notNull(),
  correct: integer("correct").notNull(),
  confidence: integer("confidence"),
  answeredAt: integer("answered_at").notNull()
});
