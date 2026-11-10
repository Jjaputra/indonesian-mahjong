import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  variant?: 'dialog' | 'drawer';
  wide?: boolean;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ title, onClose, children, footer, variant = 'dialog', wide }: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Capture opener on mount, restore focus on unmount
  useEffect(() => {
    openerRef.current = (document.activeElement as HTMLElement) || null;
    return () => {
      if (openerRef.current && typeof openerRef.current.focus === 'function') {
        openerRef.current.focus();
      }
    };
  }, []);

  // Stable initial focus once on mount: focus first focusable element inside the panel,
  // or the panel container itself if empty/no focusable controls.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.getClientRects().length > 0 && window.getComputedStyle(el).visibility !== 'hidden'
      );
      if (focusables.length > 0) {
        focusables[0]!.focus();
      } else {
        panel.focus();
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  // Escape key and Tab/Shift+Tab focus containment
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab') {
        const panel = panelRef.current;
        if (!panel) return;

        const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
          (el) => el.getClientRects().length > 0 && window.getComputedStyle(el).visibility !== 'hidden'
        );

        if (focusables.length === 0) {
          e.preventDefault();
          panel.focus();
          return;
        }

        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        const active = document.activeElement;

        if (e.shiftKey) {
          if (active === first || !panel.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (active === last || !panel.contains(active)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className={`overlay overlay-${variant}`} onClick={() => onCloseRef.current()}>
      <div
        ref={panelRef}
        className={`panel panel-${variant}${wide ? ' panel-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="panel-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" onClick={() => onCloseRef.current()} aria-label="Tutup">
            <X size={18} />
          </button>
        </header>
        <div className="panel-body">{children}</div>
        {footer && <footer className="panel-footer">{footer}</footer>}
      </div>
    </div>
  );
}
