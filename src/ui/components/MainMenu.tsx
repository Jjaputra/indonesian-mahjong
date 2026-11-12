import { ArrowRight } from 'lucide-react';
import { MATCH_LENGTHS, type DeadWallOption, type DealerWinRule, type MatchTimeLimit, type MatchLength } from '../match';
import { matchLengthLabel } from '../labels';

export interface MainMenuProps {
  difficultyLabel: string;
  lastResult: string | null;
  onPractice: () => void;
  kimEnabled?: boolean;
  kimMode?: 'natural' | 'dedicated' | 'off';
  onKimModeChange?: (mode: 'natural' | 'dedicated' | 'off') => void;
  deadWall?: DeadWallOption;
  onDeadWallChange?: (option: DeadWallOption) => void;
  onKimChange?: (enabled: boolean) => void;
  /** Hands per match (null = endless practice) */
  matchLength?: MatchLength;
  timeLimitMinutes?: MatchTimeLimit;
  onTimeLimitChange?: (limit: MatchTimeLimit) => void;
  dealerWinRule?: DealerWinRule;
  onDealerWinRuleChange?: (rule: DealerWinRule) => void;
  onMatchLengthChange?: (length: MatchLength) => void;
}

export function MainMenu({ difficultyLabel, lastResult, onPractice, kimEnabled, onKimChange, matchLength, onMatchLengthChange, kimMode, onKimModeChange, deadWall, onDeadWallChange, timeLimitMinutes, onTimeLimitChange }: MainMenuProps) {
  return (
    <main className="main-menu">
      <section className="menu-card" aria-label="Menu utama">
        <p className="menu-eyebrow">Mahjong Tradisional Indonesia</p>
        <h2>Waktunya bermain.</h2>
        <p className="muted">Anda dan tiga lawan. Satu meja.</p>
        {lastResult !== null && <p className="menu-last">Terakhir: {lastResult}</p>}
        {(onKimModeChange || onKimChange) && <label className="field">Pilihan Kim
          <select aria-label="Pilihan Kim" value={kimMode ?? (kimEnabled ? 'natural' : 'off')} onChange={e => {
            const mode = e.target.value as 'natural' | 'dedicated' | 'off';
            if (onKimModeChange) onKimModeChange(mode); else onKimChange?.(mode !== 'off');
          }}>
            <option value="natural">Kim dari tile</option>
            <option value="dedicated">Kim tambahan (pemula)</option>
            <option value="off">Tanpa Kim</option>
          </select>
        </label>}
        {onDeadWallChange && <label className="field">Akhir tembok
          <select aria-label="Akhir tembok" value={deadWall ?? 'none'} onChange={e => onDeadWallChange(e.target.value as DeadWallOption)}>
            <option value="none">Sampai habis (turnamen)</option>
            <option value="14">Sisa 14 tile (dead wall)</option>
          </select>
        </label>}
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
        {timeLimitMinutes !== undefined && onTimeLimitChange && <label className="field">
          Waktu
          <select aria-label="Waktu" value={timeLimitMinutes ?? 'unlimited'} onChange={e => onTimeLimitChange(e.target.value === '90' ? 90 : null)}>
            <option value="unlimited">Tanpa batas (default)</option>
            <option value="90">90 menit</option>
          </select>
          <small>Waktu tetap berjalan saat jeda atau dialog terbuka. Setelah waktu habis, selesaikan game yang sedang berjalan.</small>
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
