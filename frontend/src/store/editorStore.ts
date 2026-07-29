import { create } from 'zustand';
import type { DirectoryNode } from '../api/directories';

interface EditorState {
  openFile: DirectoryNode | null;
  language: string;
  isDirty: boolean;
  setOpenFile: (file: DirectoryNode | null) => void;
  setLanguage: (lang: string) => void;
  setDirty: (dirty: boolean) => void;
}

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

export const useEditorStore = create<EditorState>((set) => ({
  openFile: null,
  language: 'plaintext',
  isDirty: false,

  setOpenFile: (file) =>
    set({
      openFile: file,
      language: file ? detectLanguage(file.name) : 'plaintext',
      isDirty: false,
    }),

  setLanguage: (lang) => set({ language: lang }),
  setDirty: (dirty) => set({ isDirty: dirty }),
}));
