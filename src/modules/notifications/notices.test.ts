import {test} from "node:test";
import assert from "node:assert/strict";
import {eventNotices, eventVisibilityChanged, siteNotices, siteVisibilityChanged} from "./notices";

const site = (o: Record<string, unknown>) => ({name: "Café", author: {id: "au"}, slug: "cafe-1", ...o});
const keys = (o: {key: string}[]) => o.map((n) => n.key);

test("sitio: aprobado, no aprobado y baja", () => {
  const ok = siteNotices(site({moderationStatus: "pending"}), site({moderationStatus: "approved"}));
  assert.deepEqual(keys(ok), ["approved"]);
  assert.equal(ok[0].uid, "au");
  assert.equal(ok[0].notice.href, "/donde-ir/cafe-1");

  const no = siteNotices(site({moderationStatus: "pending"}),
    site({moderationStatus: "rejected", rejectionReason: "Sin fuentes"}));
  assert.deepEqual(keys(no), ["rejected"]);
  assert.equal(no[0].notice.body, "Sin fuentes");

  const down = siteNotices(site({moderationStatus: "approved"}), site({moderationStatus: "rejected"}));
  assert.deepEqual(keys(down), ["taken-down"]);
});

test("sitio: despublicar avisa, también si lo hizo el propio autor", () => {
  const n = siteNotices(site({publicationStatus: "published"}), site({publicationStatus: "draft"}));
  assert.deepEqual(keys(n), ["unpublished"]);
  assert.match(n[0].notice.title, /ya no está publicado/);
});

test("sitio: otras transiciones no avisan", () => {
  assert.deepEqual(siteNotices(site({moderationStatus: "approved"}), site({moderationStatus: "pending"})), []);
  assert.deepEqual(siteNotices(site({publicationStatus: "draft"}), site({publicationStatus: "published"})), []);
  assert.deepEqual(siteNotices(site({name: "A"}), site({name: "B"})), []);
  assert.deepEqual(siteNotices(site({moderationStatus: "pending"}), {moderationStatus: "approved"}), []); // sin autor
});

test("sitio: la moderación manda si cambian las dos cosas", () => {
  const n = siteNotices(site({moderationStatus: "approved", publicationStatus: "published"}),
    site({moderationStatus: "rejected", publicationStatus: "draft"}));
  assert.deepEqual(keys(n), ["taken-down"]);
});

test("sitio: visibilidad cambia con moderación, publicación o isActive", () => {
  assert.equal(siteVisibilityChanged(site({isActive: true}), site({isActive: false})), true);
  assert.equal(siteVisibilityChanged(site({publicationStatus: "published"}), site({publicationStatus: "draft"})), true);
  assert.equal(siteVisibilityChanged(site({name: "A"}), site({name: "B"})), false);
});

const ev = (o: Record<string, unknown>) => ({title: "Salsa", author: {id: "own"}, ...o});
const team = (members: Record<string, string>, extra: unknown[] = []) => ({
  collaborators: [...Object.keys(members).map((refId) => ({refId, kind: "user"})), ...extra],
  collaboratorsData: Object.fromEntries(Object.entries(members).map(([k, role]) => [k, {role}])),
});

test("evento: agregan y quitan personas del equipo", () => {
  const added = eventNotices("e1", ev(team({})), ev(team({u1: "editor"})));
  assert.deepEqual(keys(added), ["added"]);
  assert.equal(added[0].uid, "u1");
  assert.equal(added[0].type, "team_added");
  assert.equal(added[0].notice.body, "Tu rol: Editor.");

  const removed = eventNotices("e1", ev(team({u1: "editor", u2: "viewer"})), ev(team({u2: "viewer"})));
  assert.deepEqual(removed.map((n) => [n.uid, n.type]), [["u1", "team_removed"]]);
});

test("evento: acreditar (solo crédito) usa otro texto y sin enlace al Studio", () => {
  const n = eventNotices("e1", ev(team({})), ev(team({u1: "credit"})));
  assert.match(n[0].notice.title, /acreditaron/);
  assert.equal(n[0].notice.href, undefined);
});

test("evento: ignora al dueño, a los externos y los cambios sin diferencia", () => {
  assert.deepEqual(eventNotices("e1", ev(team({})), ev(team({own: "editor"}))), []);
  assert.deepEqual(eventNotices("e1", ev(team({})), ev(team({}, [{refId: "x", kind: "external"}]))), []);
  // cambio de rol: lo avisa la app, no la función
  assert.deepEqual(eventNotices("e1", ev(team({u1: "viewer"})), ev(team({u1: "editor"}))), []);
});

test("evento: baja solo si estaba publicado; el rechazo de uno pendiente lo avisa el webhook", () => {
  const down = eventNotices("e1", ev({status: "published", moderationStatus: "approved"}),
    ev({status: "rejected", moderationStatus: "rejected", rejectionReason: "Fraude"}));
  assert.deepEqual(down.map((n) => [n.uid, n.type, n.key]), [["own", "event_moderation", "taken-down"]]);
  assert.equal(down[0].notice.body, "Fraude");
  assert.equal(down[0].notice.href, "/eventos/e1/edit");

  assert.deepEqual(eventNotices("e1", ev({status: "pending", moderationStatus: "pending"}),
    ev({status: "rejected", moderationStatus: "rejected"})), []);
});

test("evento: un evento nuevo con equipo avisa a todos", () => {
  const n = eventNotices("e1", {}, ev(team({u1: "viewer", u2: "checkin"})));
  assert.deepEqual(n.map((x) => x.uid).sort(), ["u1", "u2"]);
});

test("evento: visibilidad cambia con status o moderación", () => {
  assert.equal(eventVisibilityChanged(ev({status: "published"}), ev({status: "rejected"})), true);
  assert.equal(eventVisibilityChanged(ev({title: "A"}), ev({title: "B"})), false);
});
