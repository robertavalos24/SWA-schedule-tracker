# Mobile Workflow Polish: Overview Collapse, Attendance Metrics, and Quick Menu Modals

Resolves mobile layout and navigation issues in LUV TRACKER: adds a single toggle to collapse Settings and Stats above the Calendar on mobile, replaces blank Hours and Est Pay with Attendance Points and Next Drop Date in the compact stat ribbon, and fixes the FMLA and Pay Tables quick buttons in the bottom menu.

## Confirmed User Decisions

> [!IMPORTANT]
> The following architectural decisions were selected:
> - **Collapsed Stat Ribbon Metrics**: Replace the blank Hours and Est Pay with **Attendance Points** and **Next Drop Date** (alongside Status and Avail PTO).
> - **Pay Tables Quick Button**: Connect the button in the bottom menu to **Pay Change History & Step Scales** (`openModal('payHistory')`).
> - **FMLA & Cases Quick Button**: Connect the button in the bottom menu to **FMLA Manager** (`openModal('fmlaManager')`).
> - **Top Panel Collapsing**: Add a **Single Toggle** to collapse Settings Bar and Stats Dashboard above the Calendar on mobile, allowing full-screen focus on the monthly schedule.

---

## 1. Overview & Root Cause Analysis

1. **Broken Bottom Menu Quick Buttons**: In `MobileBottomNav.tsx`, the menu buttons dispatched `onOpenModal('fmlaSummary')` and `onOpenModal('payTable')`. Neither ID existed in `useModalStore`, causing silent failure. The app's actual registered modals are `fmlaManager` and `payHistory`.
2. **Blank "Hours" and "Est Pay" in Mobile Ribbon**: The compact mobile ribbon in `Dashboard.tsx` accessed `stats.workedHrs` and `stats.estimatedGrossPay`, which were not exported by the monthly calculation engine. Per user preference, these will be replaced with real-time **Attendance Points** and **Next Drop Date**, providing high-value attendance tracking for Southwest Airlines crew members.
3. **Mobile Screen Crowding**: On phones, the Settings Bar and Dashboard push the Calendar view down the screen. Adding a dedicated single toggle will collapse both panels into a clean strip, giving 100% viewport prominence directly to the interactive calendar.

---

## 2. Implementation Steps

### Phase 1: Fix Bottom Menu Quick Buttons (`src/components/MobileBottomNav.tsx`)
- Update the **FMLA & Cases** button handler:
  - Change `onOpenModal('fmlaSummary')` $\longrightarrow$ `onOpenModal('fmlaManager')`.
- Update the **Pay Tables** button handler:
  - Change `onOpenModal('payTable')` $\longrightarrow$ `onOpenModal('payHistory')`.
- In the Mobile Drawer's mini stats preview, harmonize metrics to reflect active worked hours (`totalHrsWorked`) and attendance points cleanly.

### Phase 2: Update Mobile Compact Stat Ribbon (`src/components/Dashboard.tsx`)
- Replace the first two slots (`Hours` and `Est. Pay`) in the 4-column mobile ribbon:
  1. **Points**: Display `stats.unptoHrs || 0` with point badge/indicator.
  2. **Next Drop Date**: Display `stats.dropDateText !== 'N/A' ? stats.dropDateText : 'None'` with days countdown (`${attDays}d`).
  3. **Status**: Display `stats.attLetter || 'Clean'` with corresponding status color.
  4. **Avail PTO**: Display `${formatPto(stats.ptoEnd || 0)}h`.

### Phase 3: Single Mobile Overview Collapse Toggle (`src/App.tsx`)
- Introduce a persistent mobile state `isMobileOverviewCollapsed` backed by `localStorage` (`swa_mobileOverviewCollapsed`).
- Place a clean, responsive mobile toggle bar directly under the header / PWA banner:
  - Displays: **"Collapse Overview (Focus on Calendar)"** / **"Show Overview (Settings & Stats)"**.
- Conditionally apply responsive classes:
  - When collapsed on mobile: `SettingsBar` and `Dashboard` are hidden on small screens (`hidden sm:block`) while remaining completely visible on desktop.
  - When expanded on mobile: smoothly displays Settings and Stats cards.
- The Calendar and Month Controls remain immediately accessible at the top of the mobile viewport.

### Phase 4: Build Verification & Testing
- Run `compile_applet` and `lint_applet` to confirm zero TypeScript warnings or regressions.
- Verify modal triggers, collapse state toggling, and stat ribbon rendering.

---

## 3. Verification Plan

### Automated Checks
- `compile_applet`: Verify successful Vite build and bundle output.
- `lint_applet`: Ensure strict TypeScript and ESLint compliance across modified components.

### Functional Verification
- Tap **FMLA & Cases** from the bottom menu $\longrightarrow$ verifies `fmlaManager` modal opens smoothly.
- Tap **Pay Tables** from the bottom menu $\longrightarrow$ verifies `payHistory` modal (Pay Change History & Step Scales) opens smoothly.
- Tap the **Mobile Overview Toggle** $\longrightarrow$ verifies Settings Bar and Stats collapse, bringing the Calendar directly to the top.
- Verify the compact mobile ribbon displays **Points**, **Next Drop Date**, **Status**, and **Avail PTO** with no blank fields.
