import { ArrowRight } from 'lucide-react';
import { MATCH_LENGTHS, type DealerWinRule, type MatchLength } from '../match';
import { matchLengthLabel } from '../labels';

export interface MainMenuProps {
  difficultyLabel: string;
  lastResult: string | null;
  onPractice: () => void;
  kimEnabled?: boolean;
  onKimChange?: (enabled: boolean) => void;
  /** Hands per match (null = endless practice) */
  matchLength?: MatchLength;
  dealerWinRule?: DealerWinRule;
  onDealerWinRuleChange?: (rule: DealerWinRule) => void;
  onMatchLengthChange?: (length: MatchLength) => void;
}

export function MainMenu({ difficultyLabel, lastResult, onPractice, kimEnabled, onKimChange, matchLength, onMatchLengthChange, dealerWinRule, onDealerWinRuleChange }: MainMenuProps) {
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
        {matchLength !== undefined && onMatchLengthChange && (
          <fieldset className="menu-kim menu-length">
            <legend>Panjang pertandingan</legend>
            <div className="segmented" role="group" aria-label="Panjang pertandingan">
              {MATCH_LENGTHS.map((n) => (
                <button key={String(n)} type="button" className={matchLength === n ? 'is-on' : ''} aria-pressed={matchLength === n} onClick={() => onMatchLengthChange(n)}>
                  {matchLengthLabel(n)}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        {dealerWinRule !== undefined && onDealerWinRuleChange && <label className="field">
          Dealer menang
          <select aria-label="Dealer menang" value={dealerWinRule} onChange={e => onDealerWinRuleChange(e.target.value as DealerWinRule)}>
            <option value="stay">Tetap jadi dealer (default)</option>
            <option value="rotate">Tetap berputar</option>
          </select>
        </label>}
        <div className="menu-choices">
          <button type="button" className="btn btn-primary menu-choice" onClick={onPractice}>
            <strong>Mulai bermain <ArrowRight size={20} aria-hidden="true" /></strong>
            <span>Tiga bot · {difficultyLabel}{matchLength !== undefined ? ` · ${matchLengthLabel(matchLength)}` : ''}</span>
          </button>
        </div>
      </section>
    </main>
  );
}
