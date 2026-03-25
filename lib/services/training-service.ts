import { getDueTrainingCard, recordTrainingAnswer } from "@/lib/services/repository";

export async function getNextTrainingCard() {
  return getDueTrainingCard();
}

export async function submitTrainingAnswer(cardId: string, move: string, confidence?: number) {
  return recordTrainingAnswer(cardId, move, confidence);
}

export function calculateNextInterval(previousInterval: number, wasCorrect: boolean): number {
  return wasCorrect ? Math.max(1, previousInterval * 2) : 1;
}
