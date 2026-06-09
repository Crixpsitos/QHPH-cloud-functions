import type {Events} from "../types/event/Event";

type CacheEntry = {
  data: Events;
  expiresAt: number;
};

const CACHE_TTL = 30 * 60 * 1000;

const cache = new Map<string, CacheEntry>();

export const getCachedEvent = (
  eventId: string,
): Events | null => {
  const cached = cache.get(eventId);

  if (!cached) return null;

  if (cached.expiresAt < Date.now()) {
    cache.delete(eventId);
    return null;
  }

  return cached.data;
};

export const setCachedEvent = (
  eventId: string,
  data: Events,
) => {
  cache.set(eventId, {
    data,
    expiresAt: Date.now() + CACHE_TTL,
  });
};

export const invalidateCachedEvent = (
  eventId: string,
) => {
  cache.delete(eventId);
};
