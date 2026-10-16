import {onDocumentWritten} from "firebase-functions/firestore";
import {logger} from "firebase-functions";
import {deliver, revalidateApp, revalidateSecret} from "../../notifications/deliver";
import {siteNotices, siteVisibilityChanged} from "../../notifications/notices";

// Avisa al autor cuando cambia la moderación de su sitio (la decisión se toma a mano en Firestore o con el futuro
// panel; este trigger cubre ambos caminos) o cuando el sitio deja de estar publicado, y refresca la caché de la app.
//   pending  -> approved : aprobado
//   pending  -> rejected : no aprobado (con motivo)
//   approved -> rejected : dado de baja (con motivo)
//   published -> draft   : ya no está publicado (lo haya hecho el autor o alguien más)
// Editar un sitio aprobado lo devuelve a revisión y no avisa. Ver notices.ts.
export const notifySiteModeration = onDocumentWritten(
  {
    document: "sites/{siteId}",
    database: "quehaypahacer-db",
    secrets: [revalidateSecret],
  },
  async (documentEvent) => {
    const before = documentEvent.data?.before.data();
    const after = documentEvent.data?.after.data();
    if (!before || !after) return; // creado o eliminado

    const siteId = documentEvent.params.siteId;
    const notices = siteNotices(before, after);
    await deliver(documentEvent.id, notices);
    if (notices.length) logger.info("Aviso de sitio", {siteId, avisos: notices.map((n) => n.key)});

    // Cualquier cambio de visibilidad (también los que no avisan) cambia lo que ve el público.
    if (siteVisibilityChanged(before, after)) {
      const authorId = (after.author as {id?: string} | undefined)?.id;
      await revalidateApp("sites", siteId, authorId ? [authorId] : []);
    }
  },
);
