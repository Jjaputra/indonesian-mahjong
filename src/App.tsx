import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { History, RotateCcw, Settings, Volume2, VolumeX } from 'lucide-react';
import { playSound, type SoundEffectName } from './audio';
import {
  clearGameHistory,
  deleteGameRecord,
  loadGameHistory,
  updateSettings,
  withPracticeScoringDefaults,
  type GameSettings,
} from './storage';
import { ActionHud, CenterArea, HumanArea, OpponentPanel, seatPositions } from './ui/components/GameTable';
import { HistoryModal } from './ui/components/HistoryModal';
import { HuResultModal } from './ui/components/HuResultModal';
import { SettingsModal } from './ui/components/SettingsModal';
import { MainMenu } from './ui/components/MainMenu';
import { AbandonMatchDialog } from './ui/components/AbandonMatchDialog';
import { GameController, type GameEventType } from './ui/game-controller';
import { PlayProgress } from './ui/components/PlayProgress';
import { loadPracticePace, loadPracticeSettings, practiceDelay, savePracticePace, scheduleAutomation, singleAutomationStep, type PracticePace } from './ui/practice-pace';
import { DIFFICULTY_LABEL } from './ui/labels';
import { releaseVersion } from './ui/release';

type View = 'menu' | 'table';
type ModalName = 'settings' | 'history' | null;

const EVENT_SOUND: Partial<Record<GameEventType, SoundEffectName>> = {
  discard: 'discard',
  jia: 'jia',
  pung: 'pung',
  kong: 'kong',
  flower: 'flower',
  hu: 'hu',
  lewFit: 'lewFit',
};

/**
 * Persist a settings patch without pinning the practice scoring defaults: an unchanged scoring
 * choice is left out, so only a real change (or one already stored) is written as explicit.
 */
function persistSettings(current: GameSettings, patch: Partial<GameSettings>): GameSettings {
  const next: Partial<GameSettings> = { ...current, ...patch };
  if (next.scoringBasis === current.scoringBasis && patch.scoringBasis === undefined) delete next.scoringBasis;
  if (next.bonusTileRule === current.bonusTileRule && patch.bonusTileRule === undefined) delete next.bonusTileRule;
  return withPracticeScoringDefaults(updateSettings(next));
}

function useGameController(initial: GameSettings): GameController {
  const ref = useRef<GameController | null>(null);
  if (!ref.current) ref.current = new GameController({ settings: initial, autoStart: false });
  return ref.current;
}

