export type OutputLine = { type: 'stdout' | 'stderr' | 'info' | 'error'; text: any };

declare global {
  interface Window {
    loadPyodide: (config: { indexURL: string }) => Promise<any>;
    _pyodide: any;
  }
}

// ─── Sandboxed JS/TS Web Worker Executor ─────────────────────────────────
const WORKER_CODE = `
  self.onmessage = function(e) {
    let _logs = [];
    let _errs = [];
    const _log = console.log;
    const _err = console.error;
    console.log = (...a) => { _logs.push(a.join(' ')); _log(...a); };
    console.error = (...a) => { _errs.push(a.join(' ')); _err(...a); };
    
    try {
      const res = new Function(e.data)();
      self.postMessage({ stdout: _logs.join('\\n'), stderr: _errs.join('\\n'), result: res });
    } catch(err) {
      self.postMessage({ stdout: _logs.join('\\n'), stderr: _errs.join('\\n') + '\\n' + err.stack, error: err.message });
    }
  };
`;

export function runInWorker(code: string): Promise<string> {
  return new Promise((resolve) => {
    const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        worker.terminate();
        resolve('ERROR: Execution timed out (Possible infinite loop)');
      }
    }, 3000);

    worker.onmessage = (e) => {
      resolved = true;
      clearTimeout(timeout);
      const { stdout, stderr, error } = e.data;
      let out = '';
      if (stdout) out += stdout + '\\n';
      if (stderr) out += 'ERROR: ' + stderr + '\\n';
      if (error) out += 'RuntimeError: ' + error + '\\n';
      resolve(out.trim());
      worker.terminate();
    };

    worker.postMessage(code);
  });
}

// ─── Pyodide Loader ────────────────────────────────────────────────────────
let pyodidePromise: Promise<any> | null = null;
export async function getPyodide() {
  if (window._pyodide) return window._pyodide;
  if (!pyodidePromise) {
    pyodidePromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js';
      script.onload = async () => {
        try {
          const py = await window.loadPyodide({
            indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/'
          });
          window._pyodide = py;
          resolve(py);
        } catch (e) {
          reject(e);
        }
      };
      script.onerror = () => reject(new Error('Failed to load Pyodide script'));
      document.head.appendChild(script);
    });
  }
  return pyodidePromise;
}
