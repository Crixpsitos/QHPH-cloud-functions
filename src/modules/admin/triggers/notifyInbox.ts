import {onDocumentCreated} from "firebase-functions/firestore";
import {logger} from "firebase-functions";

// Avisos de «bandeja de entrada» del panel de administración: cuando entra algo que una persona de QHPA debe atender
// (Contáctanos, soporte prioritario, reclamo de un sitio) se deja un log estructurado. Una alerta de Cloud Monitoring
// (ver scripts/setup-inbox-alert.sh en la app) filtra por `alert` y escribe al propietario por correo.
// Los logs NO llevan correo ni teléfono de la persona: el detalle se lee en el panel.
const snippet = (t: unknown, max = 120) => (typeof t === "string" ? t.slice(0, max) : null);

export const notifyNewContact = onDocumentCreated(
  {document: "contactos/{id}", database: "quehaypahacer-db"},
  (event) => {
    const d = event.data?.data();
    if (!d) return;
    logger.warn("Nuevo mensaje de Contáctanos", {
      alert: "qhpa_new_inbox", kind: "contactanos", id: event.params.id,
      reason: d.contactReason ?? null, message: snippet(d.message),
    });
  },
);

export const notifyNewSupportTicket = onDocumentCreated(
  {document: "supportTickets/{id}", database: "quehaypahacer-db"},
  (event) => {
    const d = event.data?.data();
    if (!d) return;
    logger.warn("Nuevo ticket de soporte prioritario", {
      alert: "qhpa_new_inbox", kind: "soporte", id: event.params.id,
      category: d.category ?? null, subject: snippet(d.subject),
    });
  },
);

export const notifyNewSiteClaim = onDocumentCreated(
  {document: "siteClaims/{id}", database: "quehaypahacer-db"},
  (event) => {
    const d = event.data?.data();
    if (!d) return;
    logger.warn("Nuevo reclamo de sitio", {
      alert: "qhpa_new_inbox", kind: "reclamo", id: event.params.id, siteName: snippet(d.siteName),
    });
  },
);
