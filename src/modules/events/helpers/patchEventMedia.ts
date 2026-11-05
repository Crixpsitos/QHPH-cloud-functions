import {logger} from "firebase-functions";

/**
 * El cliente guarda el item de `media` en Firestore y sube el archivo casi a la
 * vez; si el trigger llega antes, el item aún no existe. Dentro de esta ventana
 * se lanza para que `retry: true` reintente; pasada, se registra como error.
 * ponytail: ventana fija de 5 min, subir si el wizard tarda más en guardar.
 */
export const RETRY_WINDOW_MS = 5 * 60 * 1000;

/** Señal de reintento: el trigger debe relanzarla sin marcar el item como error. */
export class MediaNotPersistedError extends Error {}

type Snap = {exists: boolean; data(): {media?: MediaItem[]} | undefined};
type Tx = {
  get(ref: unknown): Promise<Snap>;
  update(ref: unknown, data: unknown): void;
};
type Db = {
  doc(path: string): unknown;
  runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
};
type MediaItem = {id?: string; data: Record<string, unknown>};

interface Options {
  db: Db;
  eventId: string;
  filePath: string;
  /** `timeCreated` del objeto en Storage. */
  uploadedAt: Date;
  patch: (data: Record<string, unknown>) => Record<string, unknown>;
  /** false al marcar error: nunca debe lanzar y tapar el error original. */
  retryIfMissing?: boolean;
  now?: () => number;
}

/**
 * Parchea en transacción el item de `events/{id}.media` cuyo `data.path`
 * coincide con `filePath`.
 * @param {Options} o parámetros
 * @return {Promise<boolean>} true si encontró y actualizó el item
 */
export async function patchEventMedia(o: Options): Promise<boolean> {
  const {db, eventId, filePath, uploadedAt, patch} = o;
  const now = o.now ?? Date.now;

  const found = await db.runTransaction(async (tx) => {
    const ref = db.doc(`events/${eventId}`);
    const snap = await tx.get(ref);
    const media = snap.exists ? (snap.data()?.media ?? []) : [];
    const i = media.findIndex((m) => m.data?.path === filePath);
    if (i === -1) return false;

    media[i].data = patch(media[i].data);
    tx.update(ref, {media});
    return true;
  });
  if (found) return true;

  const young = now() - uploadedAt.getTime() < RETRY_WINDOW_MS;
  if (o.retryIfMissing !== false && young) {
    throw new MediaNotPersistedError(
      `media item not persisted yet: ${filePath}`,
    );
  }
  const log = o.retryIfMissing === false ? logger.warn : logger.error;
  log(`No media item found for path: ${filePath}`);
  return false;
}
