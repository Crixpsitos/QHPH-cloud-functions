import {onSchedule} from "firebase-functions/v2/scheduler";
import {logger} from "firebase-functions";
import {revalidateSecret} from "../../notifications/deliver";

const OVERDUE_ALERT_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 150_000; // < timeoutSeconds de la función

interface RecomputeResult {
  processed: number;
  changed: number;
  failed: number;
  remaining: number;
  oldestOverdueMs: number;
}

/**
 * Cada hora le pide a la app que recalcule los sitios cuyo conteo de eventos ya venció
 * (`analytics.eventCountValidUntil <= ahora`): POST `${REVALIDATE_APP_URL}/api/sites/recompute-expired` con el
 * mismo secreto de los avisos. La app hace el trabajo (puntaje, vencimiento nuevo, invalidar caché); aquí solo se
 * dispara y se vigila. `logger.error` si la app no responde 2xx o si algo lleva vencido más de 6 h (para alertar).
 * Requiere REVALIDATE_APP_URL en el `.env.<proyecto>` y el secreto SITE_REVALIDATE_WEBHOOK_SECRET.
 */
export const recomputeSiteEvents = onSchedule(
  {
    schedule: "every 60 minutes",
    timeZone: "America/Bogota",
    timeoutSeconds: 180,
    retryCount: 2,
    maxInstances: 1,
    secrets: [revalidateSecret],
  },
  async () => {
    const base = process.env.REVALIDATE_APP_URL;
    const secret = revalidateSecret.value();
    if (!base || !secret) {
      logger.error("[recomputeSiteEvents] Falta REVALIDATE_APP_URL o el secreto: no se pudo pedir el barrido");
      return;
    }

    const res = await fetch(`${base.replace(/\/$/, "")}/api/sites/recompute-expired`, {
      method: "POST",
      headers: {authorization: `Bearer ${secret}`},
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      logger.error("[recomputeSiteEvents] La app respondió con error", {status: res.status});
      // Lanza para que Cloud Scheduler reintente (retryCount) y quede marcada como fallida.
      throw new Error(`recompute-expired respondió ${res.status}`);
    }

    const result = await res.json() as RecomputeResult;
    logger.info("[recomputeSiteEvents] barrido", result);
    if (result.oldestOverdueMs > OVERDUE_ALERT_MS) {
      logger.error("[recomputeSiteEvents] Hay sitios con el conteo vencido hace más de 6 h", result);
    }
  },
);
