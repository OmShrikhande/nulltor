import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  title: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
  width?: number;
}

export function Modal({ title, onClose, footer, children, width = 480 }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  return createPortal(
    <div
      className="modal-overlay"
      ref={overlayRef}
      onClick={(e) => e.target === overlayRef.current && onClose()}
    >
      <div className="modal-card" style={{ width }}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
