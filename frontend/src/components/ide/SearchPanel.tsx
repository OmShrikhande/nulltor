import { useState, useMemo, useEffect } from 'react';
import { Search, FileText, Folder, X, CaseSensitive, Regex, WholeWord, AlignLeft, RefreshCw } from 'lucide-react';
import type { DirectoryNode } from '../../api/directories';

interface SearchPanelProps {
  tree: DirectoryNode[];
  onOpenFile: (node: DirectoryNode, lineNumber?: number) => void;
  projectId?: string;
  branchId?: string;
}

interface FlattenedFile {
  node: DirectoryNode;
  path: string;
}

interface ContentMatch {
  file: DirectoryNode;
  path: string;
  lineNumber: number;
  lineContent: string;
}

export function SearchPanel({ tree, onOpenFile, projectId, branchId }: SearchPanelProps) {
  const [searchMode, setSearchMode] = useState<'files' | 'content'>('files');
  const [searchQuery, setSearchQuery] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [matchWord, setMatchWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);

  const [contentMatches, setContentMatches] = useState<ContentMatch[]>([]);
  const [isSearchingContent, setIsSearchingContent] = useState(false);

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

  // Execute filename search filter based on query and toggles
  const fileResults = useMemo(() => {
    if (!searchQuery.trim() || searchMode !== 'files') return [];

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
  }, [allFiles, searchQuery, searchMode, matchCase, matchWord, useRegex]);

  // Execute content grep search when searchMode === 'content'
  useEffect(() => {
    if (searchMode !== 'content' || !searchQuery.trim() || !projectId) {
      setContentMatches([]);
      return;
    }

    let isCancelled = false;
    const timer = setTimeout(async () => {
      setIsSearchingContent(true);
      try {
        const res = await fetch('/api/tools/execute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            action: 'list_files',
            project_id: projectId,
            branch_id: branchId && branchId !== 'main' ? branchId : undefined,
          }),
        });

        if (!res.ok) throw new Error('Failed to list files');
        const data = await res.json();
        const filesMap = (data.data?.files || {}) as Record<string, string>;

        const matches: ContentMatch[] = [];
        const query = searchQuery;

        for (const [filePath, content] of Object.entries(filesMap)) {
          if (isCancelled) return;
          const matchingNode = allFiles.find(f => f.node.name === filePath.split('/').pop())?.node || {
            id: filePath,
            name: filePath.split('/').pop() || filePath,
            type: 'file',
            project_id: projectId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as DirectoryNode;

          const lines = (content || '').split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            let isMatch = false;

            if (useRegex) {
              try {
                const re = new RegExp(query, matchCase ? 'g' : 'gi');
                isMatch = re.test(line);
              } catch {
                isMatch = false;
              }
            } else if (matchWord) {
              const re = new RegExp(`\\b${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, matchCase ? 'g' : 'gi');
              isMatch = re.test(line);
            } else if (matchCase) {
              isMatch = line.includes(query);
            } else {
              isMatch = line.toLowerCase().includes(query.toLowerCase());
            }

            if (isMatch) {
              matches.push({
                file: matchingNode,
                path: filePath,
                lineNumber: i + 1,
                lineContent: line.trim(),
              });
              if (matches.length >= 100) break; // cap results for performance
            }
          }
          if (matches.length >= 100) break;
        }

        if (!isCancelled) {
          setContentMatches(matches);
        }
      } catch {
        if (!isCancelled) setContentMatches([]);
      } finally {
        if (!isCancelled) setIsSearchingContent(false);
      }
    }, 400);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [searchMode, searchQuery, projectId, branchId, matchCase, matchWord, useRegex, allFiles]);

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

      {/* Mode Switcher: Files vs Grep Content */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-0)' }}>
        <button
          type="button"
          onClick={() => setSearchMode('files')}
          style={{
            flex: 1,
            padding: '7px 10px',
            fontSize: '11.5px',
            fontWeight: searchMode === 'files' ? 700 : 500,
            background: searchMode === 'files' ? 'var(--bg-1)' : 'transparent',
            color: searchMode === 'files' ? 'var(--text-primary)' : 'var(--text-muted)',
            border: 'none',
            borderBottom: searchMode === 'files' ? '2px solid #3b82f6' : '2px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
          }}
        >
          <FileText size={12} />
          <span>Files</span>
        </button>
        <button
          type="button"
          onClick={() => setSearchMode('content')}
          style={{
            flex: 1,
            padding: '7px 10px',
            fontSize: '11.5px',
            fontWeight: searchMode === 'content' ? 700 : 500,
            background: searchMode === 'content' ? 'var(--bg-1)' : 'transparent',
            color: searchMode === 'content' ? 'var(--text-primary)' : 'var(--text-muted)',
            border: 'none',
            borderBottom: searchMode === 'content' ? '2px solid #3b82f6' : '2px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
          }}
        >
          <AlignLeft size={12} />
          <span>Content (Grep)</span>
        </button>
      </div>

      {/* Search Input Bar with Toggles */}
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder={searchMode === 'files' ? "Search file names or paths..." : "Search text inside files (Grep)..."}
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

      {/* Results View */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {isSearchingContent && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '24px 12px', color: 'var(--text-muted)', fontSize: '12px' }}>
            <RefreshCw size={13} className="spin" /> Searching workspace contents…
          </div>
        )}

        {searchMode === 'files' ? (
          searchQuery.trim() === '' ? (
            <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
              Type a file name or path to search.
            </div>
          ) : fileResults.length === 0 ? (
            <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
              No files match &quot;{searchQuery}&quot;
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', padding: '4px 6px', fontWeight: 600 }}>
                {fileResults.length} file{fileResults.length === 1 ? '' : 's'} found
              </div>
              {fileResults.map(({ node, path }) => (
                <div
                  key={node.id}
                  onClick={() => onOpenFile(node)}
                  style={{
                    padding: '6px 8px',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12.5px',
                    color: 'var(--text-primary)',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-2)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <FileText size={14} style={{ color: '#38bdf8', flexShrink: 0 }} />
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <div style={{ fontWeight: 600 }}>{node.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{path}</div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          searchQuery.trim() === '' ? (
            <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
              Type keyword to grep through all file contents.
            </div>
          ) : !isSearchingContent && contentMatches.length === 0 ? (
            <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
              No code matches &quot;{searchQuery}&quot;
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', padding: '4px 6px', fontWeight: 600 }}>
                {contentMatches.length} match{contentMatches.length === 1 ? '' : 'es'} found
              </div>
              {contentMatches.map((m, idx) => (
                <div
                  key={`${m.path}-${m.lineNumber}-${idx}`}
                  onClick={() => onOpenFile(m.file, m.lineNumber)}
                  style={{
                    padding: '6px 8px',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    background: 'var(--bg-0)',
                    border: '1px solid var(--border)',
                    fontSize: '12px',
                    transition: 'border-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{m.file.name}</span>
                    <span style={{ fontSize: '11px', color: '#60a5fa', fontFamily: 'monospace' }}>Line {m.lineNumber}</span>
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: '11.5px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.lineContent}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
