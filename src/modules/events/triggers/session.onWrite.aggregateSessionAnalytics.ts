import {onDocumentWritten} from "firebase-functions/firestore";
import {logger} from "firebase-functions";
import {db} from "../../../config/firebase";

/**
 * Agrega las métricas de las sesiones (multi-date) en el evento padre.
 *
 * Por qué existe: en un evento multi-date el registro y el share ocurren en cada
 * FECHA, no en el documento del evento, así que sus contadores propios se quedan
 * en 0 y el score nunca sube por más demanda que tengan sus fechas.
 *
 * Solo agrega ACCIONES (registros, shares). NO agrega likes a propósito: el like
 * es el ESTADO de una persona (el doc de interacción es su uid), así que sumar
 * el like del evento con el de una fecha contaría a la misma persona dos veces.
 * Por eso el like vive solo en el evento.
 *
 * Sin bucle de recálculo: este trigger escucha `events/{id}/sessions/{sid}` y
 * escribe en `events/{id}`. Esa escritura despierta a `recalculateScoreAnalitycs`
 * (que escucha el evento), el cual escribe también en `events/{id}` — nunca en
 * `sessions`, así que no vuelve a disparar a este.
 */
export const aggregateSessionAnalytics = onDocumentWritten(
  {
    document: "events/{eventId}/sessions/{sessionId}",
    database: "quehaypahacer-db",
  },
  async (documentEvent) => {
    const {eventId, sessionId} = documentEvent.params;

    try {
      // Se releen TODAS las sesiones en vez de aplicar el delta del before/after:
      // los deltas se desincronizan para siempre si un evento se pierde o se
      // reintenta (los triggers son at-least-once). Recalcular es idempotente.
      const sessions = await db
        .collection(`events/${eventId}/sessions`)
        .get();

      let sessionRegistrations = 0;
      let sessionShares = 0;

      sessions.docs.forEach((doc) => {
        // Las canceladas no cuentan como demanda vigente.
        if (doc.get("status") === "cancelled") return;
        sessionRegistrations += Number(doc.get("analytics.registrations") ?? 0);
        sessionShares += Number(doc.get("analytics.shares") ?? 0);
      });

      const eventRef = db.collection("events").doc(eventId);
      const eventSnap = await eventRef.get();
      if (!eventSnap.exists) {
        logger.info("[aggregateSessionAnalytics] El evento ya no existe", {
          eventId,
        });
        return;
      }

      const currentRegistrations = Number(
        eventSnap.get("analytics.sessionRegistrations") ?? 0
      );
      const currentShares = Number(
        eventSnap.get("analytics.sessionShares") ?? 0
      );

      // Corte del bucle: si el agregado no cambió, no se escribe. Sin esto, cada
      // escritura en el evento que toque una sesión volvería a escribir lo mismo.
      if (
        currentRegistrations === sessionRegistrations &&
        currentShares === sessionShares
      ) {
        logger.info("[aggregateSessionAnalytics] Agregado sin cambios", {
          eventId,
          sessionId,
          sessionRegistrations,
          sessionShares,
        });
        return;
      }

      await eventRef.update({
        "analytics.sessionRegistrations": sessionRegistrations,
        "analytics.sessionShares": sessionShares,
      });

      logger.info("[aggregateSessionAnalytics] Agregado actualizado", {
        eventId,
        sessionId,
        sessionRegistrations,
        sessionShares,
        sesiones: sessions.size,
      });
    } catch (error) {
      logger.error("[aggregateSessionAnalytics] Error agregando sesiones", {
        eventId,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
);
