import { useState } from 'react';
import { Search, Replace, ChevronRight, ChevronDown, FileText } from 'lucide-react';
import type { DirectoryNode } from '../../api/directories';

interface SearchPanelProps {
  tree: DirectoryNode[];
  onOpenFile: (node: DirectoryNode) => void;
}

export function SearchPanel({ tree, onOpenFile }: SearchPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  
  // Flatten tree to search in file names
  const flattenTree = (nodes: DirectoryNode[]): DirectoryNode[] => {
    let result: DirectoryNode[] = [];
    for (const node of nodes) {
      if (node.type === 'file') {
        result.push(node);
      }
      if (node.children) {
        result = result.concat(flattenTree(node.children));
      }
    }
    return result;
  };

  const allFiles = flattenTree(tree);
  
  const results = searchQuery 
    ? allFiles.filter(file => file.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="tree-header">
        SEARCH
        <div style={{ display: 'flex', gap: '8px' }}>
          <Search size={14} style={{ cursor: 'pointer' }} />
        </div>
      </div>
      
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ position: 'relative' }}>
          <input 
            type="text" 
            placeholder="Search" 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ 
              width: '100%', 
              background: 'var(--bg-2)', 
              border: '1px solid var(--border)', 
              padding: '6px 8px', 
              borderRadius: '4px',
              color: 'var(--text-primary)',
              fontSize: '13px',
              outline: 'none'
            }} 
          />
        </div>
        <div style={{ position: 'relative' }}>
          <input 
            type="text" 
            placeholder="Replace" 
            value={replaceQuery}
            onChange={e => setReplaceQuery(e.target.value)}
            style={{ 
              width: '100%', 
              background: 'var(--bg-2)', 
              border: '1px solid var(--border)', 
              padding: '6px 8px', 
              borderRadius: '4px',
              color: 'var(--text-primary)',
              fontSize: '13px',
              outline: 'none'
            }} 
          />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {searchQuery && (
          <div style={{ padding: '4px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>
            {results.length} files found
          </div>
        )}
        
        {results.map(file => (
          <div 
            key={file.id} 
            className="tree-item"
            onClick={() => onOpenFile(file)}
          >
            <ChevronDown size={14} />
            <FileText size={14} />
            <span>{file.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
