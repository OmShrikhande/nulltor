import { useState, useMemo } from 'react';
import { Search, FileText, Folder, X, CaseSensitive, Regex, WholeWord } from 'lucide-react';
import type { DirectoryNode } from '../../api/directories';

interface SearchPanelProps {
  tree: DirectoryNode[];
  onOpenFile: (node: DirectoryNode) => void;
}

interface FlattenedFile {
  node: DirectoryNode;
  path: string;
}

export function SearchPanel({ tree, onOpenFile }: SearchPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [matchWord, setMatchWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);

  // Flatten directory tree with breadcrumb folder paths
  const allFiles = useMemo(() => {
    const list: FlattenedFile[] = [];
    const traverse = (nodes: DirectoryNode[], parentPath = '') => {
      for (const node of nodes) {
        const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
        if (node.type === 'file') {
          list.push({ node, path: parentPath || '/' });
        }
        if (node.children && node.children.length > 0) {
          traverse(node.children, currentPath);
        }
      }
    };
    traverse(tree);
    return list;
  }, [tree]);

  // Execute search filter based on query and toggles
  const results = useMemo(() => {
    if (!searchQuery.trim()) return [];

    let regex: RegExp | null = null;
    try {
      if (useRegex) {
        regex = new RegExp(searchQuery, matchCase ? 'g' : 'gi');
      } else if (matchWord) {
        regex = new RegExp(`\\b${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, matchCase ? 'g' : 'gi');
      }
    } catch {
      regex = null;
    }

    return allFiles.filter(({ node, path }) => {
      const target = `${path}/${node.name}`;
      if (regex) {
        return regex.test(target) || regex.test(node.name);
      }
      if (matchCase) {
        return node.name.includes(searchQuery) || path.includes(searchQuery);
      }
      return node.name.toLowerCase().includes(searchQuery.toLowerCase()) || path.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [allFiles, searchQuery, matchCase, matchWord, useRegex]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-1)' }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        fontSize: '11px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--text-secondary)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <span>Search Workspace</span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
          {allFiles.length} files
        </span>
      </div>

      {/* Search Input Bar with Toggles */}
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search files by name or path..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--bg-2)',
              border: '1px solid var(--border)',
              padding: '7px 32px 7px 30px',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              fontSize: '12.5px',
              outline: 'none',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '8px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Filter Toggle Pills */}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button
            onClick={() => setMatchCase(!matchCase)}
            title="Match Case (Aa)"
            style={{
              padding: '3px 7px',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: matchCase ? 'rgba(59, 130, 246, 0.18)' : 'transparent',
              color: matchCase ? '#60a5fa' : 'var(--text-muted)',
              border: `1px solid ${matchCase ? 'rgba(59, 130, 246, 0.4)' : 'transparent'}`,
            }}
          >
            <CaseSensitive size={13} /> Case
          </button>
          <button
            onClick={() => setMatchWord(!matchWord)}
            title="Match Whole Word"
            style={{
              padding: '3px 7px',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: matchWord ? 'rgba(59, 130, 246, 0.18)' : 'transparent',
              color: matchWord ? '#60a5fa' : 'var(--text-muted)',
              border: `1px solid ${matchWord ? 'rgba(59, 130, 246, 0.4)' : 'transparent'}`,
            }}
          >
            <WholeWord size={13} /> Word
          </button>
          <button
            onClick={() => setUseRegex(!useRegex)}
            title="Use Regular Expression (.*)"
            style={{
              padding: '3px 7px',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: useRegex ? 'rgba(59, 130, 246, 0.18)' : 'transparent',
              color: useRegex ? '#60a5fa' : 'var(--text-muted)',
              border: `1px solid ${useRegex ? 'rgba(59, 130, 246, 0.4)' : 'transparent'}`,
            }}
          >
            <Regex size={13} /> Regex
          </button>
        </div>
      </div>

      {/* Results List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {searchQuery && (
          <div style={{ padding: '4px 8px 8px', fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 500 }}>
            {results.length} {results.length === 1 ? 'match' : 'matches'} found
          </div>
        )}

        {searchQuery && results.length === 0 && (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12.5px' }}>
            No files match &quot;{searchQuery}&quot;
          </div>
        )}

        {!searchQuery && (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.6 }}>
            Type to search files across all directories in the active workspace.
          </div>
        )}

        {results.map(({ node, path }) => (
          <div
            key={node.id}
            onClick={() => onOpenFile(node)}
            style={{
              padding: '7px 10px',
              borderRadius: '6px',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              cursor: 'pointer',
              transition: 'background 0.15s ease',
              marginBottom: '2px',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-2)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: 'var(--text-primary)', fontWeight: 500 }}>
              <FileText size={13} color="#38bdf8" />
              <span>{node.name}</span>
            </div>
            {path !== '/' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)', paddingLeft: '19px' }}>
                <Folder size={10} />
                <span>{path}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
