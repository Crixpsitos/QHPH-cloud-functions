import assert from "node:assert/strict";
import test from "node:test";

import {
  patchEventMedia,
  MediaNotPersistedError,
  RETRY_WINDOW_MS,
} from "./patchEventMedia";

type Doc = {media: {id: string; data: Record<string, unknown>}[]} | null;

// Firestore falso en memoria: un solo documento y transacción trivial.
const fakeDb = (doc: Doc) => {
  const writes: unknown[] = [];
  const db = {
    doc: (p: string) => p,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runTransaction: async <T>(fn: (tx: any) => Promise<T>) =>
      fn({
        get: async () => ({exists: doc !== null, data: () => doc}),
        update: (_ref: string, data: unknown) => writes.push(data),
      }),
  };
  return {db, writes};
};

const NOW = Date.parse("2026-11-05T12:00:00Z");
const item = (path: string) => ({id: "m1", data: {path, status: "processing"}});
const ready = (d: Record<string, unknown>) => ({...d, status: "ready"});

test("item presente: lo parchea y devuelve true", async () => {
  const {db, writes} = fakeDb({media: [item("p/a")]});
  const found = await patchEventMedia({
    db, eventId: "E", filePath: "p/a", uploadedAt: new Date(NOW), patch: ready, now: () => NOW,
  });
  assert.equal(found, true);
  assert.deepEqual(writes, [{media: [{id: "m1", data: {path: "p/a", status: "ready"}}]}]);
});

test("item ausente y objeto joven: lanza para que el trigger reintente", async () => {
  const {db, writes} = fakeDb({media: []});
  await assert.rejects(
    patchEventMedia({
      db, eventId: "E", filePath: "p/a", uploadedAt: new Date(NOW - 1000), patch: ready, now: () => NOW,
    }),
    MediaNotPersistedError,
  );
  assert.deepEqual(writes, []);
});

test("el documento aún no existe y el objeto es joven: también reintenta", async () => {
  const {db} = fakeDb(null);
  await assert.rejects(
    patchEventMedia({
      db, eventId: "E", filePath: "p/a", uploadedAt: new Date(NOW - 1000), patch: ready, now: () => NOW,
    }),
    /not persisted yet/,
  );
});

test("item ausente y objeto viejo: no lanza (evita reintentar días) y devuelve false", async () => {
  const {db} = fakeDb({media: []});
  const found = await patchEventMedia({
    db, eventId: "E", filePath: "p/a",
    uploadedAt: new Date(NOW - RETRY_WINDOW_MS - 1), patch: ready, now: () => NOW,
  });
  assert.equal(found, false);
});

test("retryIfMissing:false (marcar error) nunca lanza aunque el objeto sea joven", async () => {
  const {db} = fakeDb({media: []});
  const found = await patchEventMedia({
    db, eventId: "E", filePath: "p/a", uploadedAt: new Date(NOW),
    patch: ready, retryIfMissing: false, now: () => NOW,
  });
  assert.equal(found, false);
});
