import assert from "node:assert/strict";
import test from "node:test";

import {applyMarker} from "./markerMedia";

const marker = {url: "https://x.test/marker.webp", path: "m"};
const media = () => [
  {id: "a", isCover: true, path: "p/a", status: "ready", markerUrl: null},
  {id: "b", isCover: false, path: "p/b", status: "ready", markerUrl: null},
  {id: "c", isCover: false, path: "p/c", status: "processing", markerUrl: null},
];

test("pone el marcador solo en la portada y conserva el resto intacto", () => {
  const next = applyMarker(media(), {id: "a", path: "p/a"}, marker);
  assert.deepEqual(next?.map((m) => m.markerUrl), [marker, null, null]);
  assert.deepEqual(next?.map((m) => m.status), ["ready", "ready", "processing"]);
});

test("no escribe si la portada ya tiene ese marcador", () => {
  const m = media();
  m[0].markerUrl = marker as never;
  assert.equal(applyMarker(m, {id: "a", path: "p/a"}, marker), null);
});

test("no escribe si la portada cambió mientras se generaba el marcador", () => {
  assert.equal(applyMarker(media(), {id: "a", path: "p/otra"}, marker), null);
  assert.equal(applyMarker(media(), {id: "zzz", path: "p/a"}, marker), null);
});

test("sin portada limpia todos los marcadores", () => {
  const m = media();
  m[0].markerUrl = marker as never;
  assert.deepEqual(applyMarker(m, null, null)?.map((x) => x.markerUrl), [null, null, null]);
});
