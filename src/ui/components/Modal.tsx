import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  variant?: 'dialog' | 'drawer';
  wide?: boolean;
}

export function Modal({ title, onClose, children, footer, variant = 'dialog', wide }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={`overlay overlay-${variant}`} onClick={onClose}>
      <div
        className={`panel panel-${variant}${wide ? ' panel-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="panel-header">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup">
            <X size={18} />
          </button>
        </header>
        <div className="panel-body">{children}</div>
        {footer && <footer className="panel-footer">{footer}</footer>}
      </div>
    </div>
  );
}
