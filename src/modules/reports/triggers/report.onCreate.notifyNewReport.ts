import {onDocumentCreated} from "firebase-functions/firestore";
import {logger} from "firebase-functions";

/**
 * Deja un log estructurado cuando entra un reporte de contenido
 * (colección `reports`, creada desde la app). Una alerta de Cloud Monitoring
 * (ver scripts/setup-report-alert.sh en la app) filtra por `alert` y le
 * escribe al propietario por correo, para atender el aviso lo antes posible.
 */
export const notifyNewReport = onDocumentCreated(
  {
    document: "reports/{reportId}",
    database: "quehaypahacer-db",
  },
  (event) => {
    const data = event.data?.data();
    if (!data) return;

    logger.warn("Nuevo reporte de contenido", {
      alert: "qhpa_new_report",
      reportId: event.params.reportId,
      targetType: data.targetType,
      targetId: data.targetId,
      targetTitle: data.targetTitle,
      reason: data.reason,
      // Recortado: es solo el aviso; el detalle se lee con scripts/list-reports.ts.
      details: typeof data.details === "string" ? data.details.slice(0, 200) : null,
    });
  },
);
