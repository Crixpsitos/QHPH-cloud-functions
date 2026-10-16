import {logger} from "firebase-functions";
import {defineSecret} from "firebase-functions/params";
import {Timestamp, FieldValue} from "firebase-admin/firestore";
import {db} from "../../config/firebase";
import type {Outgoing} from "./notices";

// Secret Manager (firebase functions:secrets:set); los .env.* de este repo están versionados: no van secretos ahí.
export const revalidateSecret = defineSecret("SITE_REVALIDATE_WEBHOOK_SECRET");

const TTL_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const ALREADY_EXISTS = 6; // código gRPC de Firestore

const clip = (t: string, max: number) => (t.length > max ? `${t.slice(0, max - 1)}…` : t);

// Crea los avisos en users/{uid}/notifications (mismo formato que NotificationFirebaseRepository de la app).
// `eventId` (id del evento de Firestore que disparó la función) hace cada aviso idempotente ante reintentos.
export const deliver = async (eventId: string, outgoing: Outgoing[]): Promise<void> => {
  await Promise.all(outgoing.map(async ({uid, type, key, notice}) => {
    await db
      .collection("users").doc(uid)
      .collection("notifications").doc(`${key}-${eventId}`)
      .create({
        type,
        title: clip(notice.title, 120),
        ...(notice.body ? {body: clip(notice.body, 240)} : {}),
        ...(notice.href ? {href: notice.href} : {}),
        readAt: null,
        createdAt: FieldValue.serverTimestamp(),
        expireAt: Timestamp.fromMillis(Date.now() + TTL_DAYS * DAY_MS),
      })
      .catch((error: {code?: number}) => {
        if (error.code !== ALREADY_EXISTS) throw error;
      });
  }));
};

// Refresca las cachés de la app (ficha pública, listados) tras un cambio hecho fuera de ella: una baja no puede
// esperar a que expire la caché. Requiere REVALIDATE_APP_URL en el `.env.<proyecto>` y el secreto
// SITE_REVALIDATE_WEBHOOK_SECRET; sin ellos solo avisa en el log. Nunca lanza: no debe perder avisos ya creados.
export const revalidateApp = async (
  kind: "sites" | "events",
  id: string,
  authorIds: string[],
): Promise<void> => {
  const base = process.env.REVALIDATE_APP_URL;
  const secret = revalidateSecret.value();
  if (!base || !secret) {
    logger.warn("Revalidación de la app no configurada: la página pública puede tardar en reflejarlo", {kind, id});
    return;
  }
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/${kind}/revalidate`, {
      method: "POST",
      headers: {"content-type": "application/json", "authorization": `Bearer ${secret}`},
      body: JSON.stringify(kind === "sites" ? {siteId: id, authorIds} : {eventId: id, authorIds}),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) logger.warn("La app rechazó la revalidación", {kind, id, status: res.status});
  } catch (error) {
    logger.warn("No se pudo revalidar la app", {kind, id, error: String(error)});
  }
};
