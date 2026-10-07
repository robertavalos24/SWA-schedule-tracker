# Authoritative Cloud Overwrite & Instant Shift Deletion Sync

A permanent fix for deleted calendar shifts reappearing upon cloud synchronization. Replaces recursive Firestore map-merging with atomic field replacement on auto-sync and an authoritative document overwrite on manual "Push".

### User Review & Critical Decisions

> [!IMPORTANT]
> **Confirmed Decision**: The user chose **"Authoritative Push and instant delete sync"**.
> - Shifts deleted on the calendar (such as a tentative overtime/double-time shift) will be immediately removed from the Firestore cloud database rather than revived by background merge listeners.
> - The **"Push"** button will perform an authoritative, complete write of the user's local schedule data to Firestore, overwriting any stale data in the cloud with whatever is currently on screen.

---

### 1. Overview & Core Concept

- **The Problem**: When a shift is deleted from a day that has no other shifts, the key for that date (e.g. `"2026-10-01"`) is completely removed from the local JavaScript `logs` object. However, background Firestore synchronization was using `setDoc(..., { merge: true })` and REST `PATCH`. In Firestore, `merge: true` merges nested maps recursively—meaning missing map keys are treated as "unchanged" rather than "deleted". The cloud document kept the old shift, and subsequent Firestore snapshot events or cloud pulls resurrected the deleted shift back onto the calendar.
- **The Solution**:
  1. **Atomic Field Replacement on Shift Updates**: When auto-syncing `logs`, use Firestore's `{ mergeFields: ['logs'] }` (or direct field-level overwrite in REST) so Firestore replaces the entire `logs` dictionary rather than merging keys. This ensures any date removed locally is immediately eradicated from the cloud.
  2. **Authoritative Overwrite on Push**: When the user clicks the "Push" button in the header, execute a true document write (`setDoc(docRef, fullData)`) that completely replaces the remote Firestore document with the local active state.
  3. **Snapshot Guard**: Avoid overwriting recent in-memory local deletions when receiving snapshot updates if a local write is in-flight.

---

### 2. User Experience & Visual Design

- **Shift Deletion Flow**:
  - User clicks delete (`x` / Trash) on a shift on any date.
  - The shift immediately vanishes from the calendar cell.
  - A green toast indicates `"Changes saved"`.
  - Background cloud sync atomically replaces the cloud `logs` map. The deleted date key is removed in Firestore.
- **Manual "Push" Flow**:
  - User clicks **"Push"** in the top header.
  - Toast displays `"Pushing local data to Cloud..."`.
  - The complete active schedule (all logs, mid counts, FMLA cases, settings, and card preferences) is written authoritatively to Firestore, overwriting any previous cloud state.
  - Toast confirms `"Data pushed to cloud successfully!"`.
- **Cloud "Pull" / Reload Flow**:
  - When the app pulls from the cloud or reloads, the deleted shift remains gone permanently.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Atomic `logs` Field Overwrite vs. Storing Tombstones**
  - *Chosen Approach*: Atomic replacement of the `logs` map field via `{ mergeFields: ['logs'] }`.
  - *Why*: It keeps data size minimal, leaves no tombstone clutter, and is natively supported by Firestore. When the date key is omitted, it is deleted from the cloud map.
  - *Alternatives Considered*: Storing empty arrays (`"2026-10-01": []`). While that would also hide the shift, it clutters storage and could cause empty badges or lingering keys.
- **Decision 2: True Authoritative Overwrite on Manual "Push"**
  - *Chosen Approach*: On manual "Push", write the entire document without `merge: true`.
  - *Why*: The "Push" button is explicitly an intentional user action to enforce local state onto the cloud. It guarantees that whatever the user sees is 100% identical to what is saved in Firebase.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────┐
│                   Calendar UI                          │
│   (User deletes OT / DT shift on 2026-10-01)          │
└──────────────────────────┬─────────────────────────────┘
                           │ 1. delete newLogs[ds]
                           ▼
┌────────────────────────────────────────────────────────┐
│              useScheduleData.updateLogs                │
│   - Update React state & localStorage                  │
│   - Trigger syncToFirebase({ logs: processedLogs })    │
└──────────────────────────┬─────────────────────────────┘
                           │ 2. Atomic field replacement
                           ▼
┌────────────────────────────────────────────────────────┐
│              useFirebaseSync.syncToFirebase            │
│   - SDK: setDoc(docRef, data, { mergeFields })         │
│   - REST: updateMask.fieldPaths=logs                   │
│   - Completely replaces remote 'logs' map in Firestore │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│           Firestore Cloud Storage                      │
│   - '2026-10-01' key is removed                        │
│   - Snapshot event emits clean logs                    │
│   - Shift NEVER reappears                              │
└────────────────────────────────────────────────────────┘
```

- **File Modifications Required**:
  - `src/hooks/useFirebaseSync.ts`:
    - Update `syncToFirebase`: Accept an optional `fieldList` or `isAuthoritative` flag. When updating partial data like `{ logs }`, specify `mergeFields: Object.keys(sanitizedData)`. When `isAuthoritative: true` (used by Push), execute `setDoc(docRef, sanitizedData)` without merge.
    - Update `directRestSync`: Include `updateMask.fieldPaths` in query parameters when syncing specific fields so the REST API also performs an exact field replacement.
  - `src/hooks/useScheduleData.ts`:
    - Pass `isAuthoritative: true` from `forceSyncToCloud` so the "Push" button completely overwrites the cloud document.
    - Ensure `handleDocSnapshot` respects in-flight local modifications.
