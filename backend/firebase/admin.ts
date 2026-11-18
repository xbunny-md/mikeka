import { cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const FIREBASE_CONFIG_META: {
  projectId: string;
  firestoreDatabaseId: string;
} = {
  projectId: 'gen-lang-client-0092843012',
  firestoreDatabaseId: 'ai-studio-remixsportybetod-c683f60e-2134-4acf-acfa-6e6e253f4657',
};

export function hasServiceAccountCredentials(): boolean {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) return true;
  if (process.env.FIREBASE_CLIENT_EMAIL?.trim() && process.env.FIREBASE_PRIVATE_KEY?.trim()) {
    return true;
  }
  return false;
}

function parseServiceAccount() {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) {
    const parsed = JSON.parse(rawJson) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
    if (parsed.client_email && parsed.private_key) {
      return cert({
        projectId: parsed.project_id || FIREBASE_CONFIG_META.projectId,
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key.replace(/\\n/g, '\n'),
      });
    }
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (clientEmail && privateKey) {
    return cert({
      projectId: FIREBASE_CONFIG_META.projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    });
  }

  return null;
}

export function getFirebaseAdminApp(): App {
  if (getApps().length > 0) {
    return getApp();
  }

  const credential = parseServiceAccount();
  if (credential) {
    return initializeApp({
      credential,
      projectId: FIREBASE_CONFIG_META.projectId,
    });
  }

  // Project-only initialization supports verifyIdToken(token) on any project without IAM.
  return initializeApp({
    projectId: FIREBASE_CONFIG_META.projectId,
  });
}

/**
 * Verifies a Firebase ID token locally using Google's public JWKS certificates via firebase-admin.
 * Works on every project (Starter Tier & Vercel) without requiring IAM service-account permissions.
 */
export async function verifyIdTokenWithAdmin(idToken: string): Promise<DecodedIdToken | null> {
  const clean = (idToken || '').trim();
  if (!clean || clean.length < 20) return null;

  try {
    const app = getFirebaseAdminApp();
    const auth = getAuth(app);
    return await auth.verifyIdToken(clean);
  } catch {
    return null;
  }
}

/**
 * Returns Admin Firestore ONLY when explicit service account credentials are provided
 * (e.g. via Vercel Environment Variables). Avoids IAM PERMISSION_DENIED on Starter Tier previews.
 */
export function getAdminFirestoreIfConfigured(): Firestore | null {
  if (!hasServiceAccountCredentials()) return null;
  try {
    const app = getFirebaseAdminApp();
    const dbId = FIREBASE_CONFIG_META.firestoreDatabaseId;
    if (dbId && dbId !== '(default)') {
      return getFirestore(app, dbId);
    }
    return getFirestore(app);
  } catch {
    return null;
  }
}

export function getFirebaseProjectMeta() {
  return {
    projectId: FIREBASE_CONFIG_META.projectId,
    firestoreDatabaseId: FIREBASE_CONFIG_META.firestoreDatabaseId || '(default)',
    adminIamConfigured: hasServiceAccountCredentials(),
  };
}
