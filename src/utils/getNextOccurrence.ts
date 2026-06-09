import {Events} from "../types/event/Event";

export const getNextOccurrence = (event: Events) => {
  if (!event) return;

  if (event.occurrences && event.occurrences.length > 0) {
    const nextOccurrence = event.occurrences
      .filter((o) => o.startDate.toMillis() > Date.now())
      .sort((a, b) => a.startDate.toMillis() - b.startDate.toMillis())[0];

    if (nextOccurrence) return nextOccurrence.startDate;
  }

  return event.startDate;
};
