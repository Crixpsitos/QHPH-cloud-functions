import {Timestamp} from "firebase-admin/firestore";
import {onDocumentWritten} from "firebase-functions/firestore";
import {getNestedValue} from "../../../utils/getNestedValue";
import {SCORE_RELEVANT_FIELDS} from "../../../const/SCORE_RELEVANT_FIELDS";
import {calculateTrendingScore} from "../../../utils/calculateTrendingScore";
import {logger} from "firebase-functions";

export const recalculateScoreAnalitycs = onDocumentWritten(
  {
    document: "events/{eventId}",
    database: "quehaypahacer-db",
  },
  async (documentEvent) => {
    try {
      const eventId = documentEvent.params.eventId;
      logger.info(
        "[recalculateScoreAnalitycs] Iniciando trigger para evento:",
        {eventId},
      );

      const before = documentEvent.data?.before.data();
      const after = documentEvent.data?.after.data();

      logger.info("[recalculateScoreAnalitycs] Before existe:", {
        exists: !!before,
      });
      logger.info("[recalculateScoreAnalitycs] After existe:", {
        exists: !!after,
      });

      if (!after) {
        logger.info(
          "[recalculateScoreAnalitycs] No hay datos 'after', finalizando",
        );
        return;
      }

      const eventRef = documentEvent.data?.after.ref;
      if (!eventRef) {
        logger.error(
          "[recalculateScoreAnalitycs] No se pudo obtener la referencia del documento",
        );
        return;
      }
      logger.info("[recalculateScoreAnalitycs] Ref obtenida:", {
        path: eventRef.path,
      });

      const relevantChanged = SCORE_RELEVANT_FIELDS.some((field) => {
        const beforeValue = getNestedValue(before ?? {}, field);
        const afterValue = getNestedValue(after ?? {}, field);
        const changed = beforeValue !== afterValue;
        if (changed) {
          logger.info(
            `[recalculateScoreAnalitycs] Campo relevante cambió: ${field}`,
            {
              before: beforeValue,
              after: afterValue,
            },
          );
        }
        return changed;
      });

      if (!relevantChanged) {
        logger.info(
          "[recalculateScoreAnalitycs] Ningún campo relevante cambió, finalizando",
        );
        return;
      }

      logger.info("[recalculateScoreAnalitycs] Objeto after completo:", {
        after: JSON.stringify(after),
      });

      logger.info(
        "[recalculateScoreAnalitycs] Calculando trending score para evento:",
        {event: after.event, eventExists: !!after.event},
      );

      if (!after.event) {
        logger.warn(
          "[recalculateScoreAnalitycs] El objeto after no tiene propiedad 'event'",
        );
        // Probablemente 'after' es el evento directo, no tiene un campo 'event'
        const score = calculateTrendingScore(after as any);
        logger.info(
          "[recalculateScoreAnalitycs] Score calculado (usando after directo):",
          {
            score,
          },
        );

        if (score === 0) {
          logger.info("[recalculateScoreAnalitycs] Score es 0, finalizando");
          return;
        }

        logger.info(
          "[recalculateScoreAnalitycs] Actualizando documento con score:",
          {score},
        );
        await eventRef.update({
          "analytics.score": score,
          "updatedAt": Timestamp.now(),
          "metadata._meiliNeedsSync": true,
        });
        return;
      }

      const score = calculateTrendingScore(after.event);
      logger.info("[recalculateScoreAnalitycs] Score calculado:", {score});

      if (score === 0) {
        logger.info("[recalculateScoreAnalitycs] Score es 0, finalizando");
        return;
      }

      logger.info(
        "[recalculateScoreAnalitycs] Actualizando documento con score:",
        {score},
      );
      await eventRef.update({
        "analytics.score": score,
        "updatedAt": Timestamp.now(),
        "metadata._meiliNeedsSync": true,
      });

      logger.info(
        "[recalculateScoreAnalitycs] Trigger completado exitosamente para evento:",
        {eventId},
      );
    } catch (error) {
      logger.error("[recalculateScoreAnalitycs] Error en trigger:", {
        error: error instanceof Error ? error.message : String(error),
      });
      logger.error("[recalculateScoreAnalitycs] Stack trace:", {
        stack: error instanceof Error ? error.stack : "Sin stack",
      });
      throw error;
    }
  },
);
