import {Events} from "../types/event/Event";

export const getNextOccurrence = (event: Events) => {
  if (!event) return;

  if (event.occurrences && event.occurrences.length > 0) {
    const nextOccurrence = event.occurrences
      .filter((o) => o.startDate.toMillis() > Date.now())
      .sort((a, b) => a.startDate.toMillis() - b.startDate.toMillis())[0];

    if (nextOccurrence) return nextOccurrence.startDate;
  }

  // Evento en curso (empezó pero no ha terminado): usa endDate como fecha
  // relevante para no descartarlo con score 0. Aplica sobre todo a multi-date,
  // cuyo startDate es la PRIMERA sesión (puede haber pasado ya) mientras
  // quedan sesiones futuras hasta endDate (última sesión).
  const now = Date.now();
  if (
    event.startDate &&
    event.endDate &&
    event.startDate.toMillis() < now &&
    event.endDate.toMillis() > now
  ) {
    return event.endDate;
  }

  return event.startDate;
};
