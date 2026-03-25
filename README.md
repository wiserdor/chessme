# ChessMe

Personal chess training web app that imports Chess.com games, analyzes them locally, clusters recurring weaknesses, and generates drills from your own positions.

## Stack

- Next.js App Router + TypeScript
- SQLite + Drizzle ORM
- `chess.js` for PGN/FEN handling
- local Stockfish with deterministic fallback
- provider-based LLM layer with OpenAI first

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Notes

- Chess.com import uses the public archives API.
- AI provider/model/token are managed in-app at `/settings` (stored in local SQLite).
- If AI credentials are missing or an AI call fails, the app falls back to deterministic summaries.
- If Stockfish is unavailable, the app falls back to a simple material-based evaluator so the pipeline remains usable.
