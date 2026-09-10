import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  RotateCw,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  Settings,
  Star,
  DownloadCloud,
  Check,
  X,
  Filter,
  Blocks,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { extensionsApi, type ExtensionItem } from '../../api/extensions';
import { toast } from '../shared/Toast';

interface ExtensionsPanelProps {
  onClose?: () => void;
  onOpenSettings?: () => void;
}

const DEFAULT_INSTALLED_IDS = [
  'llvm-vs-code-extensions.vscode-clangd',
  'golang.Go',
  'ms-python.python',
  'esbenp.prettier-vscode',
  'dbaeumer.vscode-eslint',
];

export function ExtensionsPanel({ onClose, onOpenSettings }: ExtensionsPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [installedIds, setInstalledIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('nulltor_installed_extensions');
      return saved ? JSON.parse(saved) : DEFAULT_INSTALLED_IDS;
    } catch {
      return DEFAULT_INSTALLED_IDS;
    }
  });

  const [installedData, setInstalledData] = useState<Record<string, ExtensionItem>>({});
  const [popularExtensions, setPopularExtensions] = useState<ExtensionItem[]>([]);
  const [searchResults, setSearchResults] = useState<ExtensionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [installedOpen, setInstalledOpen] = useState(true);
  const [recommendedOpen, setRecommendedOpen] = useState(true);
  const [selectedExtension, setSelectedExtension] = useState<ExtensionItem | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Fetch batch details for installed extensions
  const refreshInstalledMetadata = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      const res = await extensionsApi.batch(ids);
      const map: Record<string, ExtensionItem> = {};
      res.extensions.forEach((e) => {
        map[e.id] = e;
      });
      setInstalledData((prev) => ({ ...prev, ...map }));
    } catch (err) {
      console.warn('Could not fetch batch metadata for installed extensions');
    }
  }, []);

  // Fetch popular extensions from Open VSX on mount
  const fetchPopular = useCallback(async () => {
    setLoading(true);
    try {
      const res = await extensionsApi.popular(30);
      setPopularExtensions(res.extensions || []);
      // Also cache into installedData if matches
      const map: Record<string, ExtensionItem> = {};
      res.extensions.forEach((e) => {
        map[e.id] = e;
      });
      setInstalledData((prev) => ({ ...map, ...prev }));
    } catch (e) {
      console.warn('Failed to load Open VSX popular extensions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPopular();
    refreshInstalledMetadata(installedIds);
  }, [fetchPopular, refreshInstalledMetadata, installedIds]);

  // Debounced search query to Open VSX
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!searchQuery.trim() && !activeCategory) {
      setSearchResults([]);
      return;
    }

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await extensionsApi.search(
          searchQuery.trim() || undefined,
          activeCategory || undefined,
          30
        );
        setSearchResults(res.extensions || []);
      } catch (e) {
        toast('Failed to search Open VSX marketplace', 'error');
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [searchQuery, activeCategory]);

  const saveInstalled = (newIds: string[]) => {
    setInstalledIds(newIds);
    localStorage.setItem('nulltor_installed_extensions', JSON.stringify(newIds));
    window.dispatchEvent(new CustomEvent('nulltor_extensions_changed', { detail: { installed: newIds } }));
    refreshInstalledMetadata(newIds);
  };

  const handleInstall = (ext: ExtensionItem) => {
    if (installedIds.includes(ext.id)) return;
    const next = [...installedIds, ext.id];
    setInstalledData((prev) => ({ ...prev, [ext.id]: ext }));
    saveInstalled(next);
    toast(`✓ Installed ${ext.displayName || ext.name}`, 'success');
  };

  const handleUninstall = (extId: string, name: string) => {
    const next = installedIds.filter((id) => id !== extId);
    saveInstalled(next);
    toast(`Uninstalled ${name}`, 'info');
  };

  const formatDownloads = (num: number) => {
    if (!num) return '0';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return String(num);
  };

  // Compile installed items list with full metadata
  const installedList: ExtensionItem[] = installedIds.map((id) => {
    if (installedData[id]) return installedData[id];
    const found = popularExtensions.find((e) => e.id === id) || searchResults.find((e) => e.id === id);
    if (found) return found;
    const parts = id.split('.');
    return {
      id,
      name: parts[1] || id,
      displayName: parts[1] || id,
      publisher: parts[0] || 'community',
      description: 'Language support and tool integration',
      version: '1.0.0',
      downloads: 0,
      rating: 4.8,
    };
  });

  const displayedRecommended = (searchQuery.trim() || activeCategory)
    ? searchResults
    : popularExtensions.filter((e) => !installedIds.includes(e.id));

  return (
    <div
      className="ide-extensions-panel"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-1)',
        color: 'var(--text-primary)',
        fontSize: '12px',
        userSelect: 'none',
      }}
    >
      {/* 1. Header Bar matching Image 2 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px 6px 14px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)' }}>
          Extensions
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <button
            onClick={() => {
              fetchPopular();
              refreshInstalledMetadata(installedIds);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Refresh Extensions"
          >
            <RotateCw size={13} className={loading ? 'spin' : ''} />
          </button>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
              title="More Actions..."
            >
              <MoreHorizontal size={14} />
            </button>
            {showMoreMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '24px',
                  right: 0,
                  zIndex: 200,
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  minWidth: '170px',
                  padding: '4px 0',
                }}
              >
                <div
                  onClick={() => {
                    setInstalledOpen(true);
                    setRecommendedOpen(true);
                    setShowMoreMenu(false);
                  }}
                  style={{ padding: '6px 12px', fontSize: '11px', cursor: 'pointer' }}
                >
                  Show All Sections
                </div>
                <div
                  onClick={() => {
                    setSearchQuery('@installed');
                    setShowMoreMenu(false);
                  }}
                  style={{ padding: '6px 12px', fontSize: '11px', cursor: 'pointer' }}
                >
                  Filter Installed
                </div>
                <div
                  onClick={() => {
                    saveInstalled(DEFAULT_INSTALLED_IDS);
                    setShowMoreMenu(false);
                    toast('Reset to default extensions', 'info');
                  }}
                  style={{ padding: '6px 12px', fontSize: '11px', cursor: 'pointer', color: '#ef4444' }}
                >
                  Reset Defaults
                </div>
              </div>
            )}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Close Extensions"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* 2. Search Input with Filter Icon */}
      <div style={{ padding: '8px 12px 4px 12px' }}>
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            padding: '3px 8px',
          }}
        >
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Extensions in Marketplace"
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: '11.5px',
              width: '100%',
              padding: '2px 0',
            }}
          />
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery('')}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
            >
              <X size={12} />
            </button>
          ) : (
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <button
                onClick={() => setShowCategoryMenu(!showCategoryMenu)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: activeCategory ? 'var(--accent-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Filter by Category"
              >
                <Filter size={12} />
              </button>
              {showCategoryMenu && (
                <div
                  style={{
                    position: 'absolute',
                    top: '20px',
                    right: 0,
                    zIndex: 200,
                    background: 'var(--bg-2)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                    minWidth: '150px',
                    padding: '4px 0',
                  }}
                >
                  {['All', 'Programming Languages', 'Linters', 'Formatters', 'Themes', 'Snippets', 'Debuggers'].map((cat) => (
                    <div
                      key={cat}
                      onClick={() => {
                        setActiveCategory(cat === 'All' ? null : cat);
                        setShowCategoryMenu(false);
                      }}
                      style={{
                        padding: '6px 12px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        color: (activeCategory === cat || (cat === 'All' && !activeCategory)) ? 'var(--accent-primary)' : 'var(--text-primary)',
                        background: (activeCategory === cat || (cat === 'All' && !activeCategory)) ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                      }}
                    >
                      {cat}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 3. Open VSX Banner Notice & Status */}
      <div
        style={{
          padding: '6px 12px 8px 12px',
          fontSize: '10.5px',
          color: 'var(--text-muted)',
          lineHeight: 1.4,
          borderBottom: '1px solid var(--border)',
          background: 'rgba(59, 130, 246, 0.05)',
        }}
      >
        <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Blocks size={12} style={{ color: '#3b82f6' }} />
          <span>Language Tools & Extensions</span>
        </div>
        <span>Core tools (Python, Clangd, Go, Prettier, ESLint) are <strong>built directly into Nulltor</strong>. The <a href="https://open-vsx.org" target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', textDecoration: 'none' }}>Open VSX</a> registry is integrated for browsing and bookmarking community extensions.</span>
      </div>


      {/* 4. Scrollable Extensions Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '2px 0' }}>
        {/* SECTION: Installed */}
        {!searchQuery && (
          <div style={{ marginBottom: '4px' }}>
            <div
              onClick={() => setInstalledOpen(!installedOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '5px 12px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '11px',
                color: 'var(--text-primary)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {installedOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <span>Installed</span>
              </div>
              <span
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  fontWeight: 600,
                }}
              >
                {installedList.length}
              </span>
            </div>

            {installedOpen && (
              <div>
                {installedList.map((ext) => (
                  <InstalledExtensionRow
                    key={ext.id}
                    extension={ext}
                    onUninstall={() => handleUninstall(ext.id, ext.displayName || ext.name)}
                    onClick={() => setSelectedExtension(ext)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* SECTION: Recommended / Search Results */}
        <div>
          <div
            onClick={() => setRecommendedOpen(!recommendedOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '5px 12px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '11px',
              color: 'var(--text-primary)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {recommendedOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <span>{searchQuery ? 'Marketplace Results' : 'Recommended'}</span>
            </div>
            <span
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                padding: '1px 6px',
                borderRadius: '10px',
                fontSize: '10px',
                color: 'var(--text-muted)',
                fontWeight: 600,
              }}
            >
              {displayedRecommended.length}
            </span>
          </div>

          {recommendedOpen && (
            <div>
              {loading && displayedRecommended.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>
                  <RotateCw size={13} className="spin" style={{ margin: '0 auto 6px' }} />
                  <div>Querying Open VSX Registry…</div>
                </div>
              ) : displayedRecommended.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>
                  No extensions found for "{searchQuery}".
                </div>
              ) : (
                displayedRecommended.map((ext) => (
                  <RecommendedExtensionRow
                    key={ext.id}
                    extension={ext}
                    isInstalled={installedIds.includes(ext.id)}
                    onInstall={() => handleInstall(ext)}
                    onClick={() => setSelectedExtension(ext)}
                    formatDownloads={formatDownloads}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* 5. Extension Details Modal */}
      {selectedExtension && (
        <ExtensionDetailModal
          extension={selectedExtension}
          isInstalled={installedIds.includes(selectedExtension.id)}
          onInstall={() => handleInstall(selectedExtension)}
          onUninstall={() => handleUninstall(selectedExtension.id, selectedExtension.displayName || selectedExtension.name)}
          onClose={() => setSelectedExtension(null)}
          formatDownloads={formatDownloads}
        />
      )}
    </div>
  );
}

// ── 1. Installed Extension Row (matches Image 2 Installed style) ─────────────
interface InstalledExtensionRowProps {
  extension: ExtensionItem;
  onUninstall: () => void;
  onClick: () => void;
}

function InstalledExtensionRow({
  extension,
  onUninstall,
  onClick,
}: InstalledExtensionRowProps) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '6px 12px',
        cursor: 'pointer',
        transition: 'background 0.15s ease',
        position: 'relative',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Extension Logo */}
      <div
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '4px',
          background: 'rgba(255, 255, 255, 0.03)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          overflow: 'hidden',
          marginTop: '2px',
        }}
      >
        {extension.icon ? (
          <img
            src={extension.icon}
            alt={extension.name}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
          />
        ) : (
          <Blocks size={18} style={{ color: '#3b82f6' }} />
        )}
      </div>

      {/* Content Column */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>


          <span style={{ fontWeight: 600, fontSize: '11.5px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {extension.displayName || extension.name}
          </span>
          {DEFAULT_INSTALLED_IDS.includes(extension.id) && (
            <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', fontWeight: 600, flexShrink: 0 }}>
              Built-in
            </span>
          )}
        </div>

        <div
          style={{
            fontSize: '10.5px',
            color: 'var(--text-secondary)',
            marginTop: '1px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={extension.description}
        >
          {extension.description}
        </div>
        <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
          {extension.publisher}
        </div>
      </div>

      {/* Gear settings button */}
      <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setShowMenu(!showMenu)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
          }}
          title="Manage"
        >
          <Settings size={13} />
        </button>
        {showMenu && (
          <div
            style={{
              position: 'absolute',
              top: '22px',
              right: 0,
              zIndex: 300,
              background: 'var(--bg-2)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              minWidth: '110px',
              padding: '4px 0',
            }}
          >
            <div
              onClick={() => {
                onClick();
                setShowMenu(false);
              }}
              style={{ padding: '6px 12px', fontSize: '11px', cursor: 'pointer' }}
            >
              Extension Details
            </div>
            <div
              onClick={() => {
                onUninstall();
                setShowMenu(false);
              }}
              style={{ padding: '6px 12px', fontSize: '11px', color: '#ef4444', cursor: 'pointer' }}
            >
              Uninstall
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 2. Recommended Extension Row (matches Image 2 Recommended style) ────────
interface RecommendedExtensionRowProps {
  extension: ExtensionItem;
  isInstalled: boolean;
  onInstall: () => void;
  onClick: () => void;
  formatDownloads: (num: number) => string;
}

function RecommendedExtensionRow({
  extension,
  isInstalled,
  onInstall,
  onClick,
  formatDownloads,
}: RecommendedExtensionRowProps) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '6px 12px',
        cursor: 'pointer',
        transition: 'background 0.15s ease',
        position: 'relative',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Extension Logo with subtle ribbon */}
      <div style={{ position: 'relative', flexShrink: 0, marginTop: '2px' }}>
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '4px',
            background: 'rgba(255, 255, 255, 0.03)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {extension.icon ? (
            <img
              src={extension.icon}
              alt={extension.name}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
          ) : (
            <Blocks size={18} style={{ color: '#3b82f6' }} />
          )}
        </div>
      </div>

      {/* Main Content Column */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Top line: Name + Downloads / Rating */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: '11.5px',
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={extension.displayName || extension.name}
          >
            {extension.displayName || extension.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>
            {extension.downloads > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                <DownloadCloud size={10} />
                <span>{formatDownloads(extension.downloads)}</span>
              </span>
            )}
            {extension.rating > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '2px', color: '#f59e0b' }}>
                <Star size={10} fill="#f59e0b" />
                <span>{Math.round(extension.rating)}</span>
              </span>
            )}
          </div>
        </div>

        {/* Middle line: Description */}
        <div
          style={{
            fontSize: '10.5px',
            color: 'var(--text-secondary)',
            marginTop: '1px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={extension.description}
        >
          {extension.description}
        </div>

        {/* Bottom line: Publisher + Install button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
          <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {extension.publisher}
          </span>
          {isInstalled ? (
            <span style={{ fontSize: '10px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '2px', fontWeight: 600 }}>
              <Check size={11} /> Installed
            </span>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onInstall();
              }}
              style={{
                padding: '2px 8px',
                fontSize: '10px',
                fontWeight: 600,
                background: '#0078d4',
                color: '#ffffff',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              Install
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 3. Rich Extension Detail Modal ──────────────────────────────────────────
interface ExtensionDetailModalProps {
  extension: ExtensionItem;
  isInstalled: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onClose: () => void;
  formatDownloads: (num: number) => string;
}

function ExtensionDetailModal({
  extension,
  isInstalled,
  onInstall,
  onUninstall,
  onClose,
  formatDownloads,
}: ExtensionDetailModalProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '540px',
          background: 'var(--bg-1)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.04)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              overflow: 'hidden',
              border: '1px solid var(--border)',
            }}
          >
            {extension.icon ? (
              <img src={extension.icon} alt={extension.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <Blocks size={28} style={{ color: '#3b82f6' }} />
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {extension.displayName || extension.name}
              </h3>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ fontSize: '12px', color: '#3b82f6', marginTop: '2px', fontWeight: 500 }}>
              {extension.publisher} · v{extension.version}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <DownloadCloud size={12} />
                <span>{formatDownloads(extension.downloads)} downloads</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#f59e0b' }}>
                <Star size={12} fill="#f59e0b" />
                <span>{extension.rating.toFixed(1)} / 5.0</span>
              </span>
            </div>
          </div>
        </div>

        <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5, background: 'var(--bg-2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          {extension.description}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
          <a
            href={`https://open-vsx.org/extension/${extension.publisher}/${extension.name}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              color: '#3b82f6',
              fontSize: '11.5px',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            <span>View on Open VSX Registry</span>
            <ExternalLink size={12} />
          </a>
          {isInstalled ? (
            <button
              onClick={() => {
                onUninstall();
                onClose();
              }}
              style={{
                padding: '8px 16px',
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                border: '1px solid #ef4444',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Uninstall Extension
            </button>
          ) : (
            <button
              onClick={() => {
                onInstall();
                onClose();
              }}
              style={{
                padding: '8px 16px',
                background: '#0078d4',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Install Extension
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
