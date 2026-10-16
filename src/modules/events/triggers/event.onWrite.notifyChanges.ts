import {onDocumentWritten} from "firebase-functions/firestore";
import {logger} from "firebase-functions";
import {deliver, revalidateApp, revalidateSecret} from "../../notifications/deliver";
import {eventNotices, eventVisibilityChanged} from "../../notifications/notices";

// Avisos de eventos que no pasan por una acción de la app (todo se compara antes/después del documento):
//   - al autor: el evento publicado se dio de baja (aprobado/publicado -> rechazado)
//   - a cada persona: la agregaron al equipo del evento (o la acreditaron) / la quitaron del equipo
// El rechazo de un evento PENDIENTE lo avisa el webhook /api/events/moderation de la app, no esta función.
// Tras una baja refresca la caché de la app. Ver notices.ts.
export const notifyEventChanges = onDocumentWritten(
  {
    document: "events/{eventId}",
    database: "quehaypahacer-db",
    secrets: [revalidateSecret],
  },
  async (documentEvent) => {
    const before = documentEvent.data?.before.data();
    const after = documentEvent.data?.after.data();
    if (!before || !after) return; // creado o eliminado

    const eventId = documentEvent.params.eventId;
    const notices = eventNotices(eventId, before, after);
    await deliver(documentEvent.id, notices);
    if (notices.length) logger.info("Aviso de evento", {eventId, avisos: notices.map((n) => n.key)});

    if (eventVisibilityChanged(before, after)) {
      const authorId = (after.author as {id?: string} | undefined)?.id;
      await revalidateApp("events", eventId, authorId ? [authorId] : []);
    }
  },
);
