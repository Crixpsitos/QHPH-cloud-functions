import {logger} from "firebase-functions";

interface SessionData {
  startDate?: {toMillis: () => number};
  createdAt?: {toMillis: () => number};
  analytics?: {
    views?: number;
    shares?: number;
    registrations?: number;
  };
}

export const calculateSessionScore = (session: SessionData): number => {
  try {
    const now = Date.now();

    const startMillis = session.startDate?.toMillis?.();
    if (!startMillis) {
      logger.warn("[calculateSessionScore] Session sin startDate, score = 0");
      return 0;
    }

    const daysUntilSession = (startMillis - now) / (1000 * 60 * 60 * 24);
    if (daysUntilSession < 0) return 0;

    const createdMillis = session.createdAt?.toMillis?.() ?? now;
    const daysSinceCreated = Math.max(0, (now - createdMillis) / (1000 * 60 * 60 * 24));

    const urgencyFactor = Math.max(1, 2 - daysUntilSession / 30);
    const decayFactor = Math.pow(0.85, daysSinceCreated / 7);

    const views = session.analytics?.views ?? 0;
    const shares = session.analytics?.shares ?? 0;
    const registrations = session.analytics?.registrations ?? 0;

    const rawScore = views * 0.1 + registrations * 2.0 + shares * 1.0;
    const finalScore = rawScore * urgencyFactor * decayFactor;

    logger.info("[calculateSessionScore] Score calculado", {
      rawScore,
      finalScore,
      daysUntilSession: Math.round(daysUntilSession),
      daysSinceCreated: Math.round(daysSinceCreated),
    });

    return finalScore;
  } catch (error) {
    logger.error("[calculateSessionScore] Error calculando score", {
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
};
