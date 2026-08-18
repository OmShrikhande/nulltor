import { useState, useEffect, useCallback } from 'react';
import { directoriesApi, type DirectoryNode } from '../api/directories';

export function useDirectoryTree(projectId: string | null, branchId?: string | null) {
  const [tree, setTree] = useState<DirectoryNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await directoriesApi.tree(projectId, branchId ?? undefined);
      setTree(data);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tree');
      return [];
    } finally {
      setLoading(false);
    }
  }, [projectId, branchId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tree, loading, error, refresh };
}
