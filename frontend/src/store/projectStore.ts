import { create } from 'zustand';
import type { ProjectRead } from '../api/projects';
import type { BranchRead } from '../api/branches';

interface ProjectState {
  currentProject: ProjectRead | null;
  currentBranch: BranchRead | null;
  setProject: (project: ProjectRead | null) => void;
  setBranch: (branch: BranchRead | null) => void;
  clear: () => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  currentProject: null,
  currentBranch: null,

  setProject: (project) => set({ currentProject: project, currentBranch: null }),
  setBranch: (branch) => set({ currentBranch: branch }),
  clear: () => set({ currentProject: null, currentBranch: null }),
}));
