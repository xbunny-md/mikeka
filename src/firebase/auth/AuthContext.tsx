import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  testFirestoreConnection,
  type FirestoreConnectionState,
} from '../config.ts';
import { handleFirestoreError, OperationType } from '../firestore/errors.ts';
import {
  ensureUserProfile,
  type AdminAuditLogDocRecord,
  type AdminSettingsDocRecord,
  type AppNotificationRecord,
  type FavoriteRecord,
  type FilterPresetRecord,
  type SavedBookingCodeRecord,
  type ScanHistoryRecord,
  type UserFavoriteTicketRecord,
  type UserProfileRecord,
  type UserTransferDocRecord,
} from '../firestore/repository.ts';

const BOOTSTRAPPED_ADMIN_EMAILS = new Set(['jkambi00@gmail.com', 'xbotmanager@gmail.com']);

export type AuthModalTab = 'signin' | 'signup' | 'reset';

export function mapFirebaseAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  const msg = err instanceof Error ? err.message : String(err || '');

  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in or resetting your password.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email or password. Verify your credentials or use Reset Password.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a few minutes before trying again.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not yet enabled in Firebase Console -> Authentication -> Sign-in method.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Google sign-in popup was closed before completing.';
    case 'auth/popup-blocked':
      return 'Popup was blocked by your browser. Please allow popups for this site and retry.';
    case 'auth/user-disabled':
      return 'This account has been disabled in Firebase Authentication.';
    case 'auth/network-request-failed':
      return 'Network error communicating with Firebase Authentication. Check your connection.';
    case 'auth/unauthorized-domain':
      return 'This domain is not allowlisted under Firebase Console -> Authentication -> Settings -> Authorized domains.';
    case 'auth/requires-recent-login':
      return 'Please sign in again to complete this security action.';
    default:
      return msg || 'Authentication failed. Please try again.';
  }
}

