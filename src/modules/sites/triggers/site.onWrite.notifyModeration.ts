import {onDocumentWritten} from "firebase-functions/firestore";
import {logger} from "firebase-functions";
import {Timestamp, FieldValue} from "firebase-admin/firestore";
import {db} from "../../../config/firebase";

const TTL_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

interface Notice {
  title: string;
  body?: string;
  href?: string;
}

/**
 * Avisa al autor cuando la moderación de su sitio cambia (la decisión se toma
 * a mano en Firestore o con el futuro panel; este trigger cubre ambos caminos).
 * Escribe en `users/{uid}/notifications`, el mismo formato que la app
 * (ver NotificationFirebaseRepository). Solo avisa de:
 *   pending  -> approved : aprobado
 *   pending  -> rejected : no aprobado (con motivo)
 *   approved -> rejected : dado de baja (con motivo)
 * El resto de transiciones (p. ej. editar un sitio aprobado lo devuelve a
 * revisión) no genera aviso.
 */
export const notifySiteModeration = onDocumentWritten(
  {
    document: "sites/{siteId}",
    database: "quehaypahacer-db",
  },
  async (documentEvent) => {
    const before = documentEvent.data?.before.data();
    const after = documentEvent.data?.after.data();
    if (!before || !after) return; // creado o eliminado

    const from = before.moderationStatus;
    const to = after.moderationStatus;
    if (from === to) return;

    const authorId: string | undefined = after.author?.id;
    if (!authorId) return;

    const name = String(after.name ?? "tu sitio");
    const reason = typeof after.rejectionReason === "string" ? after.rejectionReason : undefined;
    let notice: Notice | null = null;

    if (to === "approved" && from === "pending") {
      notice = {
        title: `Aprobaron tu sitio "${name}"`,
        body: "Ya aparece en ¿Dónde ir?.",
        href: after.slug ? `/donde-ir/${after.slug}` : "/donde-ir",
      };
    } else if (to === "rejected" && from === "pending") {
      notice = {title: `No aprobaron tu sitio "${name}"`, body: reason, href: "/sites"};
    } else if (to === "rejected" && from === "approved") {
      notice = {title: `Dieron de baja tu sitio "${name}"`, body: reason, href: "/sites"};
    }
    if (!notice) return;

    const clip = (t: string, max: number) => (t.length > max ? `${t.slice(0, max - 1)}…` : t);
    await db
      .collection("users").doc(authorId)
      .collection("notifications").doc(`site-moderation-${documentEvent.id}`) // idempotente ante reintentos
      .create({
        type: "site_moderation",
        title: clip(notice.title, 120),
        ...(notice.body ? {body: clip(notice.body, 240)} : {}),
        ...(notice.href ? {href: notice.href} : {}),
        readAt: null,
        createdAt: FieldValue.serverTimestamp(),
        expireAt: Timestamp.fromMillis(Date.now() + TTL_DAYS * DAY_MS),
      })
      .catch((error: {code?: number}) => {
        if (error.code !== 6) throw error; // 6 = ya existe (reintento)
      });
    logger.info("Aviso de moderación de sitio", {siteId: documentEvent.params.siteId, from, to});
  },
);
