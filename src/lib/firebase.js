import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean);

let appInstance = null;
let authInstance = null;
let databaseInstance = null;
let firestoreInstance = null;

if (isFirebaseConfigured) {
  appInstance = initializeApp(firebaseConfig);
  authInstance = getAuth(appInstance);
  databaseInstance = getDatabase(appInstance);
  firestoreInstance = getFirestore(appInstance);
}

export const app = appInstance;
export const auth = authInstance;
export const database = databaseInstance;
export const firestore = firestoreInstance;
