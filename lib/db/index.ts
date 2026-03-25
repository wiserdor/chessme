import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "@/lib/db/schema";

const databasePath = process.env.DATABASE_PATH
  ? path.resolve(process.cwd(), process.env.DATABASE_PATH)
  : path.resolve(process.cwd(), "data", "chessme.sqlite");

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const sqlite = new Database(databasePath);
sqlite.pragma("journal_mode = WAL");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS leak_example_notes (
    id TEXT PRIMARY KEY,
    leak_key TEXT NOT NULL,
    game_id TEXT NOT NULL,
    ply INTEGER NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    explanation TEXT NOT NULL,
    why_leak TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS critical_moment_notes (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    ply INTEGER NOT NULL,
    label TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    what_happened TEXT NOT NULL,
    why_it_matters TEXT NOT NULL,
    what_to_think TEXT NOT NULL,
    training_focus TEXT NOT NULL,
    confidence INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS coach_chat_messages (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    focus_ply INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ai_configs (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL DEFAULT 'mock',
    model TEXT NOT NULL DEFAULT 'deterministic-coach',
    api_key TEXT,
    quota_cooldown_until INTEGER,
    last_error TEXT,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'openai',
    model TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS game_imports (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    source_id TEXT NOT NULL,
    status TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS analysis_jobs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    options_json TEXT NOT NULL DEFAULT '{}',
    total_games INTEGER NOT NULL DEFAULT 0,
    processed_games INTEGER NOT NULL DEFAULT 0,
    message TEXT,
    error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    external_id TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL,
    source_url TEXT,
    pgn TEXT NOT NULL,
    white_player TEXT NOT NULL,
    black_player TEXT NOT NULL,
    result TEXT NOT NULL,
    played_at TEXT,
    time_control TEXT,
    opening TEXT,
    eco TEXT,
    analysis_status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS positions (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    ply INTEGER NOT NULL,
    san TEXT NOT NULL,
    fen_before TEXT NOT NULL,
    fen_after TEXT NOT NULL,
    move_by TEXT NOT NULL,
    tags_json TEXT NOT NULL DEFAULT '[]'
  );
  CREATE TABLE IF NOT EXISTS engine_reviews (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    ply INTEGER NOT NULL,
    fen TEXT NOT NULL,
    played_move TEXT NOT NULL,
    best_move TEXT NOT NULL,
    evaluation_cp INTEGER NOT NULL,
    best_line_cp INTEGER NOT NULL,
    delta_cp INTEGER NOT NULL,
    label TEXT NOT NULL,
    tags_json TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS game_reviews (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL UNIQUE,
    summary TEXT NOT NULL,
    coaching_notes_json TEXT NOT NULL DEFAULT '[]',
    action_items_json TEXT NOT NULL DEFAULT '[]',
    confidence INTEGER NOT NULL DEFAULT 0,
    coach_source TEXT NOT NULL DEFAULT 'mock',
    coach_provider TEXT,
    coach_model TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ai_reports (
    id TEXT PRIMARY KEY,
    report_type TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    games_count INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS weakness_patterns (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    severity INTEGER NOT NULL,
    count INTEGER NOT NULL,
    examples_json TEXT NOT NULL DEFAULT '[]',
    suggested_focus TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS training_cards (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    theme TEXT NOT NULL,
    prompt_fen TEXT NOT NULL,
    expected_move TEXT NOT NULL,
    hint TEXT NOT NULL,
    explanation TEXT NOT NULL,
    tags_json TEXT NOT NULL DEFAULT '[]',
    source_game_id TEXT NOT NULL,
    source_ply INTEGER NOT NULL,
    difficulty INTEGER NOT NULL,
    interval_days INTEGER NOT NULL DEFAULT 1,
    streak INTEGER NOT NULL DEFAULT 0,
    due_at INTEGER NOT NULL,
    last_answered_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS training_sessions (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL,
    move TEXT NOT NULL,
    correct INTEGER NOT NULL,
    confidence INTEGER,
    answered_at INTEGER NOT NULL
  );
`);

try {
  sqlite.exec("ALTER TABLE ai_configs ADD COLUMN quota_cooldown_until INTEGER");
} catch {}

try {
  sqlite.exec("ALTER TABLE ai_configs ADD COLUMN last_error TEXT");
} catch {}

try {
  sqlite.exec("ALTER TABLE game_reviews ADD COLUMN coach_source TEXT NOT NULL DEFAULT 'mock'");
} catch {}

try {
  sqlite.exec("ALTER TABLE game_reviews ADD COLUMN coach_provider TEXT");
} catch {}

try {
  sqlite.exec("ALTER TABLE game_reviews ADD COLUMN coach_model TEXT");
} catch {}

try {
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS ai_reports (id TEXT PRIMARY KEY, report_type TEXT NOT NULL UNIQUE, title TEXT NOT NULL, games_count INTEGER NOT NULL, payload_json TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, updated_at INTEGER NOT NULL)"
  );
} catch {}

try {
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS analysis_jobs (id TEXT PRIMARY KEY, status TEXT NOT NULL, options_json TEXT NOT NULL DEFAULT '{}', total_games INTEGER NOT NULL DEFAULT 0, processed_games INTEGER NOT NULL DEFAULT 0, message TEXT, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)"
  );
} catch {}

try {
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS coach_chat_messages (id TEXT PRIMARY KEY, game_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, focus_ply INTEGER, created_at INTEGER NOT NULL)"
  );
} catch {}

export const db = drizzle(sqlite, { schema });
export { sqlite };
