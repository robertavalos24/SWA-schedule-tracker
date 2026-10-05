# User Data Isolation & Secure Guest State

Ensure personal salary figures, pay raise history, and shift logs are strictly isolated to authenticated user accounts, guaranteeing that private browsing tabs, unauthenticated launches, and guest sessions start with clean blank templates without leaking previous user data.

### User Review & Critical Decisions

> [!IMPORTANT]
> **Confirmed Choices from Phase 1 Discovery**:
> - **Default Salary & Pay History for Guest / New Launch**: Clean blank values requiring explicit user entry or sign-in (no hardcoded salary or past personal pay raises).
> - **Session & Storage Isolation**: Strict partition between authenticated user accounts and guest sessions. Guests receive an unpopulated template, while authenticated users load and persist their data exclusively under their verified Firebase UID (`users/{uid}`).

- **Confirmed Decision 1**: Remove all hardcoded personal salaries (`$89,582.90`, `$60,000.00`, etc.) and pay raise records from `defaultSettings` in the application code.
- **Confirmed Decision 2**: Scoped Local Storage & Clean Logout: Prefix cached keys with the authenticated user's UID (`swa_${uid}_...`), and immediately wipe in-memory state back to the clean blank template on logout or guest initialization.

---

### 1. Overview & Core Concept

- **What It Does**: Enforces strict user isolation across all storage and display layers. When anyone launches the application in a private window, incognito tab, or unauthenticated session, the app presents a clean, neutral template with blank salary fields and empty history. Only upon signing into an authorized Google/Firebase account will that user's personal salary, historical adjustments, shift logs, and settings load from their private Firestore document.
- **Target Audience / Persona**: Airline crew members and shift schedulers sharing devices, testing in incognito/private windows, or demonstrating shift tracking tools to colleagues without exposing personal wage data.
- **Key Value**: Guarantees zero wage leakage across devices, browser tabs, or guest launches.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. *Unauthenticated / Private Launch*: User opens app in a private tab. Paycheck summary and salary settings show clean blank placeholders (e.g. `$0.00` / `Enter base salary` / `No history logged`). A clear prompt invites them to log in with Google to retrieve their saved profile or enter their own values.
  2. *Sign In Flow*: Clicking "Sign In with Google" retrieves the user's private document (`users/{uid}`). All personal wages, custom rules, FMLA cases, and logs seamlessly populate with a subtle save indicator.
  3. *Sign Out Flow*: Clicking "Sign Out" completely purges sensitive session data from memory and UI, returning the dashboard to the blank guest zero-state without reloading or leaving lingering values.
- **Visual Identity & Clean State**:
  - Empty wage metric displays use soft tabular styling (`$0.00`) and quiet placeholders rather than broken errors.
  - Pay History modal displays an inviting empty state illustration/banner: *"No pay adjustments recorded yet. Add your first merit raise or promotion."*
  - Censorship shielding toggle remains readily accessible for in-person sharing.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Elimination of Embedded Personal Seeds**
  - *Chosen Approach*: Replace hardcoded `$89k` / `$60k` pay history arrays with an empty array `[]` and blank salary `''` in `defaultSettings`.
  - *Why*: Hardcoded defaults in code ship to every client bundle and appear whenever storage is cold or private. Clean defaults preserve privacy by design.
- **Decision 2: User-Scoped Local Caching (`swa_${uid}_*`)**
  - *Chosen Approach*: When a user is signed in, local storage keys are namespaced with their UID. Unauthenticated guest actions remain in temporary session keys that do not overwrite or cross-contaminate user profiles.
  - *Why*: Prevents browser cross-contamination if multiple users sign in from the same machine or if a guest uses the device after an employee.
- **Decision 3: Complete Logout Memory Purge**
  - *Chosen Approach*: The `logout` handler actively clears React state back to `defaultSettings` and wipes active user cache keys.
  - *Why*: Prevents stale in-memory state from remaining visible after authentication terminates.

---

### 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                       Client Browser                        │
│                                                             │
│   ┌──────────────────────────┐   ┌──────────────────────┐   │
│   │  Guest / Private Launch  │   │  Authenticated User  │   │
│   │   (No Auth Token / UID)  │   │     (Firebase UID)   │   │
│   └─────────────┬────────────┘   └──────────┬───────────┘   │
│                 │                           │               │
│                 ▼                           ▼               │
│       ┌───────────────────┐       ┌───────────────────┐     │
│       │  defaultSettings  │       │ Scoped User Cache │     │
│       │   (Blank Wages,   │       │  (swa_${uid}_*)   │     │
│       │   Empty History)  │       └─────────┬─────────┘     │
│       └───────────────────┘                 │               │
└─────────────────────────────────────────────┼───────────────┘
                                              │ Firestore Sync
                                              ▼
                             ┌─────────────────────────────────┐
                             │       Firestore Database        │
                             │      /users/{uid} Document      │
                             │  - settings (salary, raises)    │
                             │  - logs (shifts, time off)      │
                             │  - midCounts, fmlaCases         │
                             └─────────────────────────────────┘
```

- **State Reset Logic (`useScheduleData.ts`)**:
  - Set `salary: ''` and `payHistory: []` in `defaultSettings`.
  - When `user` transitions to `null` (logout), trigger `resetToDefaults()`.
  - When `user` transitions from `null` to `User` (login), load user-namespaced storage or fetch Firestore document `users/${user.uid}`.
- **Security Invariants**:
  - `firestore.rules` already enforces `request.auth.uid == userId` for `/users/{userId}`.
  - No client payload from an unauthenticated user can overwrite an existing user's cloud document.
