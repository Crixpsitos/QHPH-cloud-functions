/**
 * Campos que escribe `recalculateScoreAnalitycs` tras recalcular el score.
 * `updatedAt` solo se actualiza si cambió algo que NO es un contador
 * (`analytics.*`): cada visita/like/share cambia un contador, y `updatedAt` es
 * el `lastmod` del sitemap y dispara otros triggers; no debe moverse con cada
 * visita.
 * @param {number} score Score recién calculado.
 * @param {string[]} changedFields Campos relevantes que cambiaron.
 * @param {T} now Valor para `updatedAt` (Timestamp.now()).
 * @return {Record<string, number | boolean | T>} Campos a escribir.
 */
export function buildScoreUpdate<T>(
  score: number,
  changedFields: string[],
  now: T,
): Record<string, number | boolean | T> {
  const update: Record<string, number | boolean | T> = {
    "analytics.score": score,
    "metadata._meiliNeedsSync": true,
  };
  if (changedFields.some((f) => !f.startsWith("analytics."))) update.updatedAt = now;
  return update;
}
