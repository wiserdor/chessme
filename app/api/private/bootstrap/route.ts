import { NextResponse } from "next/server";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import {
  aiConfigs,
  aiReports,
  coachChatMessages,
  criticalMomentNotes,
  games,
  leakExampleNotes,
  notes,
  profiles,
  trainingSessions
} from "@/lib/db/schema";
import { buildNoteExcerpt, buildNoteHref } from "@/lib/services/notes";
import { safeJsonParse } from "@/lib/utils/json";

export const runtime = "nodejs";

const querySchema = z.object({
  username: z.string().trim().min(1)
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { username } = querySchema.parse({
      username: searchParams.get("username")
    });

    const profileRows = await db.select().from(profiles).orderBy(desc(profiles.updatedAt)).limit(1);
    const activeProfile = profileRows[0];
    if (!activeProfile || activeProfile.username.trim().toLowerCase() !== username.trim().toLowerCase()) {
      return NextResponse.json({
        ok: true,
        migrated: false,
        payload: null
      });
    }

    const [settingsRows, noteRows, favoriteRows, chatRows, reportRows, leakRows, criticalRows, trainingRows] = await Promise.all([
      db.select().from(aiConfigs).limit(1),
      db.select().from(notes).orderBy(desc(notes.updatedAt)),
      db.select().from(games).where(eq(games.isFavorite, 1)).orderBy(desc(games.updatedAt)),
      db.select().from(coachChatMessages).orderBy(asc(coachChatMessages.createdAt), asc(coachChatMessages.id)),
      db.select().from(aiReports).orderBy(desc(aiReports.updatedAt)),
      db.select().from(leakExampleNotes).orderBy(desc(leakExampleNotes.updatedAt)),
      db.select().from(criticalMomentNotes).orderBy(desc(criticalMomentNotes.updatedAt)),
      db.select().from(trainingSessions).orderBy(desc(trainingSessions.answeredAt))
    ]);

    const aiSettings = settingsRows[0]
      ? {
          provider: settingsRows[0].provider,
          model: settingsRows[0].model,
          apiKey: settingsRows[0].apiKey ?? null,
          updatedAt: settingsRows[0].updatedAt
        }
      : null;

    return NextResponse.json({
      ok: true,
      migrated: true,
      payload: {
        aiSettings,
        favorites: favoriteRows.map((row) => row.id),
        notes: noteRows.map((row) => ({
          id: row.id,
          title: row.title,
          body: row.body,
          manualTags: safeJsonParse<string[]>(row.manualTagsJson, []),
          derivedTags: safeJsonParse<string[]>(row.derivedTagsJson, []),
          anchorType: row.anchorType,
          anchorLabel: row.anchorLabel,
          sourcePath: row.sourcePath,
          gameId: row.gameId,
          ply: row.ply,
          fen: row.fen,
          opening: row.opening,
          leakKey: row.leakKey,
          trainingCardId: row.trainingCardId,
          focusArea: row.focusArea,
          coachMessageContext: row.coachMessageContext,
          href: buildNoteHref({
            anchorType: row.anchorType as never,
            sourcePath: row.sourcePath,
            gameId: row.gameId,
            ply: row.ply,
            leakKey: row.leakKey
          }),
          excerpt: buildNoteExcerpt(row.body),
          createdAt: row.createdAt,
          updatedAt: row.updatedAt
        })),
        coachMessages: chatRows.map((row) => ({
          id: row.id,
          gameId: row.gameId,
          role: row.role,
          content: row.content,
          focusPly: row.focusPly,
          createdAt: row.createdAt
        })),
        aiReports: reportRows.map((row) => ({
          reportType: row.reportType,
          title: row.title,
          gamesCount: row.gamesCount,
          provider: row.provider,
          model: row.model,
          payload: safeJsonParse(row.payloadJson, null),
          updatedAt: row.updatedAt
        })),
        leakExamples: leakRows.map((row) => ({
          leakKey: row.leakKey,
          gameId: row.gameId,
          ply: row.ply,
          provider: row.provider,
          model: row.model,
          explanation: row.explanation,
          whyLeak: row.whyLeak,
          updatedAt: row.updatedAt
        })),
        criticalMoments: criticalRows.map((row) => ({
          gameId: row.gameId,
          ply: row.ply,
          label: row.label,
          provider: row.provider,
          model: row.model,
          whatHappened: row.whatHappened,
          whyItMatters: row.whyItMatters,
          whatToThink: row.whatToThink,
          trainingFocus: row.trainingFocus,
          confidence: row.confidence / 100,
          updatedAt: row.updatedAt
        })),
        trainingSessions: trainingRows.map((row) => ({
          cardId: row.cardId,
          move: row.move,
          correct: Boolean(row.correct),
          confidence: row.confidence,
          answeredAt: row.answeredAt
        }))
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
