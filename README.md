# ChessMe

ChessMe is a personal chess trainer that turns your own games into analysis, coaching, recurring leak detection, and targeted drills.

It is built for players who want more than a generic engine review. Instead of only showing mistakes, ChessMe tries to answer:

- what kind of mistakes keep repeating
- where your thinking breaks down
- what to train next
- how to turn your own positions into a practical improvement loop

## What It Does

- Import completed games from Chess.com by username
- Upload PGN files as a fallback
- Run local engine analysis on your games
- Detect recurring weaknesses such as tactical oversights, opening leaks, and endgame errors
- Create training cards from your own critical positions
- Add grounded AI coaching on top of engine facts
- Let you chat with a coach about a game, move, leak, or recent trend
- Save private notes tied to games, moves, openings, leaks, and coach answers

## Why It Is Different

Most chess review tools stop at evaluation swings.

ChessMe is designed around an improvement loop:

1. Import games
2. Analyze mistakes
3. Cluster repeated leaks
4. Review critical moments
5. Train on your own positions
6. Track whether your recent games are getting better

## Core Features

- Dashboard with recent games, favorites, weakness clusters, and training status
- Game review page with board replay, critical moments, coach chat, and per-game notes
- Leak pages with examples from your own games, practical fix guidance, and related drills
- Coach Lab with blindspot map, recent trends, and style-focused AI coaching
- Training queue built from your own mistakes instead of generic puzzle sets
- Notes hub with search and contextual retrieval
- Light and dark theme support
- Mobile-friendly responsive layout

## Stack

- Next.js App Router + TypeScript
- SQLite + Drizzle ORM
- `chess.js` for PGN/FEN handling
- local Stockfish with deterministic fallback coaching
- provider-based LLM layer with OpenAI first

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Configuration

- Chess.com import uses the public archives API
- AI provider, model, and token are managed in-app at `/settings`
- API tokens are stored locally in SQLite, not committed to the repo
- Core game analysis works without an AI token

## How AI Works

- Without a token:
  - ChessMe still analyzes games locally with Stockfish
  - Coaching falls back to a deterministic local provider
- With a token:
  - You unlock deeper coach chat, leak explanations, and style reports
  - AI is used to explain engine-backed facts, not replace the engine

## Privacy

- Local database files are stored under `./data`
- `.env.local` and runtime data are gitignored
- If AI credentials are missing or an AI call fails, the app falls back to deterministic summaries
- If Stockfish is unavailable, the app falls back to a simple material-based evaluator so the pipeline remains usable

## Status

This project is currently optimized for a single-user personal workflow and is evolving toward a stronger coach-first training experience.
