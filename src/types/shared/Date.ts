import type {Timestamp} from "firebase-admin/firestore";

export interface Date {
  startDate: Timestamp;
  endDate: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  publishedAt?: Timestamp;
}
