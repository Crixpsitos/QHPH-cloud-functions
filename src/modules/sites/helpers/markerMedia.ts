export interface MarkerRef {
  url: string;
  path: string;
}

interface MarkerItem {
  id: string;
  path?: string;
  isCover?: boolean;
  markerUrl?: MarkerRef | null;
}

/**
 * Pone el marcador solo en la portada y lo quita del resto.
 * Se aplica sobre el `media` FRESCO leído dentro de una transacción: así no pisa lo que el
 * optimizador de imágenes escribe en paralelo (status/path/url de otros ítems).
 * @param {MarkerItem[]} media media actual del sitio
 * @param {{id: string, path: string} | null} cover portada procesada; null = sitio sin portada
 * @param {MarkerRef | null} marker marcador generado para esa portada
 * @return {MarkerItem[] | null} el media nuevo, o null si no hay nada que escribir
 */
export function applyMarker<T extends MarkerItem>(
  media: T[],
  cover: { id: string; path: string } | null,
  marker: MarkerRef | null,
): T[] | null {
  let coverIndex = -1;
  if (cover) {
    coverIndex = media.findIndex(
      (m) => m.id === cover.id && m.isCover === true && m.path === cover.path,
    );
    // La portada cambió mientras se generaba el marcador: otra invocación se encarga.
    if (coverIndex === -1) return null;
  }
  const next = media.map((m, i) => ({
    ...m,
    markerUrl: i === coverIndex ? marker : null,
  }));
  const same = next.every(
    (m, i) => JSON.stringify(m.markerUrl ?? null) === JSON.stringify(media[i].markerUrl ?? null),
  );
  return same ? null : next;
}
