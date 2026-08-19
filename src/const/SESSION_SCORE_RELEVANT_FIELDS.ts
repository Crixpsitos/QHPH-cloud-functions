// Campos cuyo cambio dispara el recálculo del score de una sesión.
// analytics.score no está aquí: escribirlo no debe volver a disparar el trigger.
export const SESSION_SCORE_RELEVANT_FIELDS = [
  "analytics.views",
  "analytics.shares",
  "analytics.registrations",
  "startDate",
  "endDate",
  "status",
];
