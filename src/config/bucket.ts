import {defineString} from "firebase-functions/params";

/**
 * Bucket de Storage donde escuchan los triggers de optimización.
 * Develop usa el valor por defecto; producción lo define en
 * `.env.quehaypahacer-prod` (Firebase lo carga solo al desplegar ese proyecto).
 */
export const STORAGE_BUCKET = defineString("STORAGE_BUCKET", {
  default: "quehaypahacer-develop.firebasestorage.app",
});
