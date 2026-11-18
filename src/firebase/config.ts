import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
export const FIREBASE_CONFIG = {
  projectId: 'gen-lang-client-0092843012',
  appId: '1:950121605631:web:79a5e741ef28611f041fca',
  apiKey: 'AIzaSyAIWdgp07l0GMRb1wKkKeN9uN27EhzRfkg',
  authDomain: 'gen-lang-client-0092843012.firebaseapp.com',
  firestoreDatabaseId: 'ai-studio-remixsportybetod-c683f60e-2134-4acf-acfa-6e6e253f4657',
  storageBucket: 'gen-lang-client-0092843012.firebasestorage.app',
  messagingSenderId: '950121605631',
  measurementId: '',
  oAuthClientId: '950121605631-ec1k1o3sfs7a69k1vc39n1q4co4abguo.apps.googleusercontent.com',
} as const;

const app = initializeApp(FIREBASE_CONFIG);

export const db = getFirestore(app, FIREBASE_CONFIG.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export type FirestoreConnectionState = 'UNVERIFIED' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';

export async function testFirestoreConnection(): Promise<{
  status: FirestoreConnectionState;
  latencyMs: number;
  message: string;
}> {
  const started = Date.now();
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return {
      status: 'CONNECTED',
      latencyMs: Date.now() - started,
      message: 'Verified live Firestore server connectivity.',
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('the client is offline')) {
      return {
        status: 'DISCONNECTED',
        latencyMs: Date.now() - started,
        message: 'Firestore client is offline. Verify Firebase configuration.',
      };
    }
    return {
      status: 'ERROR',
      latencyMs: Date.now() - started,
      message: msg,
    };
  }
}
