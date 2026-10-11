import {onSchedule} from "firebase-functions/v2/scheduler";
import {logger} from "firebase-functions";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {db} from "../../../config/firebase";

/**
 * Baja a Básico las cuentas Premium cuyo `planExpiresAt` ya pasó (fase 1:
 * Premium se activa a mano con scripts/set-user-plan.ts en la app).
 * Deja auditoría en `planChanges`, igual que el script.
 */
export const expirePremiumPlans = onSchedule(
  {schedule: "every day 03:00", timeZone: "America/Bogota", maxInstances: 1},
  async () => {
    const now = Timestamp.now();
    // ponytail: un solo campo de rango (índice automático); `plan` se filtra en
    // memoria. Paginar si algún día vencen miles el mismo día.
    const snap = await db.collection("users")
      .where("planExpiresAt", "<=", now)
      .get();
    const expired = snap.docs.filter((d) => d.get("plan") === "premium");

    for (let i = 0; i < expired.length; i += 200) {
      const batch = db.batch();
      for (const doc of expired.slice(i, i + 200)) {
        batch.update(doc.ref, {
          plan: "basic",
          planSource: FieldValue.delete(),
          planExpiresAt: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        batch.set(db.collection("planChanges").doc(), {
          uid: doc.id,
          from: "premium",
          to: "basic",
          reason: "expired",
          previousExpiresAt: doc.get("planExpiresAt") ?? null,
          expiresAt: null,
          by: "expirePremiumPlans",
          source: "expirePremiumPlans",
          at: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }

    logger.info("[expirePremiumPlans] vencidos", {
      count: expired.length,
      uids: expired.map((d) => d.id),
    });
  },
);
