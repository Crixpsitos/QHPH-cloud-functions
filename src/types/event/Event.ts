import type {Timestamp} from "firebase-admin/firestore";
import {CategoryInfo} from "../category/Category";
import {Promotion} from "../promotion/Promotion";
import {Date} from "../shared/Date";
import {ImageVariants} from "../shared/ImageVariants";
import {Price} from "../shared/Price";

export interface Events extends Date {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  images: ImageVariants;
  occurrences?: {
    startDate: Timestamp;
    endDate: Timestamp;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    publishedAt?: Timestamp;
  }[];
  categoryInfo: CategoryInfo;
  author: {
    id: string;
    displayName: string;
    photoURL: string;
  };
  location: Location;
  status: "draft" | "published" | "cancelled" | "ended";
  registrationType: "none" | "internal" | "external" | "form";
  externalUrl?: string;
  capacity?: number;
  price: Price;
  promotion: Promotion;
  analytics?: {
    views?: number;
    clicks?: number;
    likes?: number;
    shares?: number;
    registrations?: number;
    score?: number;
  };
}
