import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: localStorage.getItem('nulltor_sidebar_open') !== 'false',
  toggleSidebar: () =>
    set((state) => {
      const next = !state.sidebarOpen;
      localStorage.setItem('nulltor_sidebar_open', String(next));
      return { sidebarOpen: next };
    }),
  setSidebarOpen: (open) => {
    localStorage.setItem('nulltor_sidebar_open', String(open));
    set({ sidebarOpen: open });
  },
}));
