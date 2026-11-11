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
import { MatchResultNote, MatchStandingsModal } from './ui/components/MatchBoard';
import { loadMatchLength, saveMatchLength, loadDealerWinRule, saveDealerWinRule, loadMatchTimeLimit, saveMatchTimeLimit, watchMatchClock, type MatchTimeLimit, type MatchLength, type DealerWinRule } from './ui/match';
import { loadPracticePace, loadPracticeSettings, motionSpeedForPace, settingsForPace, practiceDelay, savePracticePace, scheduleAutomation, singleAutomationStep, type PracticePace } from './ui/practice-pace';
import { DIFFICULTY_LABEL, tileText } from './ui/labels';
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
  // Dev screenshot hook (?demo=…) seeds the deal; production builds never read the URL here.
  const demo = import.meta.env.DEV && typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const seed = demo?.has('demo') ? Number(demo.get('seed') ?? 7) || 7 : undefined;
  if (!ref.current) ref.current = new GameController({ settings: initial, autoStart: false, seed });
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
  const [standingsOpen, setStandingsOpen] = useState(false);
  const [matchLength, setMatchLength] = useState<MatchLength>(loadMatchLength);
  const [dealerWinRule, setDealerWinRule] = useState<DealerWinRule>(loadDealerWinRule);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<MatchTimeLimit>(loadMatchTimeLimit);
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

  // Match time is independent of bot pauses, dialogs and tab visibility.
  useEffect(() => matchStarted ? watchMatchClock(controller) : undefined, [controller, matchStarted]);

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
    setStandingsOpen(false);
    setView('menu');
    setMatchStarted(false);
    setResultOpen(false);
    setSelectedId(null);
  };
  const startPractice = () => {
    setResultOpen(false);
    setStandingsOpen(false);
    setSelectedId(null);
    setPaused(false);
    controller.setSettings({ ...settings, startingSeatWind: 'dong' });
    controller.startMatch(matchLength, dealerWinRule, timeLimitMinutes);
    setMatchStarted(true);
    setView('table');
  };

  // Continuous match: the next hand keeps the bot pause choice and the match's Kim mode.
  const nextHand = () => {
    if (controller.nextHand()) { setResultOpen(false); setSelectedId(null); }
  };
  const openStandings = () => {
    setResultOpen(false);
    setStandingsOpen(true);
  };
  // Leaving between hands of an unfinished match still asks first.
  const midMatch = matchStarted && (!outcome || (!!controller.match && !controller.matchOver));

  const saveSettings = (draft: GameSettings) => {
    if (draft.animationSpeed !== 'off' && draft.animationSpeed !== settings.animationSpeed) {
      draft = { ...draft, animationSpeed: motionSpeedForPace(pace) };
    }
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
    const stored = persistSettings(settings, settingsForPace(settings, choice));
    setSettings(stored);
    controller.setSettings(stored);
  };

  const toggleMotion = () => {
    const stored = persistSettings(settings, {
      animationSpeed: settings.animationSpeed === 'off' ? motionSpeedForPace(pace) : 'off',
    });
    setSettings(stored);
    controller.setSettings(stored);
  };

  const toggleSound = () => {
    const stored = persistSettings(settings, { soundEnabled: !settings.soundEnabled });
    setSettings(stored);
    controller.setSettings(stored);
  };

  // Dev-only: `?demo=table|claim|hu` opens a seeded table state for reproducible screenshots.
  const demoStarted = useRef(false);
  useEffect(() => {
    if (!import.meta.env.DEV || demoStarted.current) return;
    demoStarted.current = true;
    void import('./ui/dev-demo').then(({ demoFromUrl, driveDemo }) => {
      const demo = demoFromUrl(window.location.search);
      if (!demo) return;
      startPractice();
      setPaused(true);
      driveDemo(controller, demo.mode);
    });
  }, []);

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
          {view === 'menu' && <label>Mode Kim <select aria-label="Mode Kim" value={settings.kimMode ?? (settings.kimEnabled ? 'dedicated' : 'off')} onChange={e => {
            const kimMode = e.target.value as 'off' | 'dedicated' | 'natural';
            const stored = persistSettings(settings, { kimMode, kimEnabled: kimMode !== 'off' });
            setSettings(stored);
            controller.setSettings(stored);
          }}><option value="natural">Kim dari tile yang ada</option><option value="dedicated">Kim khusus (pemula)</option><option value="off">Tanpa Kim</option></select></label>}

          <button type="button" className="icon-btn" onClick={() => setModal('history')} title="Riwayat Permainan">
            <History size={18} />
          </button>
          <button type="button" className="icon-btn" onClick={toggleSound} title={settings.soundEnabled ? 'Matikan suara' : 'Nyalakan suara'}>
            {settings.soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button type="button" className="icon-btn" onClick={() => setModal('settings')} title="Pengaturan">
            <Settings size={18} />
          </button>
          {matchStarted && <button type="button" className="btn btn-primary" onClick={() => midMatch ? setAbandonOpen(true) : newGame()}>
            <RotateCcw size={14} /> Permainan Baru
          </button>}
        </div>
      </header>

      {view === 'menu' ? (
        <MainMenu kimEnabled={settings.kimEnabled} onKimChange={(enabled: boolean) => {
          const stored = persistSettings(settings, { kimEnabled: enabled, kimMode: enabled ? (settings.kimMode === 'dedicated' ? 'dedicated' : 'natural') : 'off' });
          setSettings(stored);
          controller.setSettings(stored);
        }} difficultyLabel={DIFFICULTY_LABEL[settings.aiDifficulty]} onPractice={startPractice}
          timeLimitMinutes={timeLimitMinutes} onTimeLimitChange={limit => { setTimeLimitMinutes(limit); saveMatchTimeLimit(limit); }}
          dealerWinRule={dealerWinRule} onDealerWinRuleChange={rule => { setDealerWinRule(rule); saveDealerWinRule(rule); }}
          matchLength={matchLength} onMatchLengthChange={(length) => { setMatchLength(length); saveMatchLength(length); }}
          lastResult={history[0] ? history[0].winner === null ? 'Seri' : `${history[0].totalTay} Tay` : null} />
      ) : (
        <main className="table-felt">
          {controller.getState().kimFace && <div className="kim-indicator">Kim: {tileText({ ...controller.getState().kimFace!, id: 'kim-indicator', isKim: false })}</div>}
          <OpponentPanel seat={pos.top} position="top" controller={controller} />
          <OpponentPanel seat={pos.left} position="left" controller={controller} />
          <CenterArea controller={controller} progress={<PlayProgress controller={controller} paused={paused} blocked={automationBlocked} pace={pace} onPaceChange={changePace} onToggleMotion={toggleMotion}
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

      {view === 'table' && outcome && resultOpen && !modal && <HuResultModal outcome={outcome} onClose={() => setResultOpen(false)}
        onNewGame={controller.match && !controller.matchOver ? () => { setResultOpen(false); setAbandonOpen(true); } : newGame}
        onNextHand={controller.match && !controller.matchOver ? nextHand : undefined}
        onStandings={controller.matchOver ? openStandings : undefined}
        matchSummary={controller.match ? <MatchResultNote match={controller.match} /> : undefined} />}
      {view === 'table' && standingsOpen && controller.match && !modal && <MatchStandingsModal match={controller.match} onPlayAgain={startPractice} onMenu={newGame} />}
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
