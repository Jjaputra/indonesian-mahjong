import { ArrowRight } from 'lucide-react';

export interface MainMenuProps {
  difficultyLabel: string;
  lastResult: string | null;
  onPractice: () => void;
  kimEnabled?: boolean;
  onKimChange?: (enabled: boolean) => void;
}

export function MainMenu({ difficultyLabel, lastResult, onPractice, kimEnabled, onKimChange }: MainMenuProps) {
  return (
    <main className="main-menu">
      <section className="menu-card" aria-label="Menu utama">
        <p className="menu-eyebrow">Mahjong Tradisional Indonesia</p>
        <h2>Waktunya bermain.</h2>
        <p className="muted">Anda dan tiga lawan. Satu meja.</p>
        {lastResult !== null && <p className="menu-last">Terakhir: {lastResult}</p>}
        {kimEnabled !== undefined && onKimChange && (
          <fieldset className="menu-kim">
            <legend>Pilihan Kim</legend>
            <div className="segmented" role="group" aria-label="Pilihan Kim">
              <button type="button" className={kimEnabled ? 'is-on' : ''} aria-pressed={kimEnabled} onClick={() => onKimChange(true)}>Ada Kim</button>
              <button type="button" className={kimEnabled ? '' : 'is-on'} aria-pressed={!kimEnabled} onClick={() => onKimChange(false)}>Tanpa Kim</button>
            </div>
          </fieldset>
        )}
        <div className="menu-choices">
          <button type="button" className="btn btn-primary menu-choice" onClick={onPractice}>
            <strong>Mulai bermain <ArrowRight size={20} aria-hidden="true" /></strong>
            <span>Tiga bot · {difficultyLabel}</span>
          </button>
        </div>
      </section>
    </main>
  );
}
