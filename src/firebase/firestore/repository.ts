import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../config.ts';
import { handleFirestoreError, OperationType } from './errors.ts';
import type {
  AutomationJobLog,
  BetslipSelection,
  BookmakerId,
  BookingCodeResponse,
  BookingCodeStatus,
  DailyFactoryConfig,
  GeneratedTicket,
  MatchStatusFilter,
  QualifyingSelection,
  ScanResult,
  ThemeMode,
  TransferDirection,
  TransferStatus,
} from '../../types/sportybet.ts';

export interface UserProfileRecord {
  uid: string;
  displayName: string;
  email: string;
  defaultMinOdds: number;
  defaultMaxOdds: number;
  defaultStakeTzs: number;
  autoScanIntervalSec: number;
  themePreference?: ThemeMode;
  preferredBookmaker?: BookmakerId;
  createdAt?: Timestamp | string;
  updatedAt?: Timestamp | string;
}

export interface ScanHistoryRecord {
  id: string;
  userId: string;
  dataSource: string;
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED';
  totalMatchesScanned: number;
  qualifyingCount: number;
  minOdds: number;
  maxOdds: number;
  startDate: string;
  endDate: string;
  markets: string[];
  leagues: string[];
  matchStatus: MatchStatusFilter;
  resultsPreview: QualifyingSelection[];
  createdAt?: Timestamp | string;
}

export interface SavedBookingCodeRecord {
  id: string;
  userId: string;
  shareCode: string;
  shareUrl: string;
  deadline: number;
  selectionCount: number;
  combinedOdds: number;
  stakeTzs: number;
  estimatedReturnTzs: number;
  status: 'ACTIVE' | 'EXPIRED' | 'INVALID';
  selections: BetslipSelection[];
  createdAt?: Timestamp | string;
  updatedAt?: Timestamp | string;
}

export interface FilterPresetRecord {
  id: string;
  userId: string;
  name: string;
  minOdds: number;
  maxOdds: number;
  markets: string[];
  leagues: string[];
  matchStatus: MatchStatusFilter;
  maxResults: number;
  createdAt?: Timestamp | string;
  updatedAt?: Timestamp | string;
}

export interface FavoriteRecord {
  id: string;
  userId: string;
  kind: 'LEAGUE' | 'TEAM' | 'MARKET';
  refId: string;
  label: string;
  country: string;
  createdAt?: Timestamp | string;
}

export interface UserFavoriteTicketRecord {
  id: string;
  userId: string;
  internalTicketId: string;
  categoryLabel: string;
  combinedOdds: number;
  selectionCount: number;
  generatedDateKey: string;
  createdAt?: Timestamp | string;
}

export interface AppNotificationRecord {
  id: string;
  userId: string;
  type:
    | 'SCAN_COMPLETE'
    | 'ODDS_SHIFT'
    | 'MARKET_UNAVAILABLE'
    | 'CODE_CREATED'
    | 'INTEGRATION_ERROR';
  title: string;
  message: string;
  read: boolean;
  createdAt?: Timestamp | string;
}

export interface UserTransferDocRecord {
  id: string;
  userId: string;
  transferId: string;
  direction: TransferDirection;
  sourceBookmaker: BookmakerId;
  targetBookmaker: BookmakerId;
  originalCode: string;
  targetBookingCode: string;
  targetShareUrl: string;
  status: TransferStatus;
  originalSelectionCount: number;
  matchedCount: number;
  unmatchedCount: number;
  originalCombinedOdds: number;
  targetCombinedOdds: number;
  errorMessage: string;
  createdAt?: Timestamp | string;
}

export interface PublicTicketDocRecord {
  id: string;
  isPublic: boolean;
  publishedByUid: string;
  internalTicketId: string;
  signature: string;
  sourceType: 'DAILY_FACTORY' | 'ADMIN_MANUAL';
  categoryId: string;
  categoryLabel: string;
  targetOdds: number;
  actualCombinedOdds: number;
  selectionCount: number;
  kickoffStartMs: number;
  kickoffEndMs: number;
  dataSource: string;
  generatedDateKey: string;
  originalSelections: Record<string, unknown>[];
  createdAt?: Timestamp | string;
}

