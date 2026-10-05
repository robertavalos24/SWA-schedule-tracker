import { create } from 'zustand';

interface ModalState {
  modals: Record<string, boolean>;
  openModal: (id: string) => void;
  closeModal: (id: string) => void;
  toggleModal: (id: string) => void;
}

export const useModalStore = create<ModalState>((set) => ({
  modals: {
    addBlock: false,
    editBlock: false,
    fmlaManager: false,
    fmlaCase: false,
    override: false,
    settings: false,
    bulkMid: false,
    bulkAdd: false,
    attendanceDetails: false,
    timeoffDetails: false,
    paycheckAudit: false,
    payDetails: false,
    bulkFmlaEdit: false,
    sti: false,
    ptoWarning: false,
    confirmReset: false,
    importSuccess: false,
    confirmClearMonth: false,
    userGuide: false,
    importInstructions: false,
    ytdSummary: false,
    promo: false,
    adj: false,
    correction: false,
    taxSettings: false,
    payHistory: false,
    confirmRestore: false,
    cloudStatus: false,
    bidLineImport: false,
  },
  openModal: (id) =>
    set((state) => ({
      modals: { ...state.modals, [id]: true },
    })),
  closeModal: (id) =>
    set((state) => ({
      modals: { ...state.modals, [id]: false },
    })),
  toggleModal: (id) =>
    set((state) => ({
      modals: { ...state.modals, [id]: !state.modals[id] },
    })),
}));
