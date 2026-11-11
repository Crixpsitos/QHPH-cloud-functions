import {onSchedule} from "firebase-functions/v2/scheduler";
import {logger} from "firebase-functions";
import {revalidateSecret} from "../../notifications/deliver";

const REQUEST_TIMEOUT_MS = 150_000; // < timeoutSeconds de la función

/**
 * Cada día a las 7:00 (Bogotá) le pide a la app el barrido de avisos «mañana sale…» de actividades
 * (campanita): POST `${REVALIDATE_APP_URL}/api/activities/reminders` con el mismo secreto de los avisos.
 * La app decide a quién avisar y es idempotente (un aviso por persona y día), así que reintentar es seguro.
 * Requiere REVALIDATE_APP_URL en el `.env.<proyecto>` y el secreto SITE_REVALIDATE_WEBHOOK_SECRET.
 */
export const sendActivityReminders = onSchedule(
  {
    schedule: "every day 07:00",
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
      logger.error("[sendActivityReminders] Falta REVALIDATE_APP_URL o el secreto: no se pudo pedir el barrido");
      return;
    }

    const res = await fetch(`${base.replace(/\/$/, "")}/api/activities/reminders`, {
      method: "POST",
      headers: {authorization: `Bearer ${secret}`},
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.error("[sendActivityReminders] La app rechazó el barrido", {status: res.status});
      throw new Error(`reminders sweep failed: ${res.status}`);
    }
    logger.info("[sendActivityReminders] listo", await res.json().catch(() => ({})));
  },
);
