import {onDocumentDeleted} from "firebase-functions/firestore";
import {logger} from "firebase-functions";
import {db} from "../../../config/firebase";
import type {DocumentReference, Query} from "firebase-admin/firestore";

const BATCH_SIZE = 500;

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

export const cascadeDeleteSiteInteractions = onDocumentDeleted(
  {
    document: "sites/{siteId}",
    database: "quehaypahacer-db",
    maxInstances: 3,
    concurrency: 2,
    memory: "256MiB",
    timeoutSeconds: 300,
  },
  async (event) => {
    const {siteId} = event.params;
    logger.info("[cascadeDeleteSiteInteractions] Iniciando limpieza", {siteId});

    const deleted = await deleteQueryInBatches(
      db.collection("sites").doc(siteId).collection("interactions"),
    );

    logger.info("[cascadeDeleteSiteInteractions] Limpieza completada", {
      siteId,
      deleted,
    });
  },
);
