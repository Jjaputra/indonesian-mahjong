import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { BookOpen, Calculator, History, LayoutGrid, RotateCcw, Settings, Volume2, VolumeX } from 'lucide-react';
import { playSound, type SoundEffectName } from './audio';
import {
  clearGameHistory,
  deleteGameRecord,
  loadGameHistory,
  loadSettings,
  updateSettings,
  type GameSettings,
} from './storage';
import { ActionHud, CenterArea, HumanArea, OpponentPanel, seatPositions } from './ui/components/GameTable';
import { HistoryModal } from './ui/components/HistoryModal';
import { HuResultModal } from './ui/components/HuResultModal';
import { Modal } from './ui/components/Modal';
import { SettingsModal } from './ui/components/SettingsModal';
import { TayCalculator } from './ui/components/TayCalculator';
import { MainMenu } from './ui/components/MainMenu';
import { AbandonMatchDialog } from './ui/components/AbandonMatchDialog';
import { CallToast, type CallEvent } from './ui/components/CallToast';
import { tileText } from './ui/labels';
import { GameController, type GameEventType } from './ui/game-controller';
import { ANIMATION_DELAY_MS, DIFFICULTY_LABEL } from './ui/labels';

type View = 'menu' | 'table' | 'calculator';
type ModalName = 'settings' | 'history' | 'rulebook' | null;

const EVENT_SOUND: Partial<Record<GameEventType, SoundEffectName>> = {
  discard: 'discard',
  jia: 'jia',
  pung: 'pung',
  kong: 'kong',
  flower: 'flower',
  hu: 'hu',
  lewFit: 'lewFit',
};

function useGameController(initial: GameSettings): GameController {
  const ref = useRef<GameController | null>(null);
  if (!ref.current) ref.current = new GameController({ settings: initial, autoStart: false });
  return ref.current;
}

export function App() {
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const controller = useGameController(settings);
  const version = useSyncExternalStore(
    useCallback((cb: () => void) => controller.subscribe(cb), [controller]),
    () => controller.version,
    () => controller.version
  );
  const [view, setView] = useState<View>('menu');
  const [matchStarted, setMatchStarted] = useState(false);
  const [modal, setModal] = useState<ModalName>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [abandonOpen, setAbandonOpen] = useState(false);
  const [callEvent, setCallEvent] = useState<(CallEvent & { id: number }) | null>(null);
  const callId = useRef(0);
  const [history, setHistory] = useState(() => loadGameHistory());

  // Sound effects follow the live "Suara" setting.
  const soundRef = useRef(settings.soundEnabled);
  soundRef.current = settings.soundEnabled;
  useEffect(
    () =>
      controller.onEvent((e) => {
        const tile = controller.getState().discardPending?.tile ?? controller.discardTrail.at(-1)?.tile;
        setCallEvent({ ...e, id: ++callId.current, tileLabel: e.type === 'discard' && tile ? tileText(tile) : undefined });
        const name = e.type === 'draw' ? (e.seat === controller.humanSeat ? 'draw' : undefined) : EVENT_SOUND[e.type];
        if (name) playSound(name, { soundEnabled: soundRef.current });
      }),
    [controller]
  );

  // Drive AI seats one step at a time, paced by the animation speed.
  useEffect(() => {
    if (view !== 'table' || !matchStarted || controller.outcome || controller.isWaitingForHuman()) return;
    const t = window.setTimeout(() => controller.step(), ANIMATION_DELAY_MS[settings.animationSpeed]);
    return () => window.clearTimeout(t);
  }, [controller, version, settings.animationSpeed, view, matchStarted]);

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
    setCallEvent(null);
    setView('menu');
    setMatchStarted(false);
    setResultOpen(false);
    setSelectedId(null);
  };
  const startPractice = () => {
    setResultOpen(false);
    setSelectedId(null);
    controller.newGame();
    setMatchStarted(true);
    setView('table');
  };

  const saveSettings = (draft: GameSettings) => {
    const stored = updateSettings(draft);
    setSettings(stored);
    controller.setSettings(stored);
    setModal(null);
  };

  const toggleSound = () => {
    const stored = updateSettings({ soundEnabled: !settings.soundEnabled });
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
            <h1>Mahjong Tradisional Indonesia</h1>
            <p className="muted small">
              Aturan BMC ver06 · AI {DIFFICULTY_LABEL[controller.getSettings().aiDifficulty]} · Min. Hu {controller.getSettings().minHuTay} Tay
            </p>
          </div>
        </div>
        {view !== 'menu' && <nav className="tabs" aria-label="Tampilan">
          <button type="button" className={view === 'table' ? 'is-on' : ''} onClick={() => setView(matchStarted ? 'table' : 'menu')}>
            <LayoutGrid size={15} /> {matchStarted ? 'Meja' : 'Menu Utama'}
          </button>
          <button type="button" className={view === 'calculator' ? 'is-on' : ''} onClick={() => setView('calculator')}>
            <Calculator size={15} /> Kalkulator Tay
          </button>
        </nav>}
        <div className="header-actions">
          <button type="button" className="icon-btn" onClick={() => setModal('rulebook')} title="Rulebook & Kalkulator 44 Tay">
            <BookOpen size={18} />
          </button>
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
        <MainMenu difficultyLabel={DIFFICULTY_LABEL[settings.aiDifficulty]} onPractice={startPractice}
          onCalculator={() => setView('calculator')}
          lastResult={history[0] ? history[0].winner === null ? 'Seri' : `${history[0].totalTay} Tay` : null} />
      ) : view === 'table' ? (
        <main className="table-felt">
          <OpponentPanel seat={pos.top} position="top" controller={controller} />
          <OpponentPanel seat={pos.left} position="left" controller={controller} />
          <CenterArea controller={controller} />
          {callEvent && <CallToast key={callEvent.id} event={callEvent} />}
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
      ) : (
        <main className="page">
          <TayCalculator defaultMinHuTay={settings.minHuTay} overlapPolicy={settings.overlapPolicy} />
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
      {modal === 'rulebook' && (
        <Modal title="Rulebook & Kalkulator 44 Tay" variant="drawer" onClose={() => setModal(null)}>
          <TayCalculator defaultMinHuTay={settings.minHuTay} overlapPolicy={settings.overlapPolicy} />
        </Modal>
      )}
    </div>
  );
}

export default App;
