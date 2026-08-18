import { useState } from 'react';
import { Search, Blocks, Check, Download, X } from 'lucide-react';

interface ExtensionItem {
  id: string;
  name: string;
  author: string;
  description: string;
  version: string;
  installed: boolean;
  downloads: string;
  rating: string;
}

const DEFAULT_EXTENSIONS: ExtensionItem[] = [
  {
    id: 'python-intel',
    name: 'Python Intelligence Pro',
    author: 'Nulltor Labs',
    description: 'Rich syntax analysis, linting, and autocomplete for Python 3.11+.',
    version: 'v2.4.0',
    installed: true,
    downloads: '14.2k',
    rating: '4.9',
  },
  {
    id: 'prettier-fmt',
    name: 'Prettier Code Formatter',
    author: 'Prettier Team',
    description: 'Opinionated multi-language code formatter for TypeScript, JS, HTML & CSS.',
    version: 'v3.1.2',
    installed: true,
    downloads: '28.9k',
    rating: '4.8',
  },
  {
    id: 'eslint-linter',
    name: 'ESLint Realtime Checker',
    author: 'OpenJS Foundation',
    description: 'Integrates ESLint into editor for inline diagnostic warnings and errors.',
    version: 'v8.56.0',
    installed: true,
    downloads: '22.1k',
    rating: '4.7',
  },
  {
    id: 'gitlens-turbo',
    name: 'GitLens Timeline & Blame',
    author: 'GitKraken',
    description: 'Supercharge Git capabilities with inline authorship blame and branch graphs.',
    version: 'v14.0.1',
    installed: false,
    downloads: '19.5k',
    rating: '4.9',
  },
  {
    id: 'docker-tools',
    name: 'Docker Container Tools',
    author: 'Microsoft',
    description: 'Manage Dockerfiles, Compose specs, and container environments.',
    version: 'v1.27.0',
    installed: false,
    downloads: '11.8k',
    rating: '4.6',
  },
  {
    id: 'tailwind-intellisense',
    name: 'Tailwind CSS IntelliSense',
    author: 'Tailwind Labs',
    description: 'Intelligent autocomplete and syntax highlighting for Tailwind classes.',
    version: 'v0.9.11',
    installed: false,
    downloads: '16.4k',
    rating: '4.8',
  },
];

interface ExtensionsPanelProps {
  onClose?: () => void;
}

export function ExtensionsPanel({ onClose }: ExtensionsPanelProps) {
  const [search, setSearch] = useState('');
  const [extensions, setExtensions] = useState<ExtensionItem[]>(DEFAULT_EXTENSIONS);

  const filtered = extensions.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.description.toLowerCase().includes(search.toLowerCase()) ||
      e.author.toLowerCase().includes(search.toLowerCase())
  );

  function toggleInstall(id: string) {
    setExtensions((prev) =>
      prev.map((e) => (e.id === id ? { ...e, installed: !e.installed } : e))
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* VS Code Style Matching Header */}
      <div
        className="tree-header"
        style={{
          height: '36px',
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-1)',
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>
          Extensions
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          {onClose && (
            <button
              className="btn-icon"
              style={{ width: 22, height: 22, fontSize: 12, color: 'var(--text-secondary)' }}
              title="Close Extensions"
              onClick={onClose}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="Search extensions in Marketplace…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 10px 6px 28px',
              fontSize: '12px',
              background: 'var(--bg-2)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
          <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        </div>
      </div>

      {/* Extensions List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {filtered.map((ext) => (
          <div
            key={ext.id}
            style={{
              padding: '10px',
              background: 'var(--bg-1)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              transition: 'border-color 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: 28, height: 28, borderRadius: '4px', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
                  <Blocks size={15} />
                </div>
                <div>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)' }}>{ext.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{ext.author} • {ext.version}</div>
                </div>
              </div>

              <button
                className={`btn btn-sm ${ext.installed ? 'btn-ghost' : 'btn-primary'}`}
                onClick={() => toggleInstall(ext.id)}
                style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontWeight: 700,
                  background: ext.installed ? 'var(--bg-2)' : '#2563eb',
                  border: ext.installed ? '1px solid var(--border)' : '1px solid #1d4ed8',
                  color: ext.installed ? 'var(--text-secondary)' : '#ffffff',
                }}
              >
                {ext.installed ? (
                  <>
                    <Check size={11} style={{ marginRight: 3, color: '#3b82f6' }} /> Installed
                  </>
                ) : (
                  <>
                    <Download size={11} style={{ marginRight: 3 }} /> Install
                  </>
                )}
              </button>
            </div>

            <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
              {ext.description}
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '10.5px', color: 'var(--text-muted)' }}>
              <span>★ {ext.rating}</span>
              <span>↓ {ext.downloads}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
