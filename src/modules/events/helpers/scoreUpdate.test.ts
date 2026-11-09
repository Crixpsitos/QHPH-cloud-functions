import test from "node:test";
import assert from "node:assert/strict";
import {buildScoreUpdate} from "./scoreUpdate";

const NOW = {now: true};

test("solo cambió analytics.*: NO toca updatedAt (el lastmod del sitemap no sigue a las visitas)", () => {
  const u = buildScoreUpdate(42, ["analytics.views"], NOW);
  assert.deepEqual(u, {"analytics.score": 42, "metadata._meiliNeedsSync": true});
  assert.ok(!("updatedAt" in u));
});

test("varios analytics.* tampoco tocan updatedAt", () => {
  const u = buildScoreUpdate(1, ["analytics.views", "analytics.likes", "analytics.sessionShares"], NOW);
  assert.ok(!("updatedAt" in u));
});

test("cambió algo que no es analytics (fechas, promoción): sí toca updatedAt", () => {
  assert.equal(buildScoreUpdate(1, ["startDate"], NOW).updatedAt, NOW);
  assert.equal(buildScoreUpdate(1, ["analytics.views", "promotion.isPromoted"], NOW).updatedAt, NOW);
});
