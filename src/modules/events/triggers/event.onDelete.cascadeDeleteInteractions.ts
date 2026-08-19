import {onDocumentDeleted} from "firebase-functions/firestore";
import {logger} from "firebase-functions";
import {db} from "../../../config/firebase";
import type {DocumentReference, Query} from "firebase-admin/firestore";

const BATCH_SIZE = 500;

/**
/**
 * Elimina un lote de referencias en un batch de Firestore.
 * @param {DocumentReference[]} refs Referencias de documentos a eliminar.
 */
 * Elimina un conjunto de referencias en un WriteBatch.
 * @param {DocumentReference[]} refs - Array de referencias de documentos a eliminar.
 */
/**
 * Elimina un conjunto de referencias en un WriteBatch.
 * @param {DocumentReference[]} refs Array de referencias de documentos a eliminar.
 */
async function batchDelete(refs: DocumentReference[]): Promise<void> {
  const batch = db.batch();
  refs.forEach((ref) => batch.delete(ref));
  await batch.commit();
}

/**
 * Elimina todos los documentos que devuelve una Query, paginando
 * en lotes de BATCH_SIZE hasta que no queden documentos.
 *
 * Tras cada eliminación volvemos a ejecutar la misma query (sin cursor)
 * para obtener el siguiente lote: los documentos borrados ya no aparecen.
 * @param {Query} query - Query que devuelve los documentos a eliminar.
 */
/**
 * Elimina todos los documentos que devuelve una Query en lotes de BATCH_SIZE.
 * @param {Query} query Query que devuelve los documentos a eliminar.
 * @return {Promise<number>} Cantidad total de documentos eliminados.
 */
async function deleteQueryInBatches(query: Query): Promise<number> {
  let totalDeleted = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snapshot = await query.limit(BATCH_SIZE).get();
    if (snapshot.empty) break;

    const refs = snapshot.docs.map((d) => d.ref as DocumentReference);
    await batchDelete(refs);
    totalDeleted += refs.length;
  }

  return totalDeleted;
}

/**
 * Trigger: cuando se elimina un evento, limpia en cascada:
 *   1. Sub-colección de interacciones del evento →  events/{eventId}/interactions
 *   2. Proyecciones de interacción en usuarios    →  users/{uid}/eventInteractions/{eventId}
 *
 * Las dos limpiezas se ejecutan en paralelo (Promise.all).
 * Dentro de cada una los lotes de 500 se procesan secuencialmente.
 */
export const cascadeDeleteEventInteractions = onDocumentDeleted(
  {
    document: "events/{eventId}",
    database: "quehaypahacer-db",
    concurrency: 2,
    memory: "256MiB",
    timeoutSeconds: 300,
  },
  async (event) => {
    const {eventId} = event.params;

    logger.info(
      "[cascadeDeleteEventInteractions] Iniciando limpieza en cascada",
      {eventId},
    );

    const [interactionsDeleted, projectionsDeleted] = await Promise.all([
      deleteQueryInBatches(
        db.collection("events").doc(eventId).collection("interactions"),
      ),
      deleteQueryInBatches(
        db.collectionGroup("eventInteractions").where("eventId", "==", eventId),
      ),
    ]);

    logger.info(
      "[cascadeDeleteEventInteractions] Limpieza completada",
      {eventId, interactionsDeleted, projectionsDeleted},
    );
  },
);
