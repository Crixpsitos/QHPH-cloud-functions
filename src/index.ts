/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {setGlobalOptions} from "firebase-functions";
import {
  syncUserPreference,
} from "./modules/users/triggers/eventInteraction.onWrite.syncUserPreference";
import {
  optimizeProfileMedia,
} from "./modules/users/triggers/profile.onFinalized.optimizeProfileMedia";
import {
  expirePremiumPlans,
} from "./modules/users/triggers/schedule.expirePremiumPlans";
import {
  notifyNewReport,
} from "./modules/reports/triggers/report.onCreate.notifyNewReport";
import {
  recalculateScoreAnalitycs,
} from "./modules/events/triggers/event.onWrite.recalculateScoreAnalitycs";
import {
  aggregateSessionAnalytics,
} from "./modules/events/triggers/session.onWrite.aggregateSessionAnalytics";
import {
  recalculateSessionScore,
} from "./modules/events/triggers/session.onWrite.recalculateSessionScore";
import {
  cleanupSessionMedia,
} from "./modules/events/triggers/session.onDelete.cleanupSessionMedia";
import {onObjectFinalizedOptimizeImages} from "./triggers/storage/onObjectFinalized.optimizeImages";
import {onObjectFinalizedOptimizeVideos} from "./triggers/storage/onObjectFinalized.optimizeVideos";
import {
  optimizeMediaImages,
  optimizeMediaVideos,
} from "./triggers/storage/onObjectFinalized.optimizeMedia";
import {
  optimizeSessionImages,
  optimizeSessionVideos,
} from "./triggers/storage/onObjectFinalized.optimizeSessions";
import {cleanupOldMediaFiles} from "./modules/events/triggers/event.onWrite.cleanupOldMediaFiles";
import {
  syncSiteMarkerAndCleanupMedia,
} from "./modules/sites/triggers/site.onWrite.syncMarkerAndCleanupMedia";
import {
  notifySiteModeration,
} from "./modules/sites/triggers/site.onWrite.notifyModeration";
import {
  notifyEventChanges,
} from "./modules/events/triggers/event.onWrite.notifyChanges";
import {
  cascadeDeleteSiteInteractions,
} from "./modules/sites/triggers/site.onDelete.cascadeDeleteSiteInteractions";
import {
  cascadeDeleteEventInteractions,
} from "./modules/events/triggers/event.onDelete.cascadeDeleteInteractions";


// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({maxInstances: 10});

// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

export {
  syncUserPreference,
  optimizeProfileMedia,
  expirePremiumPlans,
  notifyNewReport,
  recalculateScoreAnalitycs,
  aggregateSessionAnalytics,
  recalculateSessionScore,
  cleanupSessionMedia,
  onObjectFinalizedOptimizeImages,
  onObjectFinalizedOptimizeVideos,
  optimizeMediaImages,
  optimizeMediaVideos,
  optimizeSessionImages,
  optimizeSessionVideos,
  cleanupOldMediaFiles,
  syncSiteMarkerAndCleanupMedia,
  notifySiteModeration,
  notifyEventChanges,
  cascadeDeleteSiteInteractions,
  cascadeDeleteEventInteractions,
};
