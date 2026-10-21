// lib/firebase.ts
// Inicialização client-side do Firebase (lazy, compatível com SSR do Next.js).

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app"
import { getFirestore, type Firestore } from "firebase/firestore"

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

export const firebaseConfigurado = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)

let app: FirebaseApp | undefined
let db: Firestore | undefined

export function getDb(): Firestore {
  if (!firebaseConfigurado) {
    throw new Error("Firebase não configurado. Defina as variáveis NEXT_PUBLIC_FIREBASE_* no .env.local.")
  }
  if (!db) {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig)
    db = getFirestore(app)
  }
  return db
}