export interface PublicTicketUpdateDocRecord {
  id: string;
  isPublic: boolean;
  internalTicketId: string;
  status: string;
  effectiveCombinedOdds: number;
  shareCode: string;
  shareUrl: string;
  shareCodeVerified: boolean;
  bookingCodeStatus: BookingCodeStatus;
  bookingCodeError: string;
  selectionSettlements: Record<string, unknown>[];
  settledAt: string;
  createdAt?: Timestamp | string;
  updatedAt?: Timestamp | string;
}

export interface AdminSettingsDocRecord {
  id: string;
  updatedByUid: string;
  updatedByEmail: string;
  enabled: boolean;
  paused: boolean;
  minIndividualOdds: number;
  maxIndividualOdds: number;
  dailyTicketTarget: number;
  maxTickets: number;
  minSelections: number;
  maxSelections: number;
  anyMarket: boolean;
  markets: string[];
  windowStartTime: string;
  windowEndTime: string;
  timezone: string;
  scheduleIntervalMinutes: number;
  createdAt?: Timestamp | string;
  updatedAt?: Timestamp | string;
}

export interface PublicStatsDocRecord {
  id: string;
  isPublic: boolean;
  dailyTicketTarget: number;
  totalGeneratedToday: number;
  bookingCodesGeneratedToday: number;
  lastScanningAt: string;
  lastSettlementAt: string;
  updatedAt?: Timestamp | string;
}

export interface AdminAuditLogDocRecord {
  id: string;
  scope: 'ADMIN_AUDIT';
  actorUid: string;
  actorEmail: string;
  actionType: string;
  status: 'SUCCESS' | 'PARTIAL' | 'SKIPPED' | 'FAILED';
  ticketsGenerated: number;
  codesCreated: number;
  message: string;
  createdAt?: Timestamp | string;
}

function makeDocId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

function clampString(val: string, maxLen: number, fallback = ''): string {
  const trimmed = (val || fallback).trim();
  return trimmed.slice(0, maxLen);
}

