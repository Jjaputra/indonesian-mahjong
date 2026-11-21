import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export interface Load<T> { status: 'loading' | 'error' | 'ok'; data: T | null; reload: () => void }

/** Runs `fn` on mount and whenever `deps` change; a stale answer never overwrites a newer one. */
export function useLoad<T>(fn: () => Promise<T>, deps: readonly unknown[]): Load<T> {
  const [state, setState] = useState<{ status: Load<T>['status']; data: T | null }>({ status: 'loading', data: null });
  const [tick, setTick] = useState(0);
  const latest = useRef(0);
  useEffect(() => {
    const id = ++latest.current;
    setState(prev => ({ status: 'loading', data: prev.data }));
    fn().then(data => { if (id === latest.current) setState({ status: 'ok', data }); }, () => { if (id === latest.current) setState(prev => ({ status: 'error', data: prev.data })); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { status: state.status, data: state.data, reload: useCallback(() => setTick(n => n + 1), []) };
}

export function Skeleton({ rows = 4, label = 'Memuat…' }: { rows?: number; label?: string }) {
  return <div className="admin-skeleton" role="status" aria-busy="true" aria-label={label}>
    {Array.from({ length: rows }, (_, i) => <span key={i} className="admin-skeleton-row" />)}
  </div>;
}

export function ErrorBox({ onRetry, message = 'Datanya nggak kebuka.' }: { onRetry: () => void; message?: string }) {
  return <div className="admin-state is-error" role="alert"><p>{message}</p><button type="button" className="btn" onClick={onRetry}>Coba lagi</button></div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="admin-state"><p>{children}</p></div>;
}

/** Skeleton until the first answer, an error with retry when it failed and nothing is cached, else the content. */
export function Async<T>({ load, rows, children }: { load: Load<T>; rows?: number; children: (data: T) => ReactNode }) {
  if (load.data !== null) return <>{children(load.data)}</>;
  if (load.status === 'error') return <ErrorBox onRetry={load.reload} />;
  return <Skeleton rows={rows} />;
}

export function Toast({ message }: { message: string }) {
  return <p className={`admin-toast${message ? ' is-on' : ''}`} role="status">{message}</p>;
}

/** A message that clears itself after a few seconds. */
export function useToast(ms = 3500): [string, (message: string) => void] {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [message, (next: string) => { clearTimeout(timer.current); setMessage(next); if (next) timer.current = setTimeout(() => setMessage(''), ms); }];
}
