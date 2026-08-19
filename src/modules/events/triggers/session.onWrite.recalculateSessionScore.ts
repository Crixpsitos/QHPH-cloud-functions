import {Timestamp} from "firebase-admin/firestore";
import {onDocumentWritten} from "firebase-functions/firestore";
import {logger} from "firebase-functions";
import {getNestedValue} from "../../../utils/getNestedValue";
import {SESSION_SCORE_RELEVANT_FIELDS} from "../../../const/SESSION_SCORE_RELEVANT_FIELDS";
import {calculateSessionScore} from "../../../utils/calculateSessionScore";

/**
 * Recalcula analytics.score de una sesión cuando cambia algún campo relevante.
 *
 * Sin bucle: escribe analytics.score y updatedAt en la sesión, pero ninguno
 * de esos campos está en SESSION_SCORE_RELEVANT_FIELDS, así que el segundo
 * disparo del trigger detecta relevantChanged = false y retorna de inmediato.
 *
 * Sin colisión con aggregateSessionAnalytics: ese trigger lee registrations y
 * shares (no score), y su corte de idempotencia lo detiene si nada cambió.
 *
 * Las sesiones no tienen likes: el like vive en el evento padre (un mismo usuario
 * dando like al evento y a una fecha contaría dos veces).
 */
export const recalculateSessionScore = onDocumentWritten(
  {
    document: "events/{eventId}/sessions/{sessionId}",
    database: "quehaypahacer-db",
  },
  async (documentEvent) => {
    const {eventId, sessionId} = documentEvent.params;

    try {
      const before = documentEvent.data?.before.data();
      const after = documentEvent.data?.after.data();

      if (!after) {
        // Sesión eliminada: cascadeDeleteEventInteractions o borrado manual.
        logger.info("[recalculateSessionScore] Sesión eliminada, omitiendo", {
          sessionId,
          eventId,
        });
        return;
      }

      const sessionRef = documentEvent.data?.after.ref;
      if (!sessionRef) {
        logger.error("[recalculateSessionScore] No se pudo obtener la ref");
        return;
      }

      // Normaliza Timestamps a millis para comparar por valor, no por referencia.
      const normalize = (v: unknown) => {
        if (v && typeof (v as {toMillis?: unknown}).toMillis === "function") {
          return (v as {toMillis: () => number}).toMillis();
        }
        return v;
      };

      const relevantChanged = SESSION_SCORE_RELEVANT_FIELDS.some((field) => {
        const bv = normalize(getNestedValue(before ?? {}, field));
        const av = normalize(getNestedValue(after, field));
        if (bv !== av) {
          logger.info(`[recalculateSessionScore] Campo cambió: ${field}`, {
            before: bv,
            after: av,
          });
        }
        return bv !== av;
      });

      if (!relevantChanged) {
        logger.info(
          "[recalculateSessionScore] Sin cambios relevantes, omitiendo",
          {sessionId, eventId},
        );
        return;
      }

      const score = calculateSessionScore(
        after as Parameters<typeof calculateSessionScore>[0],
      );

      logger.info("[recalculateSessionScore] Score calculado", {
        sessionId,
        eventId,
        score,
      });

      if (score === 0) {
        logger.info(
          "[recalculateSessionScore] Score es 0, no se actualiza",
          {sessionId},
        );
        return;
      }

      await sessionRef.update({
        "analytics.score": score,
        "updatedAt": Timestamp.now(),
      });

      logger.info("[recalculateSessionScore] Score actualizado", {
        sessionId,
        eventId,
        score,
      });
    } catch (error) {
      logger.error("[recalculateSessionScore] Error en trigger", {
        sessionId,
        eventId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : "Sin stack",
      });
      throw error;
    }
  },
);
