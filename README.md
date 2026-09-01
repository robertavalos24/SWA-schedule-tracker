# Standalone Attendance & Schedule Administrator

This is a polished, full-featured React schedule and attendance optimizer, complete with payroll analysis, standard FICA/federal tax withholdings for Texas residents, FMLA tracking, RosterApps importing, and local state persistence. 

It has been constructed with standard modern tools (React 19, TypeScript, Tailwind CSS, and Vite) and runs **completely standalone** on any computer without relying on any Google AI Studio services.

---

## 📂 Exporting the Application from Google AI Studio

To get this app as a standalone project folder on your local machine, use the native export workflows in Google AI Studio:

1. **Option A: Export to GitHub**
   * Open the **Settings Menu** (represented by the gear icon) in your Google AI Studio template workspace.
   * Click **Export to GitHub**.
   * Link your GitHub account and choose to create a private/public repository containing the complete, uncompressed source files.

2. **Option B: Download ZIP Archive**
   * Open the **Settings Menu** in Google AI Studio.
   * Click **Export Workspace as ZIP**.
   * Extract the ZIP file into a standard directory on your computer.

---

## 🚀 Running Local Standalone Mode

Once you have exported/extracted the project folder, follow these steps to run the application locally on your computer.

### Prerequisite
Make sure you have **Node.js** installed on your machine (v18 or higher is recommended). You can verify this by running:
```bash
node -v
npm -v
```

### Installation Steps

1. **Navigate to the Project Folder**
   Open your command prompt, Terminal, or VS Code terminal, and change your directory to the extracted project folder:
   ```bash
   cd path/to/exported-project
   ```

2. **Install Code Dependencies**
   Run the package installer to pull in all React component libraries, charting tools, and styling utilities:
   ```bash
   npm install
   ```

3. **Launch the Local Development Server**
   Spin up the hot-reloading development server:
   ```bash
   npm run dev
   ```

4. **Open in Browser**
   Open your browser and navigate to the address shown in your terminal (usually `http://localhost:3000` or `http://localhost:5173`).

---

## 🎨 Design and Key Modules

This solution is designed with a decentralized offline-first architecture, ensuring all key functions remain fast and secure:
* **Storage and Session Lifecycle**: The app uses `localStorage` and `IndexedDB` hooks (managed seamlessly via Zustand store states) to safely cache and restore schedules, custom rosters, adjustment thresholds, and tax profiles across browser reboots.
* **Texas Standard Tax Engine**: Incorporates the standard FICA withholdings (7.65%), standard child/dependent credits, standard deductions (per Single, Married Joint, or Head of Household status), and 0.00% state income tax for Texas.
* **Smart Roster Import Module**: Parses RosterApps reports seamlessly from local spreadsheets (`.xlsx`/`.csv`) without sending data to external endpoints.
* **Compact Layout and Micro-Animations**: Leverages professional display typography, crisp custom margins, and responsive hover cues built with standard CSS features and `motion/react` layout transitions.
