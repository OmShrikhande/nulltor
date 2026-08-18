import { create } from 'zustand';
import type { DirectoryNode } from '../api/directories';

function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    cpp: 'cpp', cc: 'cpp', cxx: 'cpp',
    c: 'c',
    cs: 'csharp',
    html: 'html',
    css: 'css',
    scss: 'scss',
    json: 'json',
    yaml: 'yaml', yml: 'yaml',
    md: 'markdown',
    sql: 'sql',
    sh: 'shell', bash: 'shell',
    toml: 'ini',
  };
  return map[ext] ?? 'plaintext';
}

interface EditorState {
  openFile: DirectoryNode | null;
  openTabs: DirectoryNode[];
  language: string;
  isDirty: boolean;
  fileErrors: Record<string, number>;
  setOpenFile: (file: DirectoryNode | null) => void;
  openTab: (file: DirectoryNode) => void;
  closeTab: (id: string) => void;
  setLanguage: (lang: string) => void;
  setDirty: (dirty: boolean) => void;
  setFileErrors: (fileId: string, errorCount: number) => void;
  // alias used by some components
  setFile: (file: DirectoryNode | null) => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  openFile: null,
  openTabs: [],
  language: 'plaintext',
  isDirty: false,
  fileErrors: {},
  setFileErrors: (fileId, errorCount) =>
    set((state) => ({
      fileErrors: { ...state.fileErrors, [fileId]: errorCount },
    })),

  setOpenFile: (file) =>
    set((state) => {
      if (!file) return { openFile: null, language: 'plaintext', isDirty: false };
      // Add to tabs if not already there
      const alreadyOpen = state.openTabs.find((t) => t.id === file.id);
      const openTabs = alreadyOpen ? state.openTabs : [...state.openTabs, file];
      return {
        openFile: file,
        openTabs,
        language: detectLanguage(file.name),
        isDirty: false,
      };
    }),

  openTab: (file) =>
    set((state) => {
      const alreadyOpen = state.openTabs.find((t) => t.id === file.id);
      const openTabs = alreadyOpen ? state.openTabs : [...state.openTabs, file];
      return {
        openFile: file,
        openTabs,
        language: detectLanguage(file.name),
        isDirty: false,
      };
    }),

  closeTab: (id) =>
    set((state) => {
      const openTabs = state.openTabs.filter((t) => t.id !== id);
      // If we closed the currently open tab, switch to the last remaining tab
      const openFile =
        state.openFile?.id === id
          ? openTabs.length > 0
            ? openTabs[openTabs.length - 1]
            : null
          : state.openFile;
      return {
        openTabs,
        openFile,
        language: openFile ? detectLanguage(openFile.name) : 'plaintext',
        isDirty: false,
      };
    }),

  setLanguage: (lang) => set({ language: lang }),
  setDirty: (dirty) => set({ isDirty: dirty }),
  // alias
  setFile: (file) => get().setOpenFile(file),
}));
