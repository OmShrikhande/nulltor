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

interface SavedProjectTabs {
  openTabs: DirectoryNode[];
  openFileId: string | null;
}

function saveTabsToSession(projectId: string | null, openTabs: DirectoryNode[], openFile: DirectoryNode | null) {
  if (!projectId) return;
  try {
    const payload: SavedProjectTabs = {
      openTabs: openTabs.filter(t => t && (!t.project_id || t.project_id === projectId)),
      openFileId: openFile?.id ?? null,
    };
    sessionStorage.setItem(`nulltor_tabs_${projectId}`, JSON.stringify(payload));
  } catch {}
}

function loadTabsFromSession(projectId: string): { openTabs: DirectoryNode[]; openFile: DirectoryNode | null } {
  try {
    const raw = sessionStorage.getItem(`nulltor_tabs_${projectId}`);
    if (raw) {
      const parsed: SavedProjectTabs = JSON.parse(raw);
      if (Array.isArray(parsed.openTabs)) {
        // Enforce strict project data isolation: only keep tabs belonging to this projectId
        const validTabs = parsed.openTabs.filter(t => t && (!t.project_id || t.project_id === projectId));
        let openFile: DirectoryNode | null = null;
        if (parsed.openFileId) {
          openFile = validTabs.find(t => t.id === parsed.openFileId) ?? null;
        }
        if (!openFile && validTabs.length > 0) {
          openFile = validTabs[0];
        }
        return { openTabs: validTabs, openFile };
      }
    }
  } catch {}
  return { openTabs: [], openFile: null };
}

interface EditorState {
  activeProjectId: string | null;
  openFile: DirectoryNode | null;
  openTabs: DirectoryNode[];
  language: string;
  isDirty: boolean;
  cursorPosition: { line: number; column: number };
  diagnosticCounts: { errors: number; warnings: number };

  switchProject: (projectId: string) => void;
  pruneInvalidTabs: (validNodeIds: Set<string>) => void;
  setOpenFile: (file: DirectoryNode | null) => void;
  openTab: (file: DirectoryNode) => void;
  closeTab: (id: string) => void;
  clearAllTabs: () => void;
  setLanguage: (lang: string) => void;
  setDirty: (dirty: boolean) => void;
  setCursorPos: (pos: { line: number; column: number }) => void;
  setDiagnosticCounts: (counts: { errors: number; warnings: number }) => void;
  // alias used by some components
  setFile: (file: DirectoryNode | null) => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  activeProjectId: null,
  openFile: null,
  openTabs: [],
  language: 'plaintext',
  isDirty: false,
  cursorPosition: { line: 1, column: 1 },
  diagnosticCounts: { errors: 0, warnings: 0 },

  switchProject: (newProjectId: string) => {
    const state = get();
    if (state.activeProjectId === newProjectId) {
      return;
    }

    // Persist previous project tabs
    if (state.activeProjectId) {
      saveTabsToSession(state.activeProjectId, state.openTabs, state.openFile);
    }

    // Restore new project tabs
    const { openTabs, openFile } = loadTabsFromSession(newProjectId);

    set({
      activeProjectId: newProjectId,
      openTabs,
      openFile,
      language: openFile ? detectLanguage(openFile.name) : 'plaintext',
      isDirty: false,
      cursorPosition: { line: 1, column: 1 },
      diagnosticCounts: { errors: 0, warnings: 0 },
    });
  },

  pruneInvalidTabs: (validNodeIds: Set<string>) => {
    const state = get();
    const currentProjectId = state.activeProjectId;
    // Filter tabs to only those that exist in tree and match activeProjectId
    const validTabs = state.openTabs.filter(
      (t) => validNodeIds.has(t.id) && (!currentProjectId || !t.project_id || t.project_id === currentProjectId)
    );

    let openFile = state.openFile;
    if (openFile && (!validNodeIds.has(openFile.id) || (currentProjectId && openFile.project_id && openFile.project_id !== currentProjectId))) {
      openFile = validTabs.length > 0 ? validTabs[validTabs.length - 1] : null;
    }

    if (validTabs.length !== state.openTabs.length || openFile !== state.openFile) {
      saveTabsToSession(currentProjectId, validTabs, openFile);
      set({
        openTabs: validTabs,
        openFile,
        language: openFile ? detectLanguage(openFile.name) : 'plaintext',
        isDirty: false,
      });
    }
  },

  setOpenFile: (file) =>
    set((state) => {
      if (!file) {
        saveTabsToSession(state.activeProjectId, state.openTabs, null);
        return { openFile: null, language: 'plaintext', isDirty: false };
      }

      // Project boundary check: never open a file belonging to another project
      if (state.activeProjectId && file.project_id && file.project_id !== state.activeProjectId) {
        console.warn(`[useEditorStore] Blocked opening file "${file.name}" (project ${file.project_id}) in project ${state.activeProjectId}`);
        return state;
      }

      const alreadyOpen = state.openTabs.find((t) => t.id === file.id);
      const openTabs = alreadyOpen ? state.openTabs : [...state.openTabs, file];
      saveTabsToSession(state.activeProjectId, openTabs, file);

      return {
        openFile: file,
        openTabs,
        language: detectLanguage(file.name),
        isDirty: false,
      };
    }),

  openTab: (file) =>
    set((state) => {
      if (state.activeProjectId && file.project_id && file.project_id !== state.activeProjectId) {
        return state;
      }

      const alreadyOpen = state.openTabs.find((t) => t.id === file.id);
      const openTabs = alreadyOpen ? state.openTabs : [...state.openTabs, file];
      saveTabsToSession(state.activeProjectId, openTabs, file);

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
      const openFile =
        state.openFile?.id === id
          ? openTabs.length > 0
            ? openTabs[openTabs.length - 1]
            : null
          : state.openFile;

      saveTabsToSession(state.activeProjectId, openTabs, openFile);

      return {
        openTabs,
        openFile,
        language: openFile ? detectLanguage(openFile.name) : 'plaintext',
        isDirty: false,
      };
    }),

  clearAllTabs: () => {
    const state = get();
    if (state.activeProjectId) {
      sessionStorage.removeItem(`nulltor_tabs_${state.activeProjectId}`);
    }
    set({
      openFile: null,
      openTabs: [],
      language: 'plaintext',
      isDirty: false,
    });
  },

  setLanguage: (lang) => set({ language: lang }),
  setDirty: (dirty) => set({ isDirty: dirty }),
  setCursorPos: (pos) => set({ cursorPosition: pos }),
  setDiagnosticCounts: (counts) => set({ diagnosticCounts: counts }),
  setFile: (file) => get().setOpenFile(file),
}));
