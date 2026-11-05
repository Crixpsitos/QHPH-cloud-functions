import assert from "node:assert/strict";
import test from "node:test";
import {randomBytes} from "node:crypto";
import sharp from "sharp";

import {encodeWebp, EVENT_IMAGE_OPTIONS} from "./encodeWebp";

const photo = (width: number, height: number) =>
  sharp({
    create: {width, height, channels: 3, background: {r: 120, g: 80, b: 200}},
  }).jpeg().toBuffer();

const dims = async (buf: Buffer) => {
  const m = await sharp(buf).metadata();
  return {width: m.width, height: m.height, format: m.format};
};

test("las imágenes de evento se guardan hasta 1920 px de ancho en WebP", async () => {
  const out = await encodeWebp(await photo(3000, 2000), EVENT_IMAGE_OPTIONS);
  assert.deepEqual(await dims(out), {width: 1920, height: 1280, format: "webp"});
});

test("nunca amplía una imagen más pequeña que el máximo", async () => {
  const out = await encodeWebp(await photo(800, 600), EVENT_IMAGE_OPTIONS);
  assert.deepEqual(await dims(out), {width: 800, height: 600, format: "webp"});
});

test("los defaults de eventos son 1920 px y calidad 90", () => {
  assert.equal(EVENT_IMAGE_OPTIONS.maxWidth, 1920);
  assert.equal(EVENT_IMAGE_OPTIONS.quality, 90);
});

test("una calidad mayor produce un archivo más pesado (la opción se aplica)", async () => {
  // ruido para que la calidad se note en el peso
  const noise = await sharp(randomBytes(600 * 600 * 3), {
    raw: {width: 600, height: 600, channels: 3},
  }).jpeg().toBuffer();
  const low = await encodeWebp(noise, {maxWidth: 1920, quality: 60});
  const high = await encodeWebp(noise, {maxWidth: 1920, quality: 95});
  assert.ok(high.length > low.length);
});