export function App() {
  const [settings, setSettings] = useState<GameSettings>(() => withPracticeScoringDefaults(loadPracticeSettings()));
  const controller = useGameController(settings);
  const version = useSyncExternalStore(
    useCallback((cb: () => void) => controller.subscribe(cb), [controller]),
    () => controller.version,
    () => controller.version
  );
  const [paused, setPaused] = useState(false);
  const [pace, setPace] = useState(loadPracticePace);
  useEffect(() => savePracticePace(pace), [pace]);
  const [view, setView] = useState<View>('menu');
  const [matchStarted, setMatchStarted] = useState(false);
  const [modal, setModal] = useState<ModalName>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [abandonOpen, setAbandonOpen] = useState(false);
  const [history, setHistory] = useState(() => loadGameHistory());

  // Sound effects follow the live "Suara" setting.
  const soundRef = useRef(settings.soundEnabled);
  soundRef.current = settings.soundEnabled;
  useEffect(
    () =>
      controller.onEvent((e) => {
        const name = e.type === 'draw' ? (e.seat === controller.humanSeat ? 'draw' : undefined) : EVENT_SOUND[e.type];
        if (name) playSound(name, { soundEnabled: soundRef.current });
      }),
    [controller]
  );

  // Each effect owns one timer; dialogs, views, pause, and new games dispose it.
  const automationBlocked = modal !== null || abandonOpen;
  useEffect(() => scheduleAutomation(controller, practiceDelay(pace),
    view !== 'table' || !matchStarted || paused || automationBlocked),
    [controller, version, pace, view, matchStarted, paused, automationBlocked]);

  const outcome = controller.outcome;
  useEffect(() => {
    if (!outcome) return;
    setResultOpen(true);
    setHistory(loadGameHistory());
  }, [outcome]);

  const actions = controller.getHumanActions();
  useEffect(() => {
    if (selectedId && !actions.discardableTileIds.includes(selectedId)) setSelectedId(null);
  }, [actions.discardableTileIds, selectedId]);

  const newGame = () => {
    setAbandonOpen(false);
    setView('menu');
    setMatchStarted(false);
    setResultOpen(false);
    setSelectedId(null);
  };
  const startPractice = () => {
    setResultOpen(false);
    setSelectedId(null);
    setPaused(false);
    controller.setSettings({ ...settings, startingSeatWind: 'dong' });
    controller.newGame();
    setMatchStarted(true);
    setView('table');
  };

  const saveSettings = (draft: GameSettings) => {
    if (draft.animationSpeed !== settings.animationSpeed) setPace(draft.animationSpeed);
    const changed: Partial<GameSettings> = { ...draft };
    if (draft.scoringBasis === settings.scoringBasis) delete changed.scoringBasis;
    if (draft.bonusTileRule === settings.bonusTileRule) delete changed.bonusTileRule;
    const stored = persistSettings(settings, changed);
    setSettings(stored);
    controller.setSettings(stored);
    setModal(null);
  };

  const changePace = (choice: PracticePace) => {
    setPace(choice);
    savePracticePace(choice);
    if (choice !== 'learn') {
      const stored = persistSettings(settings, { animationSpeed: choice });
      setSettings(stored);
      controller.setSettings(stored);
    }
  };

  const toggleSound = () => {
    const stored = persistSettings(settings, { soundEnabled: !settings.soundEnabled });
    setSettings(stored);
    controller.setSettings(stored);
  };

  const pos = seatPositions(controller.humanSeat);
  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-tile">金</span>
          <div>
            <h1>Mahjong Indonesia</h1>
            <span className="release-version" aria-label={"Versi " + releaseVersion}>{"v" + releaseVersion}</span>
          </div>
        </div>

        <div className="header-actions">
          <button type="button" className="icon-btn" onClick={() => setModal('history')} title="Riwayat Permainan">
            <History size={18} />
          </button>
          <button type="button" className="icon-btn" onClick={toggleSound} title={settings.soundEnabled ? 'Matikan suara' : 'Nyalakan suara'}>
            {settings.soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button type="button" className="icon-btn" onClick={() => setModal('settings')} title="Pengaturan">
            <Settings size={18} />
          </button>
          {matchStarted && <button type="button" className="btn btn-primary" onClick={() => matchStarted && !outcome ? setAbandonOpen(true) : newGame()}>
            <RotateCcw size={14} /> Permainan Baru
          </button>}
        </div>
      </header>

      {view === 'menu' ? (
        <MainMenu kimEnabled={settings.kimEnabled} onKimChange={(enabled: boolean) => {
          const stored = persistSettings(settings, { kimEnabled: enabled });
          setSettings(stored);
          controller.setSettings(stored);
        }} difficultyLabel={DIFFICULTY_LABEL[settings.aiDifficulty]} onPractice={startPractice}
          lastResult={history[0] ? history[0].winner === null ? 'Seri' : `${history[0].totalTay} Tay` : null} />
      ) : (
        <main className="table-felt">
          <OpponentPanel seat={pos.top} position="top" controller={controller} />
          <OpponentPanel seat={pos.left} position="left" controller={controller} />
          <CenterArea controller={controller} progress={<PlayProgress controller={controller} paused={paused} blocked={automationBlocked} pace={pace} onPaceChange={changePace}
            onPause={() => setPaused(p => !p)} onStep={() => singleAutomationStep(controller, automationBlocked || !paused)} />} />
          <OpponentPanel seat={pos.right} position="right" controller={controller} />
          <div className="seat-bottom">
            <ActionHud controller={controller} actions={actions} selectedId={selectedId} onSelect={setSelectedId} />
            <HumanArea controller={controller} actions={actions} selectedId={selectedId} onSelect={setSelectedId} />
            {outcome && !resultOpen && (
              <button type="button" className="btn btn-gold result-reopen" onClick={() => setResultOpen(true)}>
                Lihat hasil permainan
              </button>
            )}
          </div>
        </main>
      )}

      {view === 'table' && outcome && resultOpen && !modal && <HuResultModal outcome={outcome} onClose={() => setResultOpen(false)} onNewGame={newGame} />}
      {abandonOpen && <AbandonMatchDialog onStay={() => setAbandonOpen(false)} onLeave={newGame} />}
      {modal === 'settings' && <SettingsModal settings={settings} onSave={saveSettings} onClose={() => setModal(null)} />}
      {modal === 'history' && (
        <HistoryModal
          history={history}
          onDelete={(id) => {
            deleteGameRecord(id);
            setHistory(loadGameHistory());
          }}
          onClear={() => {
            clearGameHistory();
            setHistory([]);
          }}
          onClose={() => setModal(null)}
        />
      )}

    </div>
  );
}

export default App;
