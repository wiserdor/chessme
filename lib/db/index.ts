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
sqlite.pragma("busy_timeout = 15000");
sqlite.pragma("synchronous = NORMAL");

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
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    manual_tags_json TEXT NOT NULL DEFAULT '[]',
    derived_tags_json TEXT NOT NULL DEFAULT '[]',
    anchor_type TEXT NOT NULL,
    anchor_label TEXT NOT NULL,
    source_path TEXT NOT NULL,
    game_id TEXT,
    ply INTEGER,
    fen TEXT,
    opening TEXT,
    leak_key TEXT,
    training_card_id TEXT,
    focus_area TEXT,
    coach_message_context TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
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
    profile_username TEXT NOT NULL DEFAULT 'default',
    source TEXT NOT NULL,
    source_id TEXT NOT NULL,
    status TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS analysis_jobs (
    id TEXT PRIMARY KEY,
    profile_username TEXT NOT NULL DEFAULT 'default',
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
    profile_username TEXT NOT NULL DEFAULT 'default',
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
    is_favorite INTEGER NOT NULL DEFAULT 0,
    analysis_status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS positions (
    id TEXT PRIMARY KEY,
    profile_username TEXT NOT NULL DEFAULT 'default',
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
    profile_username TEXT NOT NULL DEFAULT 'default',
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
    profile_username TEXT NOT NULL DEFAULT 'default',
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
    profile_username TEXT NOT NULL DEFAULT 'default',
    key TEXT NOT NULL,
    label TEXT NOT NULL,
    severity INTEGER NOT NULL,
    count INTEGER NOT NULL,
    examples_json TEXT NOT NULL DEFAULT '[]',
    suggested_focus TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS weakness_patterns_profile_key_unique
  ON weakness_patterns(profile_username, key);
  CREATE TABLE IF NOT EXISTS training_cards (
    id TEXT PRIMARY KEY,
    profile_username TEXT NOT NULL DEFAULT 'default',
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
  CREATE VIRTUAL TABLE IF NOT EXISTS notes_search USING fts5(
    note_id UNINDEXED,
    title,
    body,
    manual_tags,
    derived_tags,
    anchor_label,
    opening,
    leak_label
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
  sqlite.exec("ALTER TABLE games ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0");
} catch {}

try {
  sqlite.exec("ALTER TABLE game_imports ADD COLUMN profile_username TEXT NOT NULL DEFAULT 'default'");
} catch {}

try {
  sqlite.exec("ALTER TABLE analysis_jobs ADD COLUMN profile_username TEXT NOT NULL DEFAULT 'default'");
} catch {}

try {
  sqlite.exec("ALTER TABLE games ADD COLUMN profile_username TEXT NOT NULL DEFAULT 'default'");
} catch {}

try {
  sqlite.exec("ALTER TABLE positions ADD COLUMN profile_username TEXT NOT NULL DEFAULT 'default'");
} catch {}

try {
  sqlite.exec("ALTER TABLE engine_reviews ADD COLUMN profile_username TEXT NOT NULL DEFAULT 'default'");
} catch {}

try {
  sqlite.exec("ALTER TABLE game_reviews ADD COLUMN profile_username TEXT NOT NULL DEFAULT 'default'");
} catch {}

try {
  sqlite.exec("ALTER TABLE weakness_patterns ADD COLUMN profile_username TEXT NOT NULL DEFAULT 'default'");
} catch {}

try {
  const weaknessSchemaRow = sqlite
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'weakness_patterns'")
    .get() as { sql?: string } | undefined;

  if (weaknessSchemaRow?.sql?.includes("key TEXT NOT NULL UNIQUE")) {
    sqlite.exec(`
      ALTER TABLE weakness_patterns RENAME TO weakness_patterns_legacy;
      CREATE TABLE weakness_patterns (
        id TEXT PRIMARY KEY,
        profile_username TEXT NOT NULL DEFAULT 'default',
        key TEXT NOT NULL,
        label TEXT NOT NULL,
        severity INTEGER NOT NULL,
        count INTEGER NOT NULL,
        examples_json TEXT NOT NULL DEFAULT '[]',
        suggested_focus TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX weakness_patterns_profile_key_unique
      ON weakness_patterns(profile_username, key);
      INSERT INTO weakness_patterns (
        id,
        profile_username,
        key,
        label,
        severity,
        count,
        examples_json,
        suggested_focus,
        created_at,
        updated_at
      )
      SELECT
        id,
        COALESCE(NULLIF(profile_username, ''), 'default'),
        key,
        label,
        severity,
        count,
        examples_json,
        suggested_focus,
        created_at,
        updated_at
      FROM weakness_patterns_legacy;
    `);
  }
} catch {}

try {
  sqlite.exec(`
    INSERT OR IGNORE INTO weakness_patterns (
      id,
      profile_username,
      key,
      label,
      severity,
      count,
      examples_json,
      suggested_focus,
      created_at,
      updated_at
    )
    SELECT
      id,
      COALESCE(NULLIF(profile_username, ''), 'default'),
      key,
      label,
      severity,
      count,
      examples_json,
      suggested_focus,
      created_at,
      updated_at
    FROM weakness_patterns_legacy;
  `);
} catch {}

try {
  sqlite.exec("DROP INDEX IF EXISTS weakness_patterns_profile_key_unique");
} catch {}

try {
  sqlite.exec("DROP TABLE IF EXISTS weakness_patterns_legacy");
} catch {}

try {
  sqlite.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS weakness_patterns_profile_key_unique ON weakness_patterns(profile_username, key)"
  );
} catch {}

try {
  sqlite.exec("ALTER TABLE training_cards ADD COLUMN profile_username TEXT NOT NULL DEFAULT 'default'");
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

try {
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, manual_tags_json TEXT NOT NULL DEFAULT '[]', derived_tags_json TEXT NOT NULL DEFAULT '[]', anchor_type TEXT NOT NULL, anchor_label TEXT NOT NULL, source_path TEXT NOT NULL, game_id TEXT, ply INTEGER, fen TEXT, opening TEXT, leak_key TEXT, training_card_id TEXT, focus_area TEXT, coach_message_context TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)"
  );
} catch {}

try {
  sqlite.exec("CREATE VIRTUAL TABLE IF NOT EXISTS notes_search USING fts5(note_id UNINDEXED, title, body, manual_tags, derived_tags, anchor_label, opening, leak_label)");
} catch {}

try {
  sqlite.exec("ALTER TABLE notes ADD COLUMN coach_message_context TEXT");
} catch {}

sqlite.exec(`
  UPDATE game_imports
  SET profile_username = COALESCE(NULLIF(profile_username, 'default'), (SELECT username FROM profiles ORDER BY updated_at DESC LIMIT 1), 'default');
  UPDATE analysis_jobs
  SET profile_username = COALESCE(NULLIF(profile_username, 'default'), (SELECT username FROM profiles ORDER BY updated_at DESC LIMIT 1), 'default');
  UPDATE games
  SET profile_username = COALESCE(NULLIF(profile_username, 'default'), (SELECT username FROM profiles ORDER BY updated_at DESC LIMIT 1), 'default');
  UPDATE positions
  SET profile_username = COALESCE(NULLIF(profile_username, 'default'), (SELECT username FROM profiles ORDER BY updated_at DESC LIMIT 1), 'default');
  UPDATE engine_reviews
  SET profile_username = COALESCE(NULLIF(profile_username, 'default'), (SELECT username FROM profiles ORDER BY updated_at DESC LIMIT 1), 'default');
  UPDATE game_reviews
  SET profile_username = COALESCE(NULLIF(profile_username, 'default'), (SELECT username FROM profiles ORDER BY updated_at DESC LIMIT 1), 'default');
  UPDATE weakness_patterns
  SET profile_username = COALESCE(NULLIF(profile_username, 'default'), (SELECT username FROM profiles ORDER BY updated_at DESC LIMIT 1), 'default');
  UPDATE training_cards
  SET profile_username = COALESCE(NULLIF(profile_username, 'default'), (SELECT username FROM profiles ORDER BY updated_at DESC LIMIT 1), 'default');
`);

export const db = drizzle(sqlite, { schema });
export { sqlite };
