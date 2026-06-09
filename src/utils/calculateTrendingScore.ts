import {getNextOccurrence} from "./getNextOccurrence";
import {logger} from "firebase-functions";
import type {Events} from "../types/event/Event";

export const calculateTrendingScore = (event: Events) => {
  try {
    if (!event) {
      logger.warn("[calculateTrendingScore] Event es undefined");
      return 0;
    }

    logger.info("[calculateTrendingScore] Iniciando cálculo de score", {
      eventId: event.id,
      hasTitle: !!event.title,
    });

    const now = Date.now();
    logger.info("[calculateTrendingScore] Timestamp actual", {now});

    const relevantDate = getNextOccurrence(event);
    logger.info("[calculateTrendingScore] Fecha relevante obtenida", {
      relevantDate: relevantDate?.toMillis(),
      relevantDateExists: !!relevantDate,
    });

    if (!relevantDate) {
      logger.warn("[calculateTrendingScore] No hay fecha relevante, retornando 0");
      return 0;
    }

    const daysUntilEvent =
      (relevantDate.toMillis() - now) / (1000 * 60 * 60 * 24);
    logger.info("[calculateTrendingScore] Días hasta evento", {daysUntilEvent});

    if (daysUntilEvent < 0) {
      logger.warn("[calculateTrendingScore] Evento en el pasado, retornando 0", {
        daysUntilEvent,
      });
      return 0;
    }

    const publishedAtMillis = event.publishedAt?.toMillis() ?? now;
    logger.info("[calculateTrendingScore] Publicado en", {
      publishedAtMillis,
      hasPublishedAt: !!event.publishedAt,
    });

    const daysSincePublished = (now - publishedAtMillis) / (1000 * 60 * 60 * 24);
    logger.info("[calculateTrendingScore] Días desde publicación", {
      daysSincePublished,
    });

    const urgencyFactor = Math.max(1, 2 - daysUntilEvent / 30);
    logger.info("[calculateTrendingScore] Urgency factor", {urgencyFactor});

    const decayFactor = Math.pow(0.85, daysSincePublished / 7);
    logger.info("[calculateTrendingScore] Decay factor", {decayFactor});

    const views = event.analytics?.views ?? 0;
    const shares = event.analytics?.shares ?? 0;
    const registrations = event.analytics?.registrations ?? 0;
    const likes = event.analytics?.likes ?? 0;

    logger.info("[calculateTrendingScore] Métricas del evento", {
      views,
      shares,
      registrations,
      likes,
      isPromoted: event.promotion?.isPromoted,
    });

    const rawScore =
      views * 0.1 +
      likes * 0.5 +
      registrations * 2.0 +
      shares * 1.0 +
      (event.promotion?.isPromoted ? 100 : 0);

    logger.info("[calculateTrendingScore] Raw score calculado", {
      rawScore,
      breakdown: {
        viewsScore: views * 0.1,
        likesScore: likes * 0.5,
        registrationsScore: registrations * 2.0,
        sharesScore: shares * 1.0,
        promotionBonus: event.promotion?.isPromoted ? 100 : 0,
      },
    });

    const finalScore = rawScore * urgencyFactor * decayFactor;
    logger.info("[calculateTrendingScore] Score final calculado", {
      finalScore,
      calculation: `${rawScore} * ${urgencyFactor} * ${decayFactor}`,
    });

    return finalScore;
  } catch (error) {
    logger.error("[calculateTrendingScore] Error calculando score", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return 0;
  }
};
