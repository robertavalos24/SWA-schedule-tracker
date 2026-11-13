import { DeletedKeyMap, LogEntry, LogsState, ShiftTombstone, TombstoneMap } from '../types';

// Keep confirmed ID tombstones for 180 days so offline/secondary devices also drop deleted shifts on Pull/merge.
// Unconfirmed tombstones (cloudConfirmed === false) are NEVER pruned until a fresh read of the cloud copy confirms the shift is gone.
export const CONFIRMED_TOMBSTONE_TTL_MS = 180 * 24 * 60 * 60 * 1000;
export const MAX_CONFIRMED_TOMBSTONES = 400;

// Content-key delete map retention: NEVER trim deletedShiftKeys below 2000 entries or 365 days.
export const DELETED_SHIFT_KEYS_TTL_MS = 365 * 24 * 60 * 60 * 1000;
export const MIN_DELETED_SHIFT_KEYS_KEEP = 2000;
export const HARD_MAX_DELETED_SHIFT_KEYS = 5000;

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

/**
 * Canonical content key for a shift entry on a given date:
 *   date|type|hrs|otRule|label|fmlaCase
 */
export function shiftContentKey(dateKey: string, entry: Partial<LogEntry>): string {
  const cleanDate = String(dateKey || '').trim();
  const cleanType = String(entry?.type || '').trim();
  const parsedHrs =
    typeof entry?.hrs === 'number' ? entry.hrs : parseFloat(String(entry?.hrs ?? ''));
  const safeHrs = Number.isFinite(parsedHrs)
    ? parsedHrs
    : cleanType === 'PERSONAL-NOTE'
      ? 0
      : 8;
  const cleanOtRule = String(entry?.otRule || 'std').trim();
  const cleanLabel = String(entry?.label || '').trim();
  const cleanFmla = String(entry?.fmlaCase || '').trim();
  return `${cleanDate}|${cleanType}|${safeHrs}|${cleanOtRule}|${cleanLabel}|${cleanFmla}`;
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
 * Checks whether any non-HOL-W shift in `rawLogs` is missing a persisted `id`.
 * Used for the one-time legacy ID migration back to Firestore so later loads never mint new IDs.
 */
export function hasEntriesMissingIds(rawLogs: any): boolean {
  if (!rawLogs || typeof rawLogs !== 'object' || Array.isArray(rawLogs)) {
    return false;
  }
  for (const [rawDateKey, entries] of Object.entries(rawLogs)) {
    const dateKey = rawDateKey.trim();
    if (!isValidFirestoreFieldKey(dateKey) || !Array.isArray(entries)) continue;
    for (const rawEntry of entries) {
      if (!rawEntry || typeof rawEntry !== 'object') continue;
      const type = typeof rawEntry.type === 'string' ? rawEntry.type.trim() : '';
      if (!type || type === 'HOL-W') continue;
      if (!rawEntry.id || typeof rawEntry.id !== 'string' || rawEntry.id.trim().length === 0) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Cleans logs and ensures every shift has a stable ID.
 * - NEVER replaces an existing non-empty `entry.id` under any circumstance.
 * - Only assigns an ID when `entry.id` is missing/empty (`generateShiftId()` when `preferFreshIdsForMissing` is true,
 *   or `getDeterministicShiftId` for legacy entries).
 */
export function normalizeLogs(rawLogs: any, preferFreshIdsForMissing = false): LogsState {
  const cleaned: LogsState = {};
  if (!rawLogs || typeof rawLogs !== 'object' || Array.isArray(rawLogs)) {
    return cleaned;
  }

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

      // Keep IDs strictly stable: NEVER replace an existing ID
      if (typeof copy.id === 'string' && copy.id.trim().length > 0) {
        copy.id = copy.id.trim();
      } else if (type === 'HOL-W') {
        copy.id = getDeterministicShiftId(dateKey, copy, occIdx);
      } else if (preferFreshIdsForMissing) {
        copy.id = generateShiftId();
      } else {
        copy.id = getDeterministicShiftId(dateKey, copy, occIdx);
      }

      validEntries.push(copy);
    }

    if (validEntries.length > 0) {
      cleaned[dateKey] = validEntries;
    }
  }

  return cleaned;
}

function buildCombinedDeleteSet(
  localTombstones?: TombstoneMap | Record<string, any> | null,
  cloudDeletedIds?: Record<string, any> | null,
  localDeletedKeys?: DeletedKeyMap | Record<string, any> | null,
  cloudDeletedKeys?: Record<string, any> | null
): Set<string> {
  const deletedSet = new Set<string>();

  const addKeysFromMap = (mapObj?: Record<string, any> | null) => {
    if (!mapObj || typeof mapObj !== 'object') return;
    for (const [k, val] of Object.entries(mapObj)) {
      if (isValidFirestoreFieldKey(k)) {
        deletedSet.add(k.trim());
      }
      if (val && typeof val === 'object' && typeof val.contentKey === 'string' && isValidFirestoreFieldKey(val.contentKey)) {
        deletedSet.add(val.contentKey.trim());
      }
    }
  };

  addKeysFromMap(localTombstones);
  addKeysFromMap(cloudDeletedIds);
  addKeysFromMap(localDeletedKeys);
  addKeysFromMap(cloudDeletedKeys);

  return deletedSet;
}

/**
 * Returns true if `rawLogs` still contains ANY non-HOL-W shift whose `id`, deterministic legacy ID,
 * OR `shiftContentKey(dateKey, entry)` appears in any of the delete lists.
 */
export function logsContainDeletedShift(
  rawLogs: any,
  localTombstones?: TombstoneMap | Record<string, any> | null,
  cloudDeletedIds?: Record<string, any> | null,
  localDeletedKeys?: DeletedKeyMap | Record<string, any> | null,
  cloudDeletedKeys?: Record<string, any> | null
): boolean {
  const normalized = normalizeLogs(rawLogs, false);
  const deletedSet = buildCombinedDeleteSet(
    localTombstones,
    cloudDeletedIds,
    localDeletedKeys,
    cloudDeletedKeys
  );
  if (deletedSet.size === 0) return false;

  for (const [dateKey, entries] of Object.entries(normalized)) {
    for (const entry of entries) {
      if (entry.type === 'HOL-W') continue;
      const cKey = shiftContentKey(dateKey, entry);
      if ((entry.id && deletedSet.has(entry.id)) || deletedSet.has(cKey)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Filters out any non-HOL-W shifts whose `id`, deterministic legacy ID, OR `shiftContentKey(dateKey, entry)`
 * is in EITHER delete list (`deletedShiftIds` or `deletedShiftKeys`, local or cloud).
 * Deletes any date key that becomes empty after filtering.
 */
export function filterLogsWithTombstones(
  rawLogs: LogsState,
  localTombstones?: TombstoneMap | Record<string, any> | null,
  cloudDeletedIds?: Record<string, any> | null,
  localDeletedKeys?: DeletedKeyMap | Record<string, any> | null,
  cloudDeletedKeys?: Record<string, any> | null
): LogsState {
  const normalized = normalizeLogs(rawLogs, false);
  const deletedSet = buildCombinedDeleteSet(
    localTombstones,
    cloudDeletedIds,
    localDeletedKeys,
    cloudDeletedKeys
  );

  if (deletedSet.size === 0) {
    return normalized;
  }

  const result: LogsState = {};
  for (const [dateKey, entries] of Object.entries(normalized)) {
    const kept: LogEntry[] = [];

    for (const entry of entries) {
      if (entry.type === 'HOL-W') {
        kept.push(entry);
        continue;
      }
      const cKey = shiftContentKey(dateKey, entry);
      const isDeleted = Boolean(
        (entry.id && deletedSet.has(entry.id)) ||
        deletedSet.has(cKey)
      );
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
 * Compares prevLogs and nextLogs to record tombstones for every deleted shift by BOTH ID and content key.
 */
export function recordDeletedShifts(
  prevLogs: LogsState,
  nextLogs: LogsState,
  existingTombstones: TombstoneMap,
  existingDeletedKeys: DeletedKeyMap = {}
): {
  updatedTombstones: TombstoneMap;
  updatedDeletedKeys: DeletedKeyMap;
  newlyDeletedIds: string[];
  newlyDeletedKeys: string[];
} {
  const now = Date.now();
  const updated: TombstoneMap = { ...(existingTombstones || {}) };
  const updatedKeys: DeletedKeyMap = { ...(existingDeletedKeys || {}) };
  const newlyDeletedIds: string[] = [];
  const newlyDeletedKeys: string[] = [];

  const nextNormalized = normalizeLogs(nextLogs, false);
  const survivingIds = new Set<string>();
  const survivingContentKeys = new Set<string>();
  for (const [dateKey, entries] of Object.entries(nextNormalized)) {
    for (const entry of entries) {
      if (entry.type === 'HOL-W') continue;
      if (entry.id) survivingIds.add(entry.id);
      survivingContentKeys.add(shiftContentKey(dateKey, entry));
    }
  }

  const prevNormalized = normalizeLogs(prevLogs, false);
  for (const [dateKey, entries] of Object.entries(prevNormalized)) {
    const sigCounts: Record<string, number> = {};
    for (const entry of entries) {
      if (entry.type === 'HOL-W') continue;

      const baseSig = `${entry.type}|${entry.hrs}|${entry.otRule || 'std'}|${entry.label || ''}|${entry.fmlaCase || ''}`;
      const occIdx = sigCounts[baseSig] || 0;
      sigCounts[baseSig] = occIdx + 1;

      const primaryId = entry.id || getDeterministicShiftId(dateKey, entry, occIdx);
      const cKey = shiftContentKey(dateKey, entry);

      const idRemoved = !survivingIds.has(primaryId);
      const contentRemoved = !survivingContentKeys.has(cKey);

      if (idRemoved) {
        updated[primaryId] = {
          id: primaryId,
          date: dateKey,
          contentKey: contentRemoved ? cKey : undefined,
          deletedAt: now,
          cloudConfirmed: false,
        };
        newlyDeletedIds.push(primaryId);
      }

      if (contentRemoved && isValidFirestoreFieldKey(cKey)) {
        updatedKeys[cKey] = now;
        newlyDeletedKeys.push(cKey);
      }
    }
  }

  return {
    updatedTombstones: updated,
    updatedDeletedKeys: updatedKeys,
    newlyDeletedIds,
    newlyDeletedKeys,
  };
}

/**
 * Collects all shift IDs, deterministic legacy IDs, and `shiftContentKey`s in `logs`
 * (used as `restoredShiftIds` for Undo and JSON Backup Restore).
 */
export function collectShiftIdsAndKeys(logs: LogsState): string[] {
  const out = new Set<string>();
  const normalized = normalizeLogs(logs, false);
  for (const [dateKey, entries] of Object.entries(normalized)) {
    const sigCounts: Record<string, number> = {};
    for (const entry of entries) {
      if (entry.type === 'HOL-W') continue;
      if (entry.id && isValidFirestoreFieldKey(entry.id)) {
        out.add(entry.id);
      }
      const baseSig = `${entry.type}|${entry.hrs}|${entry.otRule || 'std'}|${entry.label || ''}|${entry.fmlaCase || ''}`;
      const occIdx = sigCounts[baseSig] || 0;
      sigCounts[baseSig] = occIdx + 1;
      out.add(getDeterministicShiftId(dateKey, entry, occIdx));
      out.add(shiftContentKey(dateKey, entry));
    }
  }
  return Array.from(out);
}

/**
 * Collects `shiftContentKey`s (and IDs) that exist in `nextLogs` and were newly added compared to `prevLogs`,
 * so intentional re-adds (`executeSave`, imports, edits) remove their content key from both delete lists.
 */
export function collectNewlyAddedIdsAndKeys(prevLogs: LogsState, nextLogs: LogsState): string[] {
  const prevKeys = new Set<string>();
  const prevIds = new Set<string>();
  const prevNorm = normalizeLogs(prevLogs, false);
  for (const [dateKey, entries] of Object.entries(prevNorm)) {
    for (const entry of entries) {
      if (entry.type === 'HOL-W') continue;
      if (entry.id) prevIds.add(entry.id);
      prevKeys.add(shiftContentKey(dateKey, entry));
    }
  }

  const added = new Set<string>();
  const nextNorm = normalizeLogs(nextLogs, false);
  for (const [dateKey, entries] of Object.entries(nextNorm)) {
    const sigCounts: Record<string, number> = {};
    for (const entry of entries) {
      if (entry.type === 'HOL-W') continue;
      const baseSig = `${entry.type}|${entry.hrs}|${entry.otRule || 'std'}|${entry.label || ''}|${entry.fmlaCase || ''}`;
      const occIdx = sigCounts[baseSig] || 0;
      sigCounts[baseSig] = occIdx + 1;

      const cKey = shiftContentKey(dateKey, entry);
      const isNewKey = !prevKeys.has(cKey);
      const isNewId = Boolean(entry.id && !prevIds.has(entry.id));
      if (isNewKey || isNewId) {
        added.add(cKey);
        if (entry.id) added.add(entry.id);
        added.add(getDeterministicShiftId(dateKey, entry, occIdx));
      }
    }
  }
  return Array.from(added);
}

/**
 * Removes restored/re-added IDs and content keys from BOTH local delete lists (`tombstones` and `deletedKeys`).
 */
export function removeItemsFromDeleteLists(
  itemsToRemove: Iterable<string>,
  existingTombstones: TombstoneMap,
  existingDeletedKeys: DeletedKeyMap
): { updatedTombstones: TombstoneMap; updatedDeletedKeys: DeletedKeyMap } {
  const removeSet = new Set<string>();
  for (const item of itemsToRemove) {
    if (typeof item === 'string' && item.trim().length > 0) {
      removeSet.add(item.trim());
    }
  }

  if (removeSet.size === 0) {
    return {
      updatedTombstones: { ...(existingTombstones || {}) },
      updatedDeletedKeys: { ...(existingDeletedKeys || {}) },
    };
  }

  const updatedTombstones: TombstoneMap = {};
  for (const [id, t] of Object.entries(existingTombstones || {})) {
    if (removeSet.has(id)) continue;
    if (t?.contentKey && removeSet.has(t.contentKey)) {
      if (id.startsWith('det_')) continue;
      updatedTombstones[id] = { ...t, contentKey: undefined };
    } else {
      updatedTombstones[id] = t;
    }
  }

  const updatedDeletedKeys: DeletedKeyMap = {};
  for (const [k, ts] of Object.entries(existingDeletedKeys || {})) {
    if (!removeSet.has(k)) {
      updatedDeletedKeys[k] = ts;
    }
  }

  return { updatedTombstones, updatedDeletedKeys };
}

/**
 * Backward-compatible helper for removing restored shift IDs from tombstones.
 */
export function removeRestoredIdsFromTombstones(
  restoredLogs: LogsState,
  existingTombstones: TombstoneMap
): TombstoneMap {
  const restored = collectShiftIdsAndKeys(restoredLogs);
  return removeItemsFromDeleteLists(restored, existingTombstones, {}).updatedTombstones;
}

/**
 * Merges cloud `deletedShiftIds` ({ [shiftId]: deletedAtMs }) into local tombstones,
 * skipping any IDs/keys in `excludeIds` (e.g. `restoredShiftIds`).
 */
export function mergeCloudTombstones(
  localTombstones: TombstoneMap,
  cloudDeletedIds?: Record<string, any> | null,
  excludeIds?: Iterable<string>
): TombstoneMap {
  const excluded = new Set<string>(excludeIds || []);
  const merged: TombstoneMap = {};
  for (const [id, t] of Object.entries(localTombstones || {})) {
    if (!excluded.has(id)) {
      merged[id] = t;
    }
  }

  if (!cloudDeletedIds || typeof cloudDeletedIds !== 'object') {
    return merged;
  }

  const now = Date.now();
  for (const [id, rawTs] of Object.entries(cloudDeletedIds)) {
    if (!isValidFirestoreFieldKey(id)) continue;
    const cleanId = id.trim();
    if (excluded.has(cleanId)) continue;
    const deletedAt = typeof rawTs === 'number' && Number.isFinite(rawTs) ? rawTs : now;
    if (!merged[cleanId]) {
      merged[cleanId] = {
        id: cleanId,
        date: '',
        deletedAt,
        cloudConfirmed: false,
      };
    }
  }
  return merged;
}

/**
 * Merges cloud `deletedShiftKeys` ({ [contentKey]: deletedAtMs }) into local `deletedShiftKeys`,
 * skipping any keys in `excludeKeys` (e.g. `restoredShiftIds` or intentionally re-added shifts).
 */
export function mergeCloudDeletedKeys(
  localDeletedKeys: DeletedKeyMap,
  cloudDeletedKeys?: Record<string, any> | null,
  excludeKeys?: Iterable<string>
): DeletedKeyMap {
  const excluded = new Set<string>(excludeKeys || []);
  const merged: DeletedKeyMap = {};
  const now = Date.now();

  for (const [k, ts] of Object.entries(localDeletedKeys || {})) {
    if (!isValidFirestoreFieldKey(k)) continue;
    const cleanKey = k.trim();
    if (excluded.has(cleanKey)) continue;
    merged[cleanKey] = typeof ts === 'number' && Number.isFinite(ts) ? Math.trunc(ts) : now;
  }

  if (cloudDeletedKeys && typeof cloudDeletedKeys === 'object') {
    for (const [k, rawTs] of Object.entries(cloudDeletedKeys)) {
      if (!isValidFirestoreFieldKey(k)) continue;
      const cleanKey = k.trim();
      if (excluded.has(cleanKey)) continue;
      const ts = typeof rawTs === 'number' && Number.isFinite(rawTs) ? Math.trunc(rawTs) : now;
      merged[cleanKey] = merged[cleanKey] ? Math.max(merged[cleanKey], ts) : ts;
    }
  }

  return pruneDeletedShiftKeys(merged, null, now);
}

/**
 * Prunes `deletedShiftKeys` while strictly obeying:
 *   NEVER trim `deletedShiftKeys` below 2000 entries OR 365 days!
 * An entry is kept if it is within the newest 2000 entries OR if its age is <= 365 days
 * (and if `freshCloudLogs` still contains that content key, its timestamp stays active),
 * bounded only by `HARD_MAX_DELETED_SHIFT_KEYS` (5000) to protect Firestore's 1MB document limit.
 */
export function pruneDeletedShiftKeys(
  keysMap: Record<string, any> | null | undefined,
  freshCloudLogs?: LogsState | null,
  now = Date.now()
): DeletedKeyMap {
  if (!keysMap || typeof keysMap !== 'object') return {};

  const activeCloudContentKeys = new Set<string>();
  if (freshCloudLogs && typeof freshCloudLogs === 'object') {
    const norm = normalizeLogs(freshCloudLogs, false);
    for (const [dateKey, entries] of Object.entries(norm)) {
      for (const entry of entries) {
        if (entry.type === 'HOL-W') continue;
        activeCloudContentKeys.add(shiftContentKey(dateKey, entry));
      }
    }
  }

  const validPairs: [string, number][] = [];
  for (const [rawKey, rawTs] of Object.entries(keysMap)) {
    if (!isValidFirestoreFieldKey(rawKey)) continue;
    const cleanKey = rawKey.trim();
    const ts = typeof rawTs === 'number' && Number.isFinite(rawTs) ? Math.trunc(rawTs) : now;
    validPairs.push([cleanKey, ts]);
  }

  validPairs.sort((a, b) => b[1] - a[1]);

  const out: DeletedKeyMap = {};
  let count = 0;
  for (let i = 0; i < validPairs.length; i++) {
    if (count >= HARD_MAX_DELETED_SHIFT_KEYS) break;
    const [key, ts] = validPairs[i];
    const age = now - ts;
    const stillInCloud = activeCloudContentKeys.has(key);

    // Never trim below 2000 entries OR 365 days
    if (i < MIN_DELETED_SHIFT_KEYS_KEEP || age <= DELETED_SHIFT_KEYS_TTL_MS || stillInCloud) {
      out[key] = ts;
      count++;
    }
  }

  return out;
}

/**
 * Marks ID tombstones as confirmed ONLY when a fresh read of the cloud copy shows the shift is gone
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
 * Exports `{ [contentKey]: deletedAt }` map (never trimmed below 2000 entries or 365 days)
 * to store in Firestore `users/{uid}.deletedShiftKeys`.
 */
export function buildCloudDeletedKeysMap(
  deletedKeys: DeletedKeyMap,
  tombstones?: TombstoneMap
): DeletedKeyMap {
  const raw: DeletedKeyMap = {};
  const now = Date.now();

  if (tombstones && typeof tombstones === 'object') {
    for (const t of Object.values(tombstones)) {
      if (t?.contentKey && isValidFirestoreFieldKey(t.contentKey)) {
        raw[t.contentKey.trim()] =
          typeof t.deletedAt === 'number' && Number.isFinite(t.deletedAt) ? Math.trunc(t.deletedAt) : now;
      }
    }
  }

  for (const [k, ts] of Object.entries(deletedKeys || {})) {
    if (isValidFirestoreFieldKey(k)) {
      const cleanKey = k.trim();
      const safeTs = typeof ts === 'number' && Number.isFinite(ts) ? Math.trunc(ts) : now;
      raw[cleanKey] = raw[cleanKey] ? Math.max(raw[cleanKey], safeTs) : safeTs;
    }
  }

  return pruneDeletedShiftKeys(raw, null, now);
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
      if (k === '_origIdx' || k === '_updateTime' || k === '_hadInvalidCloudKeys') continue;
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
