/**
 * RunPanel — In-Browser Code Execution (E2EE Safe)
 *
 * Runs code entirely in the browser — code is never sent to any server.
 * - Python: Pyodide (WebAssembly CPython)
 * - JavaScript/TypeScript: Sandboxed Web Worker eval
 * - HTML: Blob URL in sandboxed iframe
 */
import { useRef, useState, useCallback, useEffect } from 'react';

interface RunPanelProps {
  code: string;
  language: string;
  runTrigger?: number;
  /** When embedded in RightPanel, hide the outer shell (header handled by parent) */
  embedded?: boolean;
}

type OutputLine = { type: 'stdout' | 'stderr' | 'info' | 'error'; text: string };

declare global {
  interface Window {
    loadPyodide: (config: { indexURL: string }) => Promise<any>;
    _pyodide: any;
  }
}

function loadPyodideScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById('pyodide-script')) { resolve(); return; }
    const s = document.createElement('script');
    s.id = 'pyodide-script';
    s.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js';
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function getPyodide() {
  if (window._pyodide) return window._pyodide;
  await loadPyodideScript();
  window._pyodide = await window.loadPyodide({
    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/',
  });
  return window._pyodide;
}

function runInWorker(code: string): Promise<string> {
  return new Promise((resolve) => {
    const workerCode = `
      const logs = [];
      const origLog = console.log;
      console.log = (...args) => { logs.push(args.map(String).join(' ')); };
      console.error = (...args) => { logs.push('ERROR: ' + args.map(String).join(' ')); };
      try {
        const result = eval(${JSON.stringify(code)});
        if (result !== undefined) logs.push(String(result));
      } catch(e) {
        logs.push('RuntimeError: ' + e.message);
      }
      postMessage(logs.join('\\n'));
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    worker.onmessage = (e) => { resolve(e.data); URL.revokeObjectURL(url); worker.terminate(); };
    worker.onerror = (e) => { resolve('WorkerError: ' + e.message); URL.revokeObjectURL(url); worker.terminate(); };
  });
}

export function RunPanel({ code, language, runTrigger }: RunPanelProps) {
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [running, setRunning] = useState(false);
  const [pyodideLoading, setPyodideLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'run' | 'html'>('run');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Auto-run when triggered from topbar Run button
  useEffect(() => {
    if (runTrigger && runTrigger > 0) {
      run();
    }
  }, [runTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const addLine = useCallback((type: OutputLine['type'], text: string) => {
    setOutput(prev => [...prev, { type, text }]);
  }, []);

  async function run() {
    setRunning(true);
    setOutput([]);
    const ts = new Date().toLocaleTimeString();

    if (language === 'python') {
      addLine('info', `▶ Running Python · ${ts}`);
      addLine('info', '──────────────────────────────');
      try {
        if (!window._pyodide) {
          setPyodideLoading(true);
          addLine('info', '⏳ Loading Python runtime (first run only)…');
          await getPyodide();
          setPyodideLoading(false);
          addLine('info', '✓ Python ready.');
        }
        const pyodide = window._pyodide;
        // Capture stdout/stderr
        pyodide.runPython(`
import sys, io
_stdout_buf = io.StringIO()
_stderr_buf = io.StringIO()
sys.stdout = _stdout_buf
sys.stderr = _stderr_buf
`);
        let hasError = false;
        try {
          pyodide.runPython(code);
        } catch (e: any) {
          hasError = true;
          addLine('stderr', e.message ?? String(e));
        }
        const stdout = pyodide.runPython('_stdout_buf.getvalue()');
        const stderr = pyodide.runPython('_stderr_buf.getvalue()');
        // Restore stdout
        pyodide.runPython('sys.stdout = sys.__stdout__; sys.stderr = sys.__stderr__');
        if (stdout) stdout.split('\n').filter(Boolean).forEach((l: string) => addLine('stdout', l));
        if (stderr && !hasError) stderr.split('\n').filter(Boolean).forEach((l: string) => addLine('stderr', l));
      } catch (e: any) {
        addLine('error', 'Failed to load Python runtime: ' + (e?.message ?? String(e)));
      }
    } else if (language === 'javascript' || language === 'typescript') {
      addLine('info', `▶ Running JavaScript · ${ts}`);
      addLine('info', '──────────────────────────────');
      try {
        const result = await runInWorker(code);
        if (result) {
          result.split('\n').forEach(l => {
            if (l.startsWith('ERROR:') || l.startsWith('RuntimeError:')) {
              addLine('stderr', l);
            } else {
              addLine('stdout', l);
            }
          });
        } else {
          addLine('info', '(no output)');
        }
      } catch (e: any) {
        addLine('error', String(e));
      }
    } else if (language === 'html') {
      setActiveTab('html');
      addLine('info', `▶ Rendered HTML · ${ts}`);
      if (iframeRef.current) {
        const blob = new Blob([code], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        iframeRef.current.src = url;
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    } else {
      addLine('error', `⚠ Language "${language}" is not yet supported for in-browser execution.`);
      addLine('info', 'Supported: Python, JavaScript, HTML');
    }

    addLine('info', '──────────────────────────────');
    addLine('info', `✓ Done · ${new Date().toLocaleTimeString()}`);
    setRunning(false);
  }

  function clear() {
    setOutput([]);
    if (iframeRef.current) iframeRef.current.src = 'about:blank';
  }

  return (
    <>
      {/* Sub-tab bar: Output / Preview + Clear */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', borderBottom: '1px solid var(--border)', background: 'var(--bg-2)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 2 }}>
          <button className={`run-tab ${activeTab === 'run' ? 'active' : ''}`} onClick={() => setActiveTab('run')}>Output</button>
          <button className={`run-tab ${activeTab === 'html' ? 'active' : ''}`} onClick={() => setActiveTab('html')}>Preview</button>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={clear} style={{ fontSize: 11 }} title="Clear output">Clear</button>
      </div>

      {/* Output tab */}
      {activeTab === 'run' && (
        <div className="run-output">
          {output.length === 0 && !running ? (
            <div className="run-empty">
              <div style={{ fontSize: 36, opacity: 0.2, marginBottom: 12 }}>▶</div>
              <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>No output yet</div>
              <div style={{ fontSize: 12 }}>Press ▶ Run in the toolbar to execute your code.</div>
            </div>
          ) : (
            <>
              {output.map((line, i) => (
                <div key={i} className={`run-line run-line-${line.type}`}>
                  {line.text}
                </div>
              ))}
              {(running || pyodideLoading) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', color: 'var(--text-muted)', fontSize: 12 }}>
                  <div className="loading-spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                  {pyodideLoading ? 'Loading Python…' : 'Running…'}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* HTML preview tab */}
      {activeTab === 'html' && (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <iframe
            ref={iframeRef}
            src="about:blank"
            sandbox="allow-scripts"
            style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
            title="HTML Preview"
          />
        </div>
      )}
    </>
  );
}
