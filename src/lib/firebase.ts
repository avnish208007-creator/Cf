import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import firebaseConfigJson from '../../firebase-applet-config.json';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || firebaseConfigJson.apiKey,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigJson.authDomain,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || firebaseConfigJson.projectId,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigJson.storageBucket,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigJson.messagingSenderId,
  appId: process.env.VITE_FIREBASE_APP_ID || firebaseConfigJson.appId,
};

const databaseId = process.env.VITE_FIREBASE_DATABASE_ID || firebaseConfigJson.firestoreDatabaseId;

const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

let dbInstance: Firestore;
try {
  const options: any = {
    experimentalForceLongPolling: true,
  };
  if (databaseId && databaseId !== '(default)') {
    dbInstance = initializeFirestore(app, options, databaseId);
  } else {
    dbInstance = initializeFirestore(app, options);
  }
} catch (err) {
  try {
    if (databaseId && databaseId !== '(default)') {
      dbInstance = getFirestore(app, databaseId);
    } else {
      dbInstance = getFirestore(app);
    }
  } catch (err2) {
    console.warn('[Firebase] Warning initializing Firestore, falling back to default getFirestore:', err2);
    dbInstance = getFirestore(app);
  }
}

export const db = dbInstance;
export const storage: FirebaseStorage = getStorage(app);
export const DEFAULT_WORKSPACE_ID = 'default-workspace';

