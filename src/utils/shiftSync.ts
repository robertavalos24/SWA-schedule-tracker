import { LogEntry, LogsState, ShiftTombstone, TombstoneMap } from '../types';

// Keep confirmed tombstones for 180 days so offline/secondary devices also drop deleted shifts on Pull/merge.
// Unconfirmed tombstones (cloudConfirmed === false) are NEVER pruned until a fresh read of the cloud copy confirms the shift is gone.
export const CONFIRMED_TOMBSTONE_TTL_MS = 180 * 24 * 60 * 60 * 1000;
export const MAX_CONFIRMED_TOMBSTONES = 400;

export function generateShiftId(): string {
  return `sh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function isValidFirestoreFieldKey(key: string): boolean {
  if (typeof key !== 'string') return false;
  if (key.length === 0) return false;
  const trimmed = key.trim();
  if (trimmed.length === 0) return false;
  if (/^__.*__$/.test(key) || /^__.*__$/.test(trimmed)) return false;
  return true;
}

export function getDeterministicShiftId(dateKey: string, entry: LogEntry, occurrenceIndex = 0): string {
  if (entry.type === 'HOL-W') {
    return `holw_${dateKey}_${occurrenceIndex}`;
  }
  const safeHrs = typeof entry.hrs === 'number' && Number.isFinite(entry.hrs)
    ? entry.hrs
    : parseFloat(String(entry.hrs)) || 0;
  const rule = entry.otRule || 'std';
  const label = (entry.label || '').trim();
  const fmla = (entry.fmlaCase || '').trim();
  const raw = `det_${dateKey}_${entry.type}_${safeHrs}_${rule}_${label}_${fmla}_${occurrenceIndex}`;
  return raw.replace(/[^a-zA-Z0-9_\-:]/g, '_');
}

/**
 * Cleans logs and ensures every shift has a stable ID.
 * - Strips empty/invalid date keys and empty arrays.
 * - Preserves existing entry.id if present; otherwise assigns a deterministic ID (for legacy/cloud entries)
 *   or a fresh unique ID when `preferFreshIdsForMissing` is true.
 */
export function normalizeLogs(rawLogs: any, preferFreshIdsForMissing = false): LogsState {
  const cleaned: LogsState = {};
  if (!rawLogs || typeof rawLogs !== 'object' || Array.isArray(rawLogs)) {
    return cleaned;
  }

  const seenIds = new Set<string>();

  for (const [rawDateKey, entries] of Object.entries(rawLogs)) {
    const dateKey = rawDateKey.trim();
    if (!isValidFirestoreFieldKey(dateKey) || !Array.isArray(entries)) {
      continue;
    }

    const sigCounts: Record<string, number> = {};
    const validEntries: LogEntry[] = [];

    for (const rawEntry of entries) {
      if (!rawEntry || typeof rawEntry !== 'object') continue;
      const type = typeof rawEntry.type === 'string' ? rawEntry.type.trim() : '';
      if (!type) continue;

      const parsedHrs = typeof rawEntry.hrs === 'number' ? rawEntry.hrs : parseFloat(String(rawEntry.hrs));
      const safeHrs = Number.isFinite(parsedHrs) ? parsedHrs : (type === 'PERSONAL-NOTE' ? 0 : 8);

      const copy: LogEntry = {
        ...rawEntry,
        type,
        hrs: safeHrs,
      };
      delete copy._origIdx;

      if (copy.unpaidHrs !== undefined) {
        const uHrs = Number(copy.unpaidHrs);
        copy.unpaidHrs = Number.isFinite(uHrs) ? uHrs : 0;
      }

      const baseSig = `${type}|${safeHrs}|${copy.otRule || 'std'}|${copy.label || ''}|${copy.fmlaCase || ''}`;
      const occIdx = sigCounts[baseSig] || 0;
      sigCounts[baseSig] = occIdx + 1;

      if (!copy.id || typeof copy.id !== 'string' || copy.id.trim().length === 0) {
        if (type === 'HOL-W') {
          copy.id = getDeterministicShiftId(dateKey, copy, occIdx);
        } else if (preferFreshIdsForMissing) {
          copy.id = generateShiftId();
        } else {
          copy.id = getDeterministicShiftId(dateKey, copy, occIdx);
        }
      } else if (seenIds.has(copy.id) && type !== 'HOL-W') {
        // If a shift was duplicated or split by balance calculation, give the second copy a distinct ID
        copy.id = preferFreshIdsForMissing ? generateShiftId() : getDeterministicShiftId(dateKey, copy, occIdx);
      }

      seenIds.add(copy.id);
      validEntries.push(copy);
    }

    if (validEntries.length > 0) {
      cleaned[dateKey] = validEntries;
    }
  }

  return cleaned;
}

/**
 * Filters out any shifts whose ID (explicit `sh_...` or deterministic legacy `det_...` assigned to ID-less shifts)
 * is on the tombstone list. Deletes any date key that becomes empty after filtering.
 */
export function filterLogsWithTombstones(
  rawLogs: LogsState,
  localTombstones: TombstoneMap,
  cloudDeletedIds?: Record<string, number> | null
): LogsState {
  const normalized = normalizeLogs(rawLogs, false);
  const deletedSet = new Set<string>(Object.keys(localTombstones || {}));
  if (cloudDeletedIds && typeof cloudDeletedIds === 'object') {
    for (const id of Object.keys(cloudDeletedIds)) {
      if (isValidFirestoreFieldKey(id)) {
        deletedSet.add(id);
      }
    }
  }

  if (deletedSet.size === 0) {
    return normalized;
  }

  const result: LogsState = {};
  for (const [dateKey, entries] of Object.entries(normalized)) {
    const kept: LogEntry[] = [];

    for (const entry of entries) {
      const isDeleted = Boolean(entry.id && entry.type !== 'HOL-W' && deletedSet.has(entry.id));
      if (!isDeleted) {
        kept.push(entry);
      }
    }

    if (kept.length > 0) {
      result[dateKey] = kept;
    }
  }

  return result;
}

/**
 * Compares prevLogs and nextLogs to record tombstones for every deleted shift.
 * Marks newly deleted shift IDs with `cloudConfirmed: false` until Firestore confirms the write.
 */
export function recordDeletedShifts(
  prevLogs: LogsState,
  nextLogs: LogsState,
  existingTombstones: TombstoneMap
): { updatedTombstones: TombstoneMap; newlyDeletedIds: string[] } {
  const now = Date.now();
  const updated: TombstoneMap = { ...(existingTombstones || {}) };
  const newlyDeletedIds: string[] = [];

  const nextNormalized = normalizeLogs(nextLogs, false);
  const survivingIds = new Set<string>();
  for (const entries of Object.values(nextNormalized)) {
    for (const entry of entries) {
      if (entry.id) survivingIds.add(entry.id);
    }
  }

  const prevNormalized = normalizeLogs(prevLogs, false);
  for (const [dateKey, entries] of Object.entries(prevNormalized)) {
    for (const entry of entries) {
      if (entry.type === 'HOL-W') continue;

      const primaryId = entry.id || getDeterministicShiftId(dateKey, entry, 0);

      if (!survivingIds.has(primaryId)) {
        updated[primaryId] = {
          id: primaryId,
          date: dateKey,
          deletedAt: now,
          cloudConfirmed: false,
        };
        newlyDeletedIds.push(primaryId);
      }
    }
  }

  return { updatedTombstones: updated, newlyDeletedIds };
}

/**
 * Removes restored shift IDs from tombstones (used during Undo or JSON Backup Restore).
 */
export function removeRestoredIdsFromTombstones(
  restoredLogs: LogsState,
  existingTombstones: TombstoneMap
): TombstoneMap {
  const updated: TombstoneMap = { ...(existingTombstones || {}) };
  const normalized = normalizeLogs(restoredLogs, false);
  for (const [dateKey, entries] of Object.entries(normalized)) {
    const sigCounts: Record<string, number> = {};
    for (const entry of entries) {
      if (entry.id) delete updated[entry.id];
      const baseSig = `${entry.type}|${entry.hrs}|${entry.otRule || 'std'}|${entry.label || ''}|${entry.fmlaCase || ''}`;
      const occIdx = sigCounts[baseSig] || 0;
      sigCounts[baseSig] = occIdx + 1;
      delete updated[getDeterministicShiftId(dateKey, entry, occIdx)];
    }
  }
  return updated;
}

/**
 * Merges cloud `deletedShiftIds` ({ [shiftId]: deletedAtMs }) into local tombstones.
 */
export function mergeCloudTombstones(
  localTombstones: TombstoneMap,
  cloudDeletedIds?: Record<string, any> | null
): TombstoneMap {
  const merged: TombstoneMap = { ...(localTombstones || {}) };
  if (!cloudDeletedIds || typeof cloudDeletedIds !== 'object') {
    return merged;
  }

  const now = Date.now();
  for (const [id, rawTs] of Object.entries(cloudDeletedIds)) {
    if (!isValidFirestoreFieldKey(id)) continue;
    const deletedAt = typeof rawTs === 'number' && Number.isFinite(rawTs) ? rawTs : now;
    if (!merged[id]) {
      merged[id] = {
        id,
        date: '',
        deletedAt,
        cloudConfirmed: false,
      };
    }
  }
  return merged;
}

/**
 * Marks tombstones as confirmed ONLY when a fresh read of the cloud copy shows the shift is gone
 * (never based on the outgoing payload we just sent), and clears old entries ONLY after
 * `cloudConfirmed === true` and 180 days (`CONFIRMED_TOMBSTONE_TTL_MS`) have elapsed.
 */
export function confirmAndPruneTombstones(
  tombstones: TombstoneMap,
  freshCloudLogs: LogsState | null | undefined,
  now = Date.now()
): TombstoneMap {
  // Without a fresh read of the cloud copy, never mark unconfirmed tombstones as confirmed or prune them
  if (freshCloudLogs === null || freshCloudLogs === undefined || typeof freshCloudLogs !== 'object') {
    return { ...(tombstones || {}) };
  }

  const cloudShiftIds = new Set<string>();
  const normalizedCloud = normalizeLogs(freshCloudLogs, false);
  for (const [dateKey, entries] of Object.entries(normalizedCloud)) {
    const sigCounts: Record<string, number> = {};
    for (const entry of entries) {
      if (entry.id) cloudShiftIds.add(entry.id);
      const baseSig = `${entry.type}|${entry.hrs}|${entry.otRule || 'std'}|${entry.label || ''}|${entry.fmlaCase || ''}`;
      const occIdx = sigCounts[baseSig] || 0;
      sigCounts[baseSig] = occIdx + 1;
      cloudShiftIds.add(getDeterministicShiftId(dateKey, entry, occIdx));
    }
  }

  const next: TombstoneMap = {};
  const confirmedList: ShiftTombstone[] = [];

  for (const [id, item] of Object.entries(tombstones || {})) {
    if (!isValidFirestoreFieldKey(id) || !item) continue;

    // A tombstone is confirmed ONLY if a fresh read of the cloud copy shows the shift is actually gone
    const isGoneInFreshCloudRead = !cloudShiftIds.has(id);

    if (!isGoneInFreshCloudRead) {
      // Shift still exists in cloud — keep unconfirmed and never prune
      next[id] = {
        ...item,
        id,
        cloudConfirmed: false,
        confirmedAt: undefined,
      };
      continue;
    }

    const confirmedAt = item.cloudConfirmed && item.confirmedAt ? item.confirmedAt : now;
    const ageSinceConfirmed = now - confirmedAt;

    // Clear old entries ONLY after cloud confirms the delete and 180-day TTL has elapsed
    if (ageSinceConfirmed <= CONFIRMED_TOMBSTONE_TTL_MS) {
      confirmedList.push({
        ...item,
        id,
        cloudConfirmed: true,
        confirmedAt,
      });
    }
  }

  // Keep most recent confirmed tombstones up to MAX_CONFIRMED_TOMBSTONES (400)
  confirmedList.sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
  for (const item of confirmedList.slice(0, MAX_CONFIRMED_TOMBSTONES)) {
    next[item.id] = item;
  }

  return next;
}

/**
 * Caps a `{ [shiftId]: deletedAtMs }` map at the newest `maxEntries` (default 400)
 * so the Firestore document's `deletedShiftIds` map cannot grow unboundedly.
 */
export function capCloudDeletedIds(
  idsMap: Record<string, any> | null | undefined,
  maxEntries = MAX_CONFIRMED_TOMBSTONES
): Record<string, number> {
  if (!idsMap || typeof idsMap !== 'object') return {};
  const now = Date.now();
  const validPairs: [string, number][] = [];

  for (const [rawKey, rawTs] of Object.entries(idsMap)) {
    if (!isValidFirestoreFieldKey(rawKey)) continue;
    const ts = typeof rawTs === 'number' && Number.isFinite(rawTs) ? Math.trunc(rawTs) : now;
    validPairs.push([rawKey.trim(), ts]);
  }

  validPairs.sort((a, b) => b[1] - a[1]);

  const out: Record<string, number> = {};
  for (const [key, ts] of validPairs.slice(0, maxEntries)) {
    out[key] = ts;
  }
  return out;
}

/**
 * Exports compact `{ [shiftId]: deletedAt }` map (capped at newest 400) to store in Firestore `users/{uid}.deletedShiftIds`.
 */
export function buildCloudDeletedIdsMap(tombstones: TombstoneMap): Record<string, number> {
  const raw: Record<string, number> = {};
  for (const [id, t] of Object.entries(tombstones || {})) {
    if (isValidFirestoreFieldKey(id) && t) {
      raw[id] = typeof t.deletedAt === 'number' && Number.isFinite(t.deletedAt) ? Math.trunc(t.deletedAt) : Date.now();
    }
  }
  return capCloudDeletedIds(raw, MAX_CONFIRMED_TOMBSTONES);
}

/**
 * Recursively checks whether an object contains any empty "" or `__reserved__` keys.
 */
export function hasInvalidFirestoreKeys(val: any): boolean {
  if (!val || typeof val !== 'object') return false;
  if (Array.isArray(val)) {
    return val.some(item => hasInvalidFirestoreKeys(item));
  }
  for (const [k, v] of Object.entries(val)) {
    if (!isValidFirestoreFieldKey(k)) {
      return true;
    }
    if (hasInvalidFirestoreKeys(v)) {
      return true;
    }
  }
  return false;
}

/**
 * Deeply sanitizes a payload before sending to Firestore REST or SDK:
 * - Removes empty string object/date keys ("") and reserved `__.*__` keys without altering real shifts
 * - Removes transient `_origIdx` and `undefined` fields
 * - Replaces NaN / Infinity numbers with 0
 */
export function sanitizeForFirestore(val: any): any {
  if (val === undefined) return undefined;
  if (val === null || typeof val === 'boolean' || typeof val === 'string') return val;
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : 0;
  }
  if (Array.isArray(val)) {
    return val
      .map(item => sanitizeForFirestore(item))
      .filter(item => item !== undefined);
  }
  if (typeof val === 'object') {
    const cleanObj: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (k === '_origIdx') continue;
      if (!isValidFirestoreFieldKey(k)) continue;
      const sv = sanitizeForFirestore(v);
      if (sv !== undefined) {
        cleanObj[k.trim()] = sv;
      }
    }
    return cleanObj;
  }
  return String(val);
}
