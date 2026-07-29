import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export type ToastType = 'info' | 'success' | 'error';

interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
}

let _listeners: Array<(t: ToastMessage) => void> = [];
let _counter = 0;

export function toast(message: string, type: ToastType = 'info') {
  _listeners.forEach((fn) => fn({ id: ++_counter, message, type }));
}

export function ToastContainer() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (msg: ToastMessage) => {
      const div = document.createElement('div');
      div.className = `toast ${msg.type}`;
      div.textContent = msg.message;
      containerRef.current?.appendChild(div);
      setTimeout(() => div.remove(), 3500);
    };
    _listeners.push(fn);
    return () => { _listeners = _listeners.filter((l) => l !== fn); };
  }, []);

  return createPortal(
    <div className="toast-container" ref={containerRef} />,
    document.body
  );
}
