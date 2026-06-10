import {onDocumentWritten} from "firebase-functions/firestore";
import {logger} from "firebase-functions";
import {
  FirebaseEventInteractionDto,
} from "../../../types/user/EventInteraction";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "../../../config/firebase";
import {calculateDelta} from "../../../utils/calculateDelta";
import {getEvent} from "../../events/helpers/getEvent";

export const syncUserPreference = onDocumentWritten(
  {
    document: "users/{userId}/eventInteractions/{interactionId}",
    database: "quehaypahacer-db",
  },
  async (event) => {
    try {
      const userId = event.params.userId;
      const interactionId = event.params.interactionId;
      logger.info("[syncUserPreference] Iniciando trigger", {
        userId,
        interactionId,
      });

      const before = event.data?.before.data() as
        | FirebaseEventInteractionDto
        | undefined;
      const after = event.data?.after.data() as
        | FirebaseEventInteractionDto
        | undefined;

      logger.info("[syncUserPreference] Datos del evento de interacción", {
        beforeExists: !!before,
        afterExists: !!after,
      });

      if (!after) {
        logger.info("[syncUserPreference] No hay datos 'after', finalizando");
        return;
      }

      logger.info("[syncUserPreference] Obteniendo datos del evento", {
        eventId: after.eventId,
      });
      const eventData = await getEvent(after.eventId);
      logger.info("[syncUserPreference] Datos del evento obtenidos", {
        eventDataExists: !!eventData,
      });

      const categoryId = eventData?.categoryInfo?.id;
      const categorySlug = eventData?.categoryInfo?.slug;
      const categoryTitle = eventData?.categoryInfo?.title;

      logger.info("[syncUserPreference] Categoría encontrada", {categoryId});

      if (!categoryId) {
        logger.info("[syncUserPreference] No hay categoryId, finalizando");
        return;
      }

      const delta = calculateDelta(before, after);
      logger.info("[syncUserPreference] Delta calculado", {delta});

      if (delta === 0) {
        logger.info("[syncUserPreference] Delta es 0, finalizando");
        return;
      }

      const prefRef = db.doc(`users/${userId}/preferences/categories`);
      logger.info(`[syncUserPreference] Actualizando 
        preferencias del usuario
        ${delta} ${categoryId}
        `);

      await prefRef.set(
        {
          userId,
          updatedAt: FieldValue.serverTimestamp(),
          categories: {
            [categoryId]: {
              score: FieldValue.increment(delta),
              interactionCount: FieldValue.increment(1),
              slug: categorySlug,
              title: categoryTitle,
              lastInteractionAt: FieldValue.serverTimestamp(),
            },
          },
        },
        {merge: true},
      );

      logger.info("[syncUserPreference] Trigger completado exitosamente", {
        userId,
      });
    } catch (error) {
      logger.error("[syncUserPreference] Error en trigger", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  },
);
