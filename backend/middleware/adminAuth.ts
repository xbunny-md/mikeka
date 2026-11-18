import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { verifyIdTokenWithAdmin } from '../firebase/admin.ts';
import { backendLogger } from '../services/logger.ts';
import { platformConfigService } from '../services/platformConfigService.ts';

export interface VerifiedAuthUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

export type VerifiedAdminUser = VerifiedAuthUser;

export interface AuthenticatedRequest extends Request {
  authUser?: VerifiedAuthUser;
  adminUser?: VerifiedAdminUser;
}

export type AdminRequest = AuthenticatedRequest;

const DEFAULT_ADMIN_EMAILS = new Set([
  'jkambi00@gmail.com',
  'xbotmanager@gmail.com',
]);

interface TokenCacheEntry {
  user: VerifiedAuthUser;
  expiresAt: number;
}
const tokenCache = new Map<string, TokenCacheEntry>();

export function isAdminEmail(email: string | null | undefined, emailVerified?: boolean): boolean {
  if (!email || !emailVerified) return false;
  return DEFAULT_ADMIN_EMAILS.has(email.trim().toLowerCase());
}

export function isUserAuthorizedAdmin(user: VerifiedAuthUser | null | undefined): boolean {
  if (!user) return false;
  if (platformConfigService.isUserDisabled(user.uid)) return false;
  if (isAdminEmail(user.email, user.emailVerified)) return true;
  if (user.emailVerified && platformConfigService.isUserAdminByAccessRecord(user.uid)) {
    return true;
  }
  return false;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedAuthUser | null> {
  const clean = (idToken || '').trim();
  if (!clean || clean.length < 20) return null;

  const hash = crypto.createHash('sha256').update(clean).digest('hex');
  const cached = tokenCache.get(hash);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.user;
  }

  const decoded = await verifyIdTokenWithAdmin(clean);
  if (decoded && decoded.uid && decoded.email) {
    const verified: VerifiedAuthUser = {
      uid: decoded.uid,
      email: decoded.email,
      emailVerified: Boolean(decoded.email_verified),
      name: typeof decoded.name === 'string' ? decoded.name : undefined,
    };
    tokenCache.set(hash, {
      user: verified,
      expiresAt: Date.now() + 60 * 1000,
    });
    return verified;
  }

  return null;
}

export async function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (token) {
    const verified = await verifyFirebaseIdToken(token);
    if (verified && !platformConfigService.isUserDisabled(verified.uid)) {
      req.authUser = verified;
      platformConfigService.upsertSeenUser({
        uid: verified.uid,
        email: verified.email,
        displayName: verified.name,
        emailVerified: verified.emailVerified,
        defaultAdmin: isAdminEmail(verified.email, verified.emailVerified),
      });
    }
  }
  next();
}

export async function requireAuthenticated(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    res.status(401).json({
      error: 'Authentication required. Please sign in to continue.',
    });
    return;
  }

  const verified = await verifyFirebaseIdToken(token);
  if (!verified) {
    res.status(401).json({
      error: 'Invalid or expired Firebase authentication token.',
    });
    return;
  }

  if (platformConfigService.isUserDisabled(verified.uid)) {
    backendLogger.warn('AUTH', 'DISABLED_ACCOUNT_BLOCKED', 'Blocked request from disabled user.', {
      actorUid: verified.uid,
      actorEmail: verified.email,
    });
    res.status(403).json({
      error: 'This account has been disabled by an administrator.',
    });
    return;
  }

  platformConfigService.upsertSeenUser({
    uid: verified.uid,
    email: verified.email,
    displayName: verified.name,
    emailVerified: verified.emailVerified,
    defaultAdmin: isAdminEmail(verified.email, verified.emailVerified),
  });

  req.authUser = verified;
  next();
}

export async function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    res.status(401).json({
      error: 'Administrator sign-in required. Sign in with an authorized account.',
    });
    return;
  }

  const verified = await verifyFirebaseIdToken(token);
  if (!verified) {
    res.status(401).json({
      error: 'Invalid or expired Firebase authentication token.',
    });
    return;
  }

  platformConfigService.upsertSeenUser({
    uid: verified.uid,
    email: verified.email,
    displayName: verified.name,
    emailVerified: verified.emailVerified,
    defaultAdmin: isAdminEmail(verified.email, verified.emailVerified),
  });

  if (!isUserAuthorizedAdmin(verified)) {
    backendLogger.warn(
      'ADMIN',
      'ADMIN_ACCESS_DENIED',
      `Denied admin access for ${verified.email} (verified=${verified.emailVerified}).`,
      { actorUid: verified.uid, actorEmail: verified.email }
    );
    res.status(403).json({
      error:
        'Administrator privileges (with a verified email) are required to access global controls.',
    });
    return;
  }

  req.authUser = verified;
  req.adminUser = verified;
  next();
}

export async function requireCronOrAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (cronSecret && token && token === cronSecret) {
    next();
    return;
  }

  // Fallback to admin Firebase token if triggered manually
  await requireAdmin(req, res, next);
}
