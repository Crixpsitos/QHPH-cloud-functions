import {db} from "../../../config/firebase";
import {getCachedEvent, setCachedEvent} from "../../../cache/eventCache";
import {Events} from "../../../types/event/Event";

export const getEvent = async (eventId: string) => {
  const cached = getCachedEvent(eventId);

  if (cached) {
    return cached;
  }

  const snap = await db.collection("events").doc(eventId).get();

  if (!snap.exists) {
    return null;
  }

  const data = snap.data() as Events;

  setCachedEvent(eventId, data);

  return data;
};