async function sendAuthAudit(
  event:
    | 'SIGNUP'
    | 'LOGIN'
    | 'LOGOUT'
    | 'PASSWORD_RESET'
    | 'EMAIL_VERIFICATION_SENT'
    | 'LOGIN_FAILED',
  token?: string | null,
  email?: string,
  details?: string
) {
  try {
    await fetch('/api/auth/audit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ event, email, details }),
    });
  } catch {
    // Audit logging is non-blocking
  }
}

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  isAdmin: boolean;
  backendRole: 'USER' | 'ADMIN' | null;
  accountDisabled: boolean;
  authNotice: string | null;
  clearAuthNotice: () => void;
  authModalOpen: boolean;
  authModalTab: AuthModalTab;
  openAuthModal: (tab?: AuthModalTab) => void;
  closeAuthModal: () => void;
  firestoreStatus: FirestoreConnectionState;
  firestoreLatencyMs: number | null;
  firestoreMessage: string;
  profile: UserProfileRecord | null;
  scanHistory: ScanHistoryRecord[];
  bookingCodes: SavedBookingCodeRecord[];
  presets: FilterPresetRecord[];
  favorites: FavoriteRecord[];
  favoriteTickets: UserFavoriteTicketRecord[];
  cloudTransfers: UserTransferDocRecord[];
  cloudNotifications: AppNotificationRecord[];
  cloudAdminSettings: AdminSettingsDocRecord | null;
  cloudAdminLogs: AdminAuditLogDocRecord[];
  signInWithGoogle: () => Promise<void>;
  signUpWithEmail: (params: {
    email: string;
    password: string;
    displayName: string;
    rememberMe?: boolean;
  }) => Promise<{ verificationSent: boolean }>;
  signInWithEmail: (params: {
    email: string;
    password: string;
    rememberMe?: boolean;
  }) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshAuthUser: () => Promise<boolean>;
  updateAccountProfile: (displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  retestFirestore: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [backendAdminConfirmed, setBackendAdminConfirmed] = useState(false);
  const [backendRole, setBackendRole] = useState<'USER' | 'ADMIN' | null>(null);
  const [accountDisabled, setAccountDisabled] = useState(false);
  const [adminDocConfirmed, setAdminDocConfirmed] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<AuthModalTab>('signin');

  const [firestoreStatus, setFirestoreStatus] =
    useState<FirestoreConnectionState>('UNVERIFIED');
  const [firestoreLatencyMs, setFirestoreLatencyMs] = useState<number | null>(null);
  const [firestoreMessage, setFirestoreMessage] = useState('Checking Firestore connectivity...');

  const [profile, setProfile] = useState<UserProfileRecord | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanHistoryRecord[]>([]);
  const [bookingCodes, setBookingCodes] = useState<SavedBookingCodeRecord[]>([]);
  const [presets, setPresets] = useState<FilterPresetRecord[]>([]);
  const [favorites, setFavorites] = useState<FavoriteRecord[]>([]);
  const [favoriteTickets, setFavoriteTickets] = useState<UserFavoriteTicketRecord[]>([]);
  const [cloudTransfers, setCloudTransfers] = useState<UserTransferDocRecord[]>([]);
  const [cloudNotifications, setCloudNotifications] = useState<AppNotificationRecord[]>([]);
  const [cloudAdminSettings, setCloudAdminSettings] =
    useState<AdminSettingsDocRecord | null>(null);
  const [cloudAdminLogs, setCloudAdminLogs] = useState<AdminAuditLogDocRecord[]>([]);

  const isBootstrappedAdmin =
    Boolean(user?.emailVerified) &&
    BOOTSTRAPPED_ADMIN_EMAILS.has(user?.email?.trim().toLowerCase() || '');
  const isAdmin =
    !accountDisabled && (isBootstrappedAdmin || backendAdminConfirmed || adminDocConfirmed);

  const openAuthModal = useCallback((tab: AuthModalTab = 'signin') => {
    setAuthModalTab(tab);
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModalOpen(false);
  }, []);

  const clearAuthNotice = useCallback(() => {
    setAuthNotice(null);
  }, []);

  const retestFirestore = async () => {
    const result = await testFirestoreConnection();
    setFirestoreStatus(result.status);
    setFirestoreLatencyMs(result.latencyMs);
    setFirestoreMessage(result.message);
  };

  const getIdToken = useCallback(async (forceRefresh = false): Promise<string | null> => {
    const current = auth.currentUser;
    if (!current) return null;
    try {
      return await current.getIdToken(forceRefresh);
    } catch {
      return null;
    }
  }, []);

  const syncBackendSession = useCallback(async (firebaseUser: User, forceTokenRefresh = false) => {
    try {
      const token = await firebaseUser.getIdToken(forceTokenRefresh);
      const res = await fetch('/api/auth/session', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) {
        setAccountDisabled(true);
        setBackendAdminConfirmed(false);
        setBackendRole(null);
        setAuthNotice('Your account has been disabled by an administrator.');
        await firebaseSignOut(auth);
        return false;
      }
      if (res.ok) {
        const json = (await res.json()) as {
          isAdmin?: boolean;
          role?: 'USER' | 'ADMIN';
          disabled?: boolean;
        };
        setAccountDisabled(Boolean(json.disabled));
        setBackendAdminConfirmed(Boolean(json.isAdmin));
        setBackendRole(json.role || 'USER');
        return true;
      }
    } catch {
      // Backend unreachable; keep client auth state cleanly
    }
    return true;
  }, []);

  useEffect(() => {
    void retestFirestore();
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);

      if (nextUser) {
        setAccountDisabled(false);
        if (nextUser.emailVerified) {
          try {
            await ensureUserProfile(nextUser);
          } catch (err) {
            console.error('Failed to ensure user profile:', err);
          }
        }
        await syncBackendSession(nextUser, false);
      } else {
        setBackendAdminConfirmed(false);
        setBackendRole(null);
        setAccountDisabled(false);
        setAdminDocConfirmed(false);
        setProfile(null);
        setScanHistory([]);
        setBookingCodes([]);
        setPresets([]);
        setFavorites([]);
        setFavoriteTickets([]);
        setCloudTransfers([]);
        setCloudNotifications([]);
        setCloudAdminSettings(null);
        setCloudAdminLogs([]);
      }
    });
    return () => unsub();
  }, [syncBackendSession]);

  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) return;
    const uid = user.uid;

    const unsubAdminRole = onSnapshot(
      doc(db, 'admins', uid),
      (snap) => {
        setAdminDocConfirmed(snap.exists() && snap.data()?.role === 'ADMIN');
      },
      () => {
        setAdminDocConfirmed(false);
      }
    );

    const unsubProfile = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as UserProfileRecord);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}`)
    );

    const unsubScans = onSnapshot(
      query(
        collection(db, 'users', uid, 'scanHistory'),
        where('userId', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(40)
      ),
      (snap) => {
        setScanHistory(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ScanHistoryRecord, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/scanHistory`)
    );

    const unsubCodes = onSnapshot(
      query(
        collection(db, 'users', uid, 'bookingCodes'),
        where('userId', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(40)
      ),
      (snap) => {
        setBookingCodes(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<SavedBookingCodeRecord, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/bookingCodes`)
    );

    const unsubPresets = onSnapshot(
      query(
        collection(db, 'users', uid, 'presets'),
        where('userId', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(30)
      ),
      (snap) => {
        setPresets(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FilterPresetRecord, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/presets`)
    );

    const unsubFavorites = onSnapshot(
      query(
        collection(db, 'users', uid, 'favorites'),
        where('userId', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(60)
      ),
      (snap) => {
        setFavorites(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FavoriteRecord, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/favorites`)
    );

    const unsubFavoriteTickets = onSnapshot(
      query(
        collection(db, 'users', uid, 'favoriteTickets'),
        where('userId', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(120)
      ),
      (snap) => {
        setFavoriteTickets(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<UserFavoriteTicketRecord, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/favoriteTickets`)
    );

    const unsubTransfers = onSnapshot(
      query(
        collection(db, 'users', uid, 'transfers'),
        where('userId', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(50)
      ),
      (snap) => {
        setCloudTransfers(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<UserTransferDocRecord, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/transfers`)
    );

    const unsubNotifications = onSnapshot(
      query(
        collection(db, 'users', uid, 'notifications'),
        where('userId', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(40)
      ),
      (snap) => {
        setCloudNotifications(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<AppNotificationRecord, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/notifications`)
    );

    return () => {
      unsubAdminRole();
      unsubProfile();
      unsubScans();
      unsubCodes();
      unsubPresets();
      unsubFavorites();
      unsubFavoriteTickets();
      unsubTransfers();
      unsubNotifications();
    };
  }, [authReady, user]);

  useEffect(() => {
    if (!authReady || !user || !isAdmin) {
      setCloudAdminSettings(null);
      setCloudAdminLogs([]);
      return;
    }

    const unsubSettings = onSnapshot(
      doc(db, 'adminSettings', 'default'),
      (snap) => {
        if (snap.exists()) {
          setCloudAdminSettings({
            id: snap.id,
            ...(snap.data() as Omit<AdminSettingsDocRecord, 'id'>),
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'adminSettings/default')
    );

    const unsubLogs = onSnapshot(
      query(
        collection(db, 'adminAuditLogs'),
        where('scope', '==', 'ADMIN_AUDIT'),
        orderBy('createdAt', 'desc'),
        limit(60)
      ),
      (snap) => {
        setCloudAdminLogs(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<AdminAuditLogDocRecord, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'adminAuditLogs')
    );

    return () => {
      unsubSettings();
      unsubLogs();
    };
  }, [authReady, user, isAdmin]);

  const signInWithGoogle = async () => {
    try {
      await setPersistence(auth, browserLocalPersistence);
      const cred = await signInWithPopup(auth, googleProvider);
      const token = await cred.user.getIdToken();
      await syncBackendSession(cred.user, true);
      await sendAuthAudit('LOGIN', token, cred.user.email || undefined, 'Signed in via Google.');
      setAuthNotice(null);
      setAuthModalOpen(false);
    } catch (err) {
      await sendAuthAudit('LOGIN_FAILED', null, undefined, mapFirebaseAuthError(err));
      throw new Error(mapFirebaseAuthError(err));
    }
  };

  const signUpWithEmail = async (params: {
    email: string;
    password: string;
    displayName: string;
    rememberMe?: boolean;
  }): Promise<{ verificationSent: boolean }> => {
    try {
      await setPersistence(
        auth,
        params.rememberMe === false ? browserSessionPersistence : browserLocalPersistence
      );
      const cred = await createUserWithEmailAndPassword(
        auth,
        params.email.trim(),
        params.password
      );
      const cleanName = params.displayName.trim() || params.email.split('@')[0] || 'Analyst';
      await updateProfile(cred.user, { displayName: cleanName });

      let verificationSent = false;
      try {
        await sendEmailVerification(cred.user);
        verificationSent = true;
      } catch {
        verificationSent = false;
      }

      const token = await cred.user.getIdToken(true);
      await syncBackendSession(cred.user, true);
      await sendAuthAudit(
        'SIGNUP',
        token,
        cred.user.email || params.email,
        `Registered account (${cleanName}). Verification sent: ${verificationSent}.`
      );
      setAuthNotice(
        verificationSent
          ? `Account created! Check ${cred.user.email} for your verification link to unlock cloud sync.`
          : 'Account created! Verify your email address to unlock cloud sync.'
      );
      setAuthModalOpen(false);
      return { verificationSent };
    } catch (err) {
      await sendAuthAudit('LOGIN_FAILED', null, params.email, mapFirebaseAuthError(err));
      throw new Error(mapFirebaseAuthError(err));
    }
  };

  const signInWithEmail = async (params: {
    email: string;
    password: string;
    rememberMe?: boolean;
  }): Promise<void> => {
    try {
      await setPersistence(
        auth,
        params.rememberMe === false ? browserSessionPersistence : browserLocalPersistence
      );
      const cred = await signInWithEmailAndPassword(
        auth,
        params.email.trim(),
        params.password
      );
      const allowed = await syncBackendSession(cred.user, true);
      if (!allowed) {
        throw new Error('This account has been disabled by an administrator.');
      }
      const token = await cred.user.getIdToken();
      await sendAuthAudit('LOGIN', token, cred.user.email || params.email, 'Signed in via Email/Password.');
      setAuthNotice(null);
      setAuthModalOpen(false);
    } catch (err) {
      await sendAuthAudit('LOGIN_FAILED', null, params.email, mapFirebaseAuthError(err));
      throw new Error(mapFirebaseAuthError(err));
    }
  };

  const sendPasswordReset = async (email: string): Promise<void> => {
    try {
      await sendPasswordResetEmail(auth, email.trim());
      await sendAuthAudit(
        'PASSWORD_RESET',
        null,
        email.trim(),
        `Password reset email requested for ${email.trim()}.`
      );
    } catch (err) {
      throw new Error(mapFirebaseAuthError(err));
    }
  };

  const resendVerificationEmail = async (): Promise<void> => {
    if (!auth.currentUser) {
      throw new Error('Sign in first to resend verification email.');
    }
    try {
      await sendEmailVerification(auth.currentUser);
      const token = await auth.currentUser.getIdToken();
      await sendAuthAudit(
        'EMAIL_VERIFICATION_SENT',
        token,
        auth.currentUser.email || undefined,
        'Resent email verification link.'
      );
      setAuthNotice(`Verification email sent to ${auth.currentUser.email}.`);
    } catch (err) {
      throw new Error(mapFirebaseAuthError(err));
    }
  };

  const refreshAuthUser = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    const updated = auth.currentUser;
    if (!updated) return false;
    await syncBackendSession(updated, true);
    if (updated.emailVerified) {
      try {
        await ensureUserProfile(updated);
      } catch {
        // Non-fatal
      }
      setAuthNotice(null);
    }
    // Clone reference update so React triggers re-render cleanly with updated emailVerified/displayName
    setUser(Object.assign(Object.create(Object.getPrototypeOf(updated)), updated));
    return updated.emailVerified;
  };

  const updateAccountProfile = async (displayName: string): Promise<void> => {
    if (!auth.currentUser) throw new Error('Sign in required.');
    const clean = displayName.trim();
    if (!clean) throw new Error('Display name cannot be empty.');
    await updateProfile(auth.currentUser, { displayName: clean });
    await refreshAuthUser();
  };

  const signOut = async () => {
    const token = await getIdToken();
    const email = auth.currentUser?.email || undefined;
    await sendAuthAudit('LOGOUT', token, email, 'Signed out.');
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        isAdmin,
        backendRole,
        accountDisabled,
        authNotice,
        clearAuthNotice,
        authModalOpen,
        authModalTab,
        openAuthModal,
        closeAuthModal,
        firestoreStatus,
        firestoreLatencyMs,
        firestoreMessage,
        profile,
        scanHistory,
        bookingCodes,
        presets,
        favorites,
        favoriteTickets,
        cloudTransfers,
        cloudNotifications,
        cloudAdminSettings,
        cloudAdminLogs,
        signInWithGoogle,
        signUpWithEmail,
        signInWithEmail,
        sendPasswordReset,
        resendVerificationEmail,
        refreshAuthUser,
        updateAccountProfile,
        signOut,
        getIdToken,
        retestFirestore,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useFirebase(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useFirebase must be used inside FirebaseProvider');
  }
  return ctx;
}
