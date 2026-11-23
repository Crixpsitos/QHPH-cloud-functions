import {onCall, HttpsError} from "firebase-functions/https";
import {defineSecret} from "firebase-functions/params";
import {logger} from "firebase-functions";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {db} from "../../config/firebase";
import {revalidateSecret} from "../notifications/deliver";

const moderationSecret = defineSecret("eventModerationWebhookSecret");

type Decision = "approved" | "rejected";
type Payload =
  | {action: "moderateEvent"; eventId: string; decision: Decision; reason?: string}
  | {action: "moderateActivity"; activityId: string; decision: Decision; reason?: string}
  | {action: "revalidate"; kind: "events" | "sites" | "activities"; id: string; authorIds?: string[];
    slug?: string; siteId?: string}
  | {action: "revalidateHome"}
  | {action: "revalidateConfig"; key: "holidays" | "transit"}
  | {action: "claimApprove"; claimId: string}
  | {action: "claimReject"; claimId: string; reason: string}
  | {action: "reviewResolve"; reviewId: string; outcome: "upheld" | "removed"; abusive?: boolean}
  | {action: "appealResolve"; reviewId: string; decision: "restore" | "reject"}
  | {action: "broadcastNotice"; title: string; body?: string; href?: string; audience: Audience; dryRun?: boolean};

type Audience = "all" | "premium" | "creators";

const post = async (path: string, secret: string, body: object) => {
  const base = process.env.REVALIDATE_APP_URL;
  if (!base) throw new HttpsError("failed-precondition", "REVALIDATE_APP_URL sin configurar");
  const res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: {"content-type": "application/json", "authorization": `Bearer ${secret}`},
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 200);
    try {
      detail = (JSON.parse(text) as {error?: string}).error ?? detail;
    } catch {
      // cuerpo que no es JSON: se deja el texto recortado
    }
    throw new HttpsError(res.status === 409 ? "failed-precondition" : "internal", detail);
  }
  return text ? JSON.parse(text) : {};
};

const NOTICE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const clip = (t: string, max: number) => (t.length > max ? `${t.slice(0, max - 1)}…` : t);

// Aviso de QHPA a todas las cuentas (o solo Premium / creadores) por la campanita. Una escritura por cuenta,
// con id fijo: reintentar no duplica.
const broadcast = async (
  by: string,
  p: {title: string; body?: string; href?: string; audience: Audience; dryRun?: boolean},
) => {
  const title = (p.title ?? "").trim();
  if (title.length < 3) throw new HttpsError("invalid-argument", "Escribe un título");
  if (p.href && !/^\/(?!\/)/.test(p.href)) {
    throw new HttpsError("invalid-argument", "El enlace debe ser una ruta interna (/…)");
  }
  let q: FirebaseFirestore.Query = db.collection("users");
  if (p.audience === "premium") q = q.where("plan", "==", "premium");
  if (p.audience === "creators") q = q.where("participation", "==", "creator");
  const uids = (await q.select().get()).docs.map((d) => d.id);
  if (p.dryRun) return {count: uids.length, sent: false};

  const noticeRef = db.collection("adminNotices").doc();
  const payload = {
    type: "admin_notice",
    title: clip(title, 120),
    ...(p.body?.trim() ? {body: clip(p.body.trim(), 240)} : {}),
    ...(p.href ? {href: p.href} : {}),
    readAt: null,
    expireAt: Timestamp.fromMillis(Date.now() + NOTICE_TTL_MS),
  };
  for (let i = 0; i < uids.length; i += 400) {
    const batch = db.batch();
    for (const uid of uids.slice(i, i + 400)) {
      batch.set(
        db.collection("users").doc(uid).collection("notifications").doc(`admin-notice-${noticeRef.id}`),
        {...payload, createdAt: FieldValue.serverTimestamp()},
      );
    }
    await batch.commit();
  }
  await noticeRef.set({
    title: payload.title, body: payload.body ?? null, href: p.href ?? null, audience: p.audience,
    count: uids.length, by, at: FieldValue.serverTimestamp(),
  });
  return {count: uids.length, sent: true, id: noticeRef.id};
};

// Puerta del panel de administración para lo que la app solo hace con webhooks (llevan secretos, que no pueden
// vivir en un sitio estático). Solo cuentas con el custom claim `admin: true`.
export const adminGateway = onCall(
  {secrets: [moderationSecret, revalidateSecret], timeoutSeconds: 120},
  async ({auth, data}: {auth?: {uid: string; token: Record<string, unknown>}; data: Payload}) => {
    if (auth?.token.admin !== true) throw new HttpsError("permission-denied", "Solo administradores");
    const reviewer = auth.uid;
    logger.info("adminGateway", {uid: reviewer, action: data?.action});
    const isDecision = (d: unknown) => d === "approved" || d === "rejected";

    switch (data?.action) {
    case "moderateEvent":
      if (!data.eventId || !isDecision(data.decision)) throw new HttpsError("invalid-argument", "Datos inválidos");
      if (data.decision === "rejected" && !data.reason?.trim()) {
        throw new HttpsError("invalid-argument", "El rechazo exige motivo");
      }
      return post("/api/events/moderation", moderationSecret.value(), {
        eventId: data.eventId, decision: data.decision, reason: data.reason?.trim(), reviewer,
      });
    case "moderateActivity":
      if (!data.activityId || !isDecision(data.decision)) throw new HttpsError("invalid-argument", "Datos inválidos");
      return post("/api/activities/moderation", revalidateSecret.value(), {
        activityId: data.activityId, decision: data.decision, reason: data.reason?.trim(), reviewer,
      });
    case "revalidate": {
      const authorIds = (data.authorIds ?? []).slice(0, 4);
      let body: object = {
        activityId: data.id, ownerIds: authorIds,
        ...(data.slug ? {slug: data.slug} : {}), ...(data.siteId ? {siteId: data.siteId} : {}),
      };
      if (data.kind === "sites") body = {siteId: data.id, authorIds};
      if (data.kind === "events") body = {eventId: data.id, authorIds};
      return post(`/api/${data.kind}/revalidate`, revalidateSecret.value(), body);
    }
    case "revalidateConfig":
      return post("/api/config/revalidate", revalidateSecret.value(), {key: data.key});
    case "revalidateHome":
    case "claimApprove":
    case "claimReject":
    case "reviewResolve":
    case "appealResolve":
      return post("/api/admin/ops", revalidateSecret.value(), {...data, reviewer});
    case "broadcastNotice":
      return broadcast(reviewer, data);
    default:
      throw new HttpsError("invalid-argument", "Acción desconocida");
    }
  },
);
