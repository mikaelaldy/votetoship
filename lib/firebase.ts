import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase } from "firebase/database";

let dbInstance: ReturnType<typeof getDatabase> | null = null;

export function getDb() {
  if (dbInstance) return dbInstance;
  const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  if (!databaseURL) {
    throw new Error(
      "NEXT_PUBLIC_FIREBASE_DATABASE_URL is not set. See .env.local.example for setup."
    );
  }
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
    databaseURL,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
  };
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  dbInstance = getDatabase(app);
  return dbInstance;
}
