// Lógica pura de avisos (sin Firestore ni red): decide a quién avisar y qué decirle comparando
// el documento antes/después de una escritura. Se prueba en notices.test.ts.
// Los textos y tipos deben calzar con los de la app (domain/entities/notification/Notification.ts).

export interface Notice {
  title: string;
  body?: string;
  href?: string;
}

export interface Outgoing {
  uid: string;
  type: string;
  // Parte del id del aviso (idempotencia ante reintentos de la función).
  key: string;
  notice: Notice;
}

type Doc = Record<string, unknown>;

const ROLE_LABEL: Record<string, string> = {
  editor: "Editor",
  viewer: "Lector",
  checkin: "Control de acceso",
  credit: "Solo crédito",
};

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const asDoc = (v: unknown): Doc => (v && typeof v === "object" ? (v as Doc) : {});
const authorOf = (d: Doc): string | undefined => str(asDoc(d.author).id);

// --- Sitios ---

// Aviso al autor: moderación (aprobado / no aprobado / dado de baja) o despublicado.
// La moderación manda si cambian las dos cosas a la vez.
export const siteNotices = (before: Doc, after: Doc): Outgoing[] => {
  const uid = authorOf(after);
  if (!uid) return [];
  const name = str(after.name) ?? "tu sitio";
  const reason = str(after.rejectionReason);
  const from = before.moderationStatus;
  const to = after.moderationStatus;
  const send = (key: string, notice: Notice): Outgoing[] => [{uid, type: "site_moderation", key, notice}];

  if (from !== to) {
    if (to === "approved" && from === "pending") {
      return send("approved", {
        title: `Aprobaron tu sitio "${name}"`,
        body: "Ya aparece en ¿Dónde ir?.",
        href: str(after.slug) ? `/donde-ir/${str(after.slug)}` : "/donde-ir",
      });
    }
    if (to === "rejected" && from === "pending") {
      return send("rejected", {title: `No aprobaron tu sitio "${name}"`, body: reason, href: "/sites"});
    }
    if (to === "rejected" && from === "approved") {
      return send("taken-down", {title: `Dieron de baja tu sitio "${name}"`, body: reason, href: "/sites"});
    }
    return [];
  }
  if (before.publicationStatus === "published" && after.publicationStatus === "draft") {
    return send("unpublished", {
      title: `Tu sitio "${name}" ya no está publicado`,
      body: "Dejó de aparecer en ¿Dónde ir?. Puedes volver a publicarlo desde Mis sitios.",
      href: "/sites",
    });
  }
  return [];
};

// ¿Cambió algo que decide si el público ve la ficha? (para refrescar la caché de la app)
export const siteVisibilityChanged = (before: Doc, after: Doc): boolean =>
  before.moderationStatus !== after.moderationStatus ||
  before.publicationStatus !== after.publicationStatus ||
  before.isActive !== after.isActive;

// --- Eventos ---

const memberMap = (d: Doc): Map<string, Doc> => {
  const list = Array.isArray(d.collaborators) ? (d.collaborators as Doc[]) : [];
  return new Map(
    list
      .filter((c) => c && c.kind === "user" && typeof c.refId === "string")
      .map((c) => [c.refId as string, c] as [string, Doc]),
  );
};
const roleOf = (d: Doc, uid: string): string | undefined => str(asDoc(asDoc(d.collaboratorsData)[uid]).role);

// Avisos de un evento: baja (publicado → rechazado) al autor y altas/bajas del equipo a cada persona.
// El rechazo de un evento pendiente lo avisa el webhook de moderación de la app, no esta función.
export const eventNotices = (eventId: string, before: Doc, after: Doc): Outgoing[] => {
  const out: Outgoing[] = [];
  const owner = authorOf(after);
  const title = str(after.title) ?? "un evento";

  const wasPublic = before.status === "published" && before.moderationStatus === "approved";
  const nowDown = after.moderationStatus === "rejected" || after.status === "rejected";
  if (owner && wasPublic && nowDown) {
    out.push({
      uid: owner,
      type: "event_moderation",
      key: "taken-down",
      notice: {
        title: `Dieron de baja tu evento "${title}"`,
        body: str(after.rejectionReason),
        href: `/eventos/${eventId}/edit`,
      },
    });
  }

  const was = memberMap(before);
  const now = memberMap(after);
  for (const uid of now.keys()) {
    if (was.has(uid) || uid === owner) continue;
    const role = roleOf(after, uid);
    const credit = role === "credit";
    out.push({
      uid,
      type: "team_added",
      key: "added",
      notice: credit ?
        {title: `Te acreditaron en "${title}"`, body: "Apareces en el equipo del evento."} :
        {
          title: `Te agregaron al equipo de "${title}"`,
          body: role ? `Tu rol: ${ROLE_LABEL[role] ?? role}.` : undefined,
          href: "/studio/events",
        },
    });
  }
  for (const uid of was.keys()) {
    if (now.has(uid) || uid === owner) continue;
    out.push({
      uid,
      type: "team_removed",
      key: "removed",
      notice: {title: `Ya no formas parte del equipo de "${title}"`},
    });
  }
  return out;
};

// ¿Cambió algo que decide si el público ve el evento? (para refrescar la caché de la app)
export const eventVisibilityChanged = (before: Doc, after: Doc): boolean =>
  before.moderationStatus !== after.moderationStatus || before.status !== after.status;
