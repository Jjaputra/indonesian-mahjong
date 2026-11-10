import { useId } from 'react';

export interface AbandonMatchDialogProps {
  onStay: () => void;
  onLeave: () => void;
}

export function AbandonMatchDialog({ onStay, onLeave }: AbandonMatchDialogProps) {
  const titleId = useId();

  return (
    <div className="overlay overlay-dialog">
      <div className="panel panel-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="panel-header">
          <h2 id={titleId}>Kembali ke menu?</h2>
        </header>
        <div className="panel-body">
          <p>Apakah Anda ingin meninggalkan pertandingan saat ini dan kembali ke menu?</p>
        </div>
        <footer className="panel-footer">
          <button type="button" className="btn btn-primary" onClick={onStay}>Tetap di meja</button>
          <button type="button" className="btn" onClick={onLeave}>Kembali ke menu</button>
        </footer>
      </div>
    </div>
  );
}
