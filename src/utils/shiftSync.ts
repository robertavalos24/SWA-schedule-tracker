import { LogEntry, LogsState, ShiftTombstone, TombstoneMap } from '../types';

// Keep confirmed tombstones for 14 days so offline/secondary devices also drop deleted shifts on Pull/merge.
// Unconfirmed tombstones (cloudConfirmed === false) are NEVER pruned until the cloud confirms the delete.
const CONFIRMED_TOMBSTONE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_CONFIRMED_TOMBSTONES = 400;

export function generateShiftId(): string {
  return `sh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function isValidFirestoreFieldKey(key: string): boolean {
  if (typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (trimmed.length === 0) return false;
  if (/^__.*__$/.test(trimmed)) return false;
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
        cloudConfirmed: true,
        confirmedAt: now,
      };
    }
  }
  return merged;
}

/**
 * Marks tombstones as confirmed once Firestore confirms the delete, and clears old entries
 * ONLY after `cloudConfirmed === true`. Unconfirmed tombstones are never cleared.
 */
export function confirmAndPruneTombstones(
  tombstones: TombstoneMap,
  confirmedLogsInCloud: LogsState,
  now = Date.now()
): TombstoneMap {
  const cloudShiftIds = new Set<string>();
  const normalizedCloud = normalizeLogs(confirmedLogsInCloud, false);
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

    // A tombstone is confirmed once the cloud write succeeded AND the shift is absent from the cloud copy
    const isAbsentInCloud = !cloudShiftIds.has(id);
    const isConfirmed = item.cloudConfirmed || isAbsentInCloud;

    if (!isConfirmed) {
      // Never clear unconfirmed tombstones
      next[id] = { ...item, cloudConfirmed: false };
      continue;
    }

    const confirmedAt = item.confirmedAt || now;
    const age = now - Math.min(item.deletedAt || now, confirmedAt);

    // Clear old entries ONLY after cloud confirms the delete and TTL has elapsed
    if (age <= CONFIRMED_TOMBSTONE_TTL_MS) {
      confirmedList.push({
        ...item,
        id,
        cloudConfirmed: true,
        confirmedAt,
      });
    }
  }

  // Keep most recent confirmed tombstones up to MAX_CONFIRMED_TOMBSTONES
  confirmedList.sort((a, b) => b.deletedAt - a.deletedAt);
  for (const item of confirmedList.slice(0, MAX_CONFIRMED_TOMBSTONES)) {
    next[item.id] = item;
  }

  return next;
}

/**
 * Exports compact `{ [shiftId]: deletedAt }` map to store in Firestore `users/{uid}.deletedShiftIds`
 * so other devices pulling or merging never bring deleted shifts back.
 */
export function buildCloudDeletedIdsMap(tombstones: TombstoneMap): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, t] of Object.entries(tombstones || {})) {
    if (isValidFirestoreFieldKey(id) && t) {
      out[id] = typeof t.deletedAt === 'number' && Number.isFinite(t.deletedAt) ? Math.trunc(t.deletedAt) : Date.now();
    }
  }
  return out;
}

/**
 * Deeply sanitizes a payload before sending to Firestore REST or SDK:
 * - Removes empty string object keys ("") and reserved `__.*__` keys that cause HTTP 400
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
