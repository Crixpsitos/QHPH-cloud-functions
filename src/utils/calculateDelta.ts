import {FirebaseEventInteractionDto} from "../types/user/EventInteraction";
import {WEIGHTS} from "../const/WEIGHTS";

export const calculateDelta = (
  before: FirebaseEventInteractionDto | undefined,
  after: FirebaseEventInteractionDto,
) => {
  let delta = 0;

  const likedBefore = before?.liked ?? false;
  const likedAfter = after?.liked ?? false;

  if (!likedBefore && likedAfter) delta += WEIGHTS.liked;
  if (likedBefore && !likedAfter) delta -= WEIGHTS.liked;

  if (!before?.registeredAt && after?.registeredAt) delta += WEIGHTS.registered;

  const sharedBefore = before?.share ?? 0;
  const sharedAfter = after?.share ?? 0;
  if (sharedAfter > sharedBefore) delta += WEIGHTS.shared;

  if (!before?.viewedAt && after?.viewedAt) delta += WEIGHTS.viewed;

  return delta;
};
