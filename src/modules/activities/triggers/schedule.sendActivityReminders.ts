import {onSchedule} from "firebase-functions/v2/scheduler";
import {logger} from "firebase-functions";
import {revalidateSecret} from "../../notifications/deliver";

const REQUEST_TIMEOUT_MS = 150_000; // < timeoutSeconds de la función

/**
 * Cada día a las 7:00 (Bogotá) le pide a la app el barrido de avisos «mañana sale…» de actividades
 * (campanita): POST `${REVALIDATE_APP_URL}/api/activities/reminders` con el mismo secreto de los avisos.
 * La app decide a quién avisar y es idempotente (un aviso por persona y día), así que reintentar es seguro.
 * Después pide la corrida del correo (`/api/email/run`): arma «Para ti» y el resumen semanal y vacía la cola de envío
 * (los avisos de reservas ya quedaron en la cola durante el barrido). Si el correo falla, el barrido NO se reintenta.
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

    try {
      const mail = await fetch(`${base.replace(/\/$/, "")}/api/email/run`, {
        method: "POST",
        headers: {authorization: `Bearer ${secret}`},
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      logger.info("[sendActivityReminders] correo", {status: mail.status, body: await mail.json().catch(() => ({}))});
    } catch (e) {
      const error = e instanceof Error ? e.message : "error";
      logger.error("[sendActivityReminders] la corrida de correo falló", {error});
    }
  },
);
