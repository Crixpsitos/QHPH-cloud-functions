import type {Timestamp} from "firebase-admin/firestore";


export interface FirebaseEventInteractionDto {
  id: string;
  eventId: string;
  liked?: boolean;
  likedAt?: Timestamp;
  viewedAt?: Timestamp;
  clickCount?: number;
  registeredAt?: Timestamp;
  share?: number;
  sharedAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
