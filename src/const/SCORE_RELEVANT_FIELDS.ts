export const SCORE_RELEVANT_FIELDS = [
  "analytics.views",
  "analytics.shares",
  "analytics.likes",
  "analytics.registrations",
  "promotion.isPromoted",
  // Multi-date: las fechas se derivan de las sesiones y se escriben aparte;
  // incluirlas dispara el recálculo del score cuando cambia el rango.
  "startDate",
  "endDate",
  // Multi-date: registros y shares ocurren en las FECHAS, no en el evento.
  // `aggregateSessionAnalytics` los suma aquí; sin estos campos el score de un
  // multi-date nunca subiría por más demanda que tuvieran sus sesiones.
  "analytics.sessionRegistrations",
  "analytics.sessionShares",
];