function sanitizeTicketDocId(internalTicketId: string): string {
  return internalTicketId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

export async function ensureUserProfile(user: {
  uid: string;
  displayName: string | null;
  email: string | null;
}): Promise<void> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        displayName: clampString(user.displayName || 'Analyst', 120, 'Analyst'),
        email: clampString(user.email || 'user@example.com', 254, 'user@example.com'),
        defaultMinOdds: 1.01,
        defaultMaxOdds: 1.25,
        defaultStakeTzs: 10000,
        autoScanIntervalSec: 0,
        themePreference: 'dark',
        preferredBookmaker: 'SPORTYBET_TZ',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updateUserPreferences(
  uid: string,
  prefs: {
    themePreference?: ThemeMode;
    preferredBookmaker?: BookmakerId;
  }
): Promise<void> {
  const path = `users/${uid}`;
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (prefs.themePreference === 'dark' || prefs.themePreference === 'light') {
    payload.themePreference = prefs.themePreference;
  }
  if (prefs.preferredBookmaker === 'SPORTYBET_TZ' || prefs.preferredBookmaker === 'BETPAWA_TZ') {
    payload.preferredBookmaker = prefs.preferredBookmaker;
  }
  try {
    await updateDoc(doc(db, 'users', uid), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateUserSettings(
  uid: string,
  updates: {
    displayName: string;
    defaultMinOdds: number;
    defaultMaxOdds: number;
    defaultStakeTzs: number;
    autoScanIntervalSec: number;
    themePreference?: ThemeMode;
    preferredBookmaker?: BookmakerId;
  }
): Promise<void> {
  const path = `users/${uid}`;
  const minOdds = Math.max(1.01, Math.min(100, Number(updates.defaultMinOdds) || 1.01));
  const maxOdds = Math.max(minOdds, Math.min(1000, Number(updates.defaultMaxOdds) || 1.25));
  const stakeTzs = Math.max(0, Math.min(100000000, Number(updates.defaultStakeTzs) || 0));
  const interval = Math.max(0, Math.min(3600, Math.round(Number(updates.autoScanIntervalSec) || 0)));

  const payload: Record<string, unknown> = {
    displayName: clampString(updates.displayName, 120, 'Analyst'),
    defaultMinOdds: minOdds,
    defaultMaxOdds: maxOdds,
    defaultStakeTzs: stakeTzs,
    autoScanIntervalSec: interval,
    updatedAt: serverTimestamp(),
  };
  if (updates.themePreference === 'dark' || updates.themePreference === 'light') {
    payload.themePreference = updates.themePreference;
  }
  if (updates.preferredBookmaker === 'SPORTYBET_TZ' || updates.preferredBookmaker === 'BETPAWA_TZ') {
    payload.preferredBookmaker = updates.preferredBookmaker;
  }

  try {
    await updateDoc(doc(db, 'users', uid), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function saveScanHistoryRecord(
  uid: string,
  scan: ScanResult
): Promise<string> {
  const docId = makeDocId('scan');
  const path = `users/${uid}/scanHistory/${docId}`;
  const minOdds = Math.max(1.01, Math.min(1000, scan.appliedConfig.minOdds));
  const maxOdds = Math.max(minOdds, Math.min(10000, scan.appliedConfig.maxOdds));

  try {
    await setDoc(doc(db, 'users', uid, 'scanHistory', docId), {
      userId: uid,
      dataSource: clampString(scan.dataSource, 120, 'SportyBet TZ'),
      status: scan.status,
      totalMatchesScanned: Math.max(0, Math.min(50000, scan.totalMatchesScanned)),
      qualifyingCount: Math.max(0, Math.min(50000, scan.qualifyingCount)),
      minOdds,
      maxOdds,
      startDate: clampString(scan.appliedConfig.startDate || '', 40),
      endDate: clampString(scan.appliedConfig.endDate || '', 40),
      markets: scan.appliedConfig.markets.slice(0, 20).map((m) => clampString(m, 40)),
      leagues: scan.appliedConfig.leagues.slice(0, 50).map((l) => clampString(l, 120)),
      matchStatus: scan.appliedConfig.matchStatus,
      resultsPreview: scan.results.slice(0, 25),
      createdAt: serverTimestamp(),
    });
    return docId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteScanHistoryRecord(uid: string, scanId: string): Promise<void> {
  const path = `users/${uid}/scanHistory/${scanId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'scanHistory', scanId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveBookingCodeRecord(
  uid: string,
  booking: BookingCodeResponse,
  stakeTzs: number
): Promise<string> {
  const docId = makeDocId('code');
  const path = `users/${uid}/bookingCodes/${docId}`;
  const cleanStake = Math.max(0, Math.min(100000000, stakeTzs));
  const estReturn = Number((booking.combinedOdds * cleanStake).toFixed(2));
  const status: 'ACTIVE' | 'EXPIRED' | 'INVALID' =
    booking.deadline > 0 && booking.deadline < Date.now() ? 'EXPIRED' : 'ACTIVE';

  try {
    await setDoc(doc(db, 'users', uid, 'bookingCodes', docId), {
      userId: uid,
      shareCode: clampString(booking.shareCode, 32),
      shareUrl: clampString(booking.shareUrl, 300),
      deadline: Number(booking.deadline || 0),
      selectionCount: Math.max(1, Math.min(30, booking.selections.length)),
      combinedOdds: Math.max(1, booking.combinedOdds),
      stakeTzs: cleanStake,
      estimatedReturnTzs: estReturn,
      status,
      selections: booking.selections.slice(0, 30),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateBookingCodeStatus(
  uid: string,
  codeId: string,
  status: 'ACTIVE' | 'EXPIRED' | 'INVALID'
): Promise<void> {
  const path = `users/${uid}/bookingCodes/${codeId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'bookingCodes', codeId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteBookingCodeRecord(uid: string, codeId: string): Promise<void> {
  const path = `users/${uid}/bookingCodes/${codeId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'bookingCodes', codeId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveFilterPreset(
  uid: string,
  preset: {
    name: string;
    minOdds: number;
    maxOdds: number;
    markets: string[];
    leagues: string[];
    matchStatus: MatchStatusFilter;
    maxResults: number;
  }
): Promise<string> {
  const docId = makeDocId('preset');
  const path = `users/${uid}/presets/${docId}`;
  const minOdds = Math.max(1.01, Math.min(1000, preset.minOdds));
  const maxOdds = Math.max(minOdds, Math.min(10000, preset.maxOdds));

  try {
    await setDoc(doc(db, 'users', uid, 'presets', docId), {
      userId: uid,
      name: clampString(preset.name, 80, 'Saved Preset'),
      minOdds,
      maxOdds,
      markets: preset.markets.slice(0, 20).map((m) => clampString(m, 40)),
      leagues: preset.leagues.slice(0, 50).map((l) => clampString(l, 120)),
      matchStatus: preset.matchStatus,
      maxResults: Math.max(1, Math.min(500, Math.round(preset.maxResults || 100))),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteFilterPreset(uid: string, presetId: string): Promise<void> {
  const path = `users/${uid}/presets/${presetId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'presets', presetId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveFavoriteItem(
  uid: string,
  item: {
    kind: 'LEAGUE' | 'TEAM' | 'MARKET';
    refId: string;
    label: string;
    country?: string;
  }
): Promise<string> {
  const docId = makeDocId('fav');
  const path = `users/${uid}/favorites/${docId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'favorites', docId), {
      userId: uid,
      kind: item.kind,
      refId: clampString(item.refId, 120),
      label: clampString(item.label, 140),
      country: clampString(item.country || '', 100),
      createdAt: serverTimestamp(),
    });
    return docId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteFavoriteItem(uid: string, favoriteId: string): Promise<void> {
  const path = `users/${uid}/favorites/${favoriteId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'favorites', favoriteId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveFavoriteTicket(
  uid: string,
  ticket: GeneratedTicket
): Promise<void> {
  const safeId = sanitizeTicketDocId(ticket.internalTicketId);
  const path = `users/${uid}/favoriteTickets/${safeId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'favoriteTickets', safeId), {
      userId: uid,
      internalTicketId: safeId,
      categoryLabel: clampString(ticket.categoryLabel || '2.00-3.00', 60, 'Daily Ticket'),
      combinedOdds: Math.max(1.0, Math.min(1000000, ticket.actualCombinedOdds)),
      selectionCount: Math.max(1, Math.min(30, ticket.selectionCount)),
      generatedDateKey: clampString(ticket.generatedDateKey, 20, '2026-01-01'),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteFavoriteTicket(
  uid: string,
  internalTicketId: string
): Promise<void> {
  const safeId = sanitizeTicketDocId(internalTicketId);
  const path = `users/${uid}/favoriteTickets/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'favoriteTickets', safeId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveNotificationRecord(
  uid: string,
  notif: {
    type: AppNotificationRecord['type'];
    title: string;
    message: string;
  }
): Promise<string> {
  const docId = makeDocId('notif');
  const path = `users/${uid}/notifications/${docId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'notifications', docId), {
      userId: uid,
      type: notif.type,
      title: clampString(notif.title, 120),
      message: clampString(notif.message, 400),
      read: false,
      createdAt: serverTimestamp(),
    });
    return docId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function markNotificationRead(uid: string, notificationId: string): Promise<void> {
  const path = `users/${uid}/notifications/${notificationId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'notifications', notificationId), {
      read: true,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteNotificationRecord(uid: string, notificationId: string): Promise<void> {
  const path = `users/${uid}/notifications/${notificationId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'notifications', notificationId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveTransferRecord(
  uid: string,
  transfer: {
    transferId: string;
    direction: TransferDirection;
    sourceBookmaker: BookmakerId;
    targetBookmaker: BookmakerId;
    originalCode: string;
    targetBookingCode?: string | null;
    targetShareUrl?: string | null;
    status: TransferStatus;
    originalSelectionCount: number;
    matchedCount: number;
    unmatchedCount: number;
    originalCombinedOdds: number;
    targetCombinedOdds?: number | null;
    errorMessage?: string | null;
  }
): Promise<string> {
  const safeId = sanitizeTicketDocId(transfer.transferId) || makeDocId('tr');
  const path = `users/${uid}/transfers/${safeId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'transfers', safeId), {
      userId: uid,
      transferId: safeId,
      direction: transfer.direction,
      sourceBookmaker: transfer.sourceBookmaker,
      targetBookmaker: transfer.targetBookmaker,
      originalCode: clampString(transfer.originalCode || 'MANUAL', 32, 'MANUAL'),
      targetBookingCode: clampString(transfer.targetBookingCode || '', 32),
      targetShareUrl: clampString(transfer.targetShareUrl || '', 300),
      status: transfer.status,
      originalSelectionCount: Math.max(1, Math.min(30, transfer.originalSelectionCount)),
      matchedCount: Math.max(0, Math.min(30, transfer.matchedCount)),
      unmatchedCount: Math.max(0, Math.min(30, transfer.unmatchedCount)),
      originalCombinedOdds: Math.max(1.0, Number(transfer.originalCombinedOdds || 1)),
      targetCombinedOdds: Math.max(0, Number(transfer.targetCombinedOdds || 0)),
      errorMessage: clampString(transfer.errorMessage || '', 300),
      createdAt: serverTimestamp(),
    });
    return safeId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteTransferRecord(uid: string, transferId: string): Promise<void> {
  const safeId = sanitizeTicketDocId(transferId);
  const path = `users/${uid}/transfers/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'transfers', safeId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// ==================================================
// ADMIN-ONLY MIRRORING FOR SHARED PUBLIC TICKETS & AUDIT LOGS
// ==================================================

export async function syncPublicTicketBundle(
  adminUid: string,
  ticket: GeneratedTicket
): Promise<void> {
  const safeId = sanitizeTicketDocId(ticket.internalTicketId);
  const ticketRef = doc(db, 'publicTickets', safeId);
  const updateRef = doc(db, 'publicTicketUpdates', safeId);
  const path = `publicTickets/${safeId}`;

  try {
    const existingTicket = await getDoc(ticketRef);
    if (!existingTicket.exists()) {
      await setDoc(ticketRef, {
        isPublic: true,
        publishedByUid: adminUid,
        internalTicketId: safeId,
        signature: clampString(ticket.signature, 160, safeId),
        bookmakerId: ticket.bookmakerId === 'BETPAWA_TZ' ? 'BETPAWA_TZ' : 'SPORTYBET_TZ',
        sourceType: ticket.sourceType === 'ADMIN_MANUAL' ? 'ADMIN_MANUAL' : 'DAILY_FACTORY',
        categoryId: clampString(ticket.categoryId, 40, 'cat_2_3'),
        categoryLabel: clampString(ticket.categoryLabel, 60, '2.00-3.00'),
        targetOdds: Math.max(1.01, Math.min(100000, ticket.targetOdds)),
        actualCombinedOdds: Math.max(1.01, Math.min(1000000, ticket.actualCombinedOdds)),
        selectionCount: Math.max(1, Math.min(30, ticket.selectionCount)),
        kickoffStartMs: Math.max(0, Number(ticket.kickoffStartMs || 0)),
        kickoffEndMs: Math.max(
          Math.max(0, Number(ticket.kickoffStartMs || 0)),
          Number(ticket.kickoffEndMs || ticket.kickoffStartMs || 0)
        ),
        dataSource: clampString(ticket.dataSource, 120, 'SportyBet TZ'),
        generatedDateKey: clampString(ticket.generatedDateKey, 20, '2026-01-01'),
        originalSelections: ticket.selections.slice(0, 30),
        createdAt: serverTimestamp(),
      });
    }

    const existingUpdate = await getDoc(updateRef);
    const mutableFields = {
      status: ticket.status,
      effectiveCombinedOdds: Math.max(1.0, Math.min(1000000, ticket.effectiveCombinedOdds)),
      shareCode: clampString(ticket.shareCode || '', 32),
      shareUrl: clampString(ticket.shareUrl || '', 300),
      shareCodeVerified: Boolean(ticket.shareCodeVerified),
      bookingCodeStatus: ticket.bookingCodeStatus || 'NOT_REQUESTED',
      bookingCodeError: clampString(ticket.bookingCodeError || '', 300),
      selectionSettlements: ticket.selectionSettlements.slice(0, 30),
      settledAt: clampString(ticket.settledAt || '', 40),
      updatedAt: serverTimestamp(),
    };

    if (!existingUpdate.exists()) {
      await setDoc(updateRef, {
        isPublic: true,
        internalTicketId: safeId,
        ...mutableFields,
        createdAt: serverTimestamp(),
      });
    } else {
      const prevStatus = String(existingUpdate.data()?.status || '');
      if (prevStatus !== 'WON' && prevStatus !== 'LOST' && prevStatus !== 'VOID') {
        await updateDoc(updateRef, mutableFields);
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deletePublicTicketBundle(internalTicketId: string): Promise<void> {
  const safeId = sanitizeTicketDocId(internalTicketId);
  const path = `publicTickets/${safeId}`;
  try {
    await deleteDoc(doc(db, 'publicTickets', safeId));
    await deleteDoc(doc(db, 'publicTicketUpdates', safeId)).catch(() => {});
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveAdminSettingsRecord(
  user: { uid: string; email: string | null },
  cfg: DailyFactoryConfig
): Promise<void> {
  const path = 'adminSettings/default';
  const ref = doc(db, 'adminSettings', 'default');
  try {
    const existing = await getDoc(ref);
    const minOdds = Math.max(1.01, Math.min(100, Number(cfg.minIndividualOdds) || 1.01));
    const maxOdds = Math.max(minOdds, Math.min(1000, Number(cfg.maxIndividualOdds) || 1.25));
    const minSelections = Math.max(1, Math.min(25, Math.round(Number(cfg.minSelections) || 2)));
    const maxSelections = Math.max(
      minSelections,
      Math.min(25, Math.round(Number(cfg.maxSelections) || 15))
    );

    const fields = {
      updatedByUid: user.uid,
      updatedByEmail: clampString(user.email || 'xbotmanager@gmail.com', 254),
      enabled: Boolean(cfg.enabled),
      paused: Boolean(cfg.paused),
      activeBookmaker: cfg.activeBookmaker === 'BETPAWA_TZ' ? 'BETPAWA_TZ' : 'SPORTYBET_TZ',
      minIndividualOdds: minOdds,
      maxIndividualOdds: maxOdds,
      dailyTicketTarget: Math.max(1, Math.min(200, Math.round(cfg.dailyTicketTarget))),
      maxTickets: Math.max(1, Math.min(200, Math.round(cfg.maxTickets))),
      minSelections,
      maxSelections,
      anyMarket: Boolean(cfg.anyMarket),
      markets: cfg.markets.slice(0, 20).map((m) => clampString(m, 40)),
      windowStartTime: clampString(cfg.windowStartTime, 10, '00:00'),
      windowEndTime: clampString(cfg.windowEndTime, 10, '23:59'),
      timezone: clampString(cfg.timezone, 60, 'Africa/Dar_es_Salaam'),
      scheduleIntervalMinutes: Math.max(
        5,
        Math.min(1440, Math.round(cfg.scheduleIntervalMinutes))
      ),
      updatedAt: serverTimestamp(),
    };

    if (!existing.exists()) {
      await setDoc(ref, {
        ...fields,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, fields);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function savePublicStatsRecord(stats: {
  dailyTicketTarget: number;
  totalGeneratedToday: number;
  bookingCodesGeneratedToday: number;
  lastScanningAt: string | null;
  lastSettlementAt: string | null;
}): Promise<void> {
  const path = 'publicStats/daily';
  try {
    await setDoc(doc(db, 'publicStats', 'daily'), {
      isPublic: true,
      dailyTicketTarget: Math.max(1, Math.min(200, Math.round(stats.dailyTicketTarget))),
      totalGeneratedToday: Math.max(0, Math.min(500, Math.round(stats.totalGeneratedToday))),
      bookingCodesGeneratedToday: Math.max(
        0,
        Math.min(500, Math.round(stats.bookingCodesGeneratedToday))
      ),
      lastScanningAt: clampString(stats.lastScanningAt || '', 40),
      lastSettlementAt: clampString(stats.lastSettlementAt || '', 40),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function saveAdminAuditLogRecord(
  user: { uid: string; email: string | null },
  log: AutomationJobLog
): Promise<string> {
  const docId = makeDocId('audit');
  const path = `adminAuditLogs/${docId}`;
  try {
    await setDoc(doc(db, 'adminAuditLogs', docId), {
      scope: 'ADMIN_AUDIT',
      actorUid: user.uid,
      actorEmail: clampString(user.email || 'admin@sportybet.tz', 254),
      actionType: clampString(log.actionType, 40, 'ADMIN_ACTION'),
      status: log.status,
      ticketsGenerated: Math.max(0, Math.min(500, Math.round(log.ticketsGenerated))),
      codesCreated: Math.max(0, Math.min(500, Math.round(log.codesCreated))),
      message: clampString(log.message, 400, 'Action completed'),
      createdAt: serverTimestamp(),
    });
    return docId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export { collection };
