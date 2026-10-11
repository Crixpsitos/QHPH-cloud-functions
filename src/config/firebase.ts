import * as admin from "firebase-admin";
import {getFirestore} from "firebase-admin/firestore";

let app: admin.app.App;
if (admin.apps.length) {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  app = admin.apps[0]!;
} else {
  try {
    app = admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      // Proyecto actual (GCLOUD_PROJECT lo define Cloud Functions); develop como respaldo local.
      storageBucket: process.env.GCLOUD_PROJECT ?
        `${process.env.GCLOUD_PROJECT}.firebasestorage.app` :
        "quehaypahacer-develop.firebasestorage.app",
    });
  } catch {
    app = admin.initializeApp();
  }
}

const db = getFirestore(app, "quehaypahacer-db");
const storage = admin.storage();
const bucket = storage.bucket();

db.settings({ignoreUndefinedProperties: true});

export {db, bucket};

