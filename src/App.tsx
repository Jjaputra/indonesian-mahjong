import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { FlaskConical, History, RotateCcw, Settings, Volume2, VolumeX } from 'lucide-react';
import { AudioQuickMute, backgroundMusic, soundEffects, playSound, type SoundEffectName } from './audio';
import {
  clearGameHistory,
  deleteGameRecord,
  loadGameHistory,
  updateSettings,
  withPracticeScoringDefaults,
  type GameSettings,
} from './storage';
import { ActionHud, CenterArea, HumanArea, OpponentPanel, PracticeCoach, seatPositions } from './ui/components/GameTable';
import { HistoryModal } from './ui/components/HistoryModal';
import { KongToast } from './ui/components/CallToast';
import { HuResultModal } from './ui/components/HuResultModal';
import { HandSandbox } from './ui/components/HandSandbox';
import { DevTools } from './ui/components/DevTools';
import { devHandFromOutcome, type DevHand } from './dev/hand-code';
import { SettingsModal } from './ui/components/SettingsModal';
import { MainMenu } from './ui/components/MainMenu';
import { AbandonMatchDialog } from './ui/components/AbandonMatchDialog';
import { GameController, type GameEventType } from './ui/game-controller';
import { PlayProgress } from './ui/components/PlayProgress';
import { DiceRoll, openingRollOf, type OpeningRoll } from './ui/components/DiceRoll';
import { MatchResultNote, MatchStandingsModal } from './ui/components/MatchBoard';
import { migrateMatchLengthPreference, loadDealerWinRule, loadDeadWall, saveDeadWall, loadMatchTimeLimit, saveMatchTimeLimit, watchMatchClock, type MatchTimeLimit, type DeadWallOption } from './ui/match';
import { loadPracticePace, loadPracticeSettings, motionSpeedForPace, settingsForPace, practiceDelay, savePracticePace, scheduleAutomation, singleAutomationStep, type PracticePace } from './ui/practice-pace';
import { DIFFICULTY_LABEL, tileText } from './ui/labels';
import { releaseVersion } from './ui/release';
import { tayKoinText } from './ui/components/points';
import { getStorage, type StorageLike } from './storage';

type View = 'menu' | 'table';

export const OPTIONS_OPEN_KEY = 'itm.options-open.v1';

export function loadOptionsOpen(storage?: StorageLike): boolean {
  try {
    const stored = (storage ?? getStorage()).getItem(OPTIONS_OPEN_KEY);
    if (stored === '0' || stored === 'false') return false;
    if (stored === '1' || stored === 'true') return true;
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches) return false;
    return true;
  }
  catch { return true; }
}

export function saveOptionsOpen(open: boolean, storage?: StorageLike): void {
  try { (storage ?? getStorage()).setItem(OPTIONS_OPEN_KEY, open ? '1' : '0'); } catch { /* Keep the live choice. */ }
}

/** The table is always the flat, top-down view; the tilted 3D view was retired in v0.6.1. */
export function appClass(view: View, optionsOpen: boolean): string {
  return `app${view === 'table' ? ' is-table' : ' is-menu'} view-flat${view === 'table' && !optionsOpen ? ' options-hidden' : ''}`;
}

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
  const [optionsOpen, setOptionsOpen] = useState(loadOptionsOpen);
  const changeOptionsOpen = useCallback((open: boolean) => {
    setOptionsOpen(open);
    saveOptionsOpen(open);
  }, []);
  const [dice, setDice] = useState<{ roll: OpeningRoll } | null>(null);
  const [deadWall, setDeadWall] = useState<DeadWallOption>(() => { migrateMatchLengthPreference(); loadDealerWinRule(); return loadDeadWall(); });
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<MatchTimeLimit>(loadMatchTimeLimit);
  const [history, setHistory] = useState(() => loadGameHistory());
  // Developer mode (Settings): Uji Tangan sandbox, Alat developer, rigged matches kept out of history.
  const [devMode, setDevMode] = useState(() => controller.devMode);
  const [sandbox, setSandbox] = useState<{ initial: DevHand | null } | null>(null);
  const [revealOpponents, setRevealOpponents] = useState(false);
  const changeDevMode = (on: boolean) => {
    controller.setDevMode(on);
    setDevMode(on);
    if (!on) { setSandbox(null); setRevealOpponents(false); }
  };

  const [quickMute] = useState(() => new AudioQuickMute());
  useEffect(() => {
    backgroundMusic.applySettings(settings);
    soundEffects.applySettings(settings);
  }, [settings.soundEnabled, settings.musicEnabled, settings.musicVolume, settings.masterVolume, settings.effectsVolume]);
  useEffect(() => {
    let unlocked = false;
    const unlock = () => {
      if (document.hidden) return;
      unlocked = true;
      void backgroundMusic.start();
      void soundEffects.unlock();
    };
    const visibility = () => {
      backgroundMusic.setPaused(document.hidden);
      if (!document.hidden && unlocked) void backgroundMusic.start();
    };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('click', unlock);
    document.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('click', unlock);
      document.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', visibility);
      void backgroundMusic.dispose();
    };
  }, []);
  const changeAudio = (patch: Partial<Pick<GameSettings, 'soundEnabled' | 'musicEnabled' | 'musicVolume' | 'masterVolume' | 'effectsVolume'>>, fromQuickMute = false) => {
    // Only a real switch change drops the mute snapshot (Batalkan perubahan resends unchanged values).
    if (!fromQuickMute && ((patch.soundEnabled ?? settings.soundEnabled) !== settings.soundEnabled
      || (patch.musicEnabled ?? settings.musicEnabled) !== settings.musicEnabled)) quickMute.clear();
    const stored = persistSettings(settings, patch);
    backgroundMusic.applySettings(stored);
    soundEffects.applySettings(stored);
    soundRef.current = stored.soundEnabled;
    setSettings(stored);
    controller.setSettings(stored);
  };

  // Sound effects follow the live effects setting.
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
  const automationBlocked = modal !== null || abandonOpen || dice !== null || sandbox !== null;
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
    setDice(null);
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
    controller.startMatch('stay', timeLimitMinutes, deadWall);
    const roll = openingRollOf(controller.match);
    setDice(roll ? { roll } : null);
    setMatchStarted(true);
    setView('table');
  };

  // Continuous match: the next hand keeps the bot pause choice and the match's Kim mode.
  const nextHand = () => {
    if (controller.nextHand()) { setDice(controller.handRoll ? { roll: controller.handRoll } : null); setResultOpen(false); setSelectedId(null); }
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
    changeAudio(quickMute.toggle(settings), true);
  };

  // Dev-only: `?demo=table|claim|hu|seri|dice|final[&win=ce_mo|buangan][&kong=1]` opens a seeded table state for reproducible screenshots.
  const demoStarted = useRef(false);
  useEffect(() => {
    if (!import.meta.env.DEV || demoStarted.current) return;
    demoStarted.current = true;
    void import('./ui/dev-demo').then(({ demoFromUrl, driveDemo, stackDemoMelds, finishDemoMatch, restyleDemoWin, seriDemo, addDemoKongs, DEMO_OPENING_ROLL, DEMO_KONG_HAND }) => {
      const demo = demoFromUrl(window.location.search);
      if (!demo) return;
      startPractice();
      setPaused(true);
      // The dice demo holds on the announcement; before the match exposes a roll it shows a sample.
      if (demo.mode === 'dice') setDice({ roll: openingRollOf(controller.match) ?? DEMO_OPENING_ROLL });
      else {
        setDice(null);
        driveDemo(controller, demo.mode === 'melds' || demo.mode === 'seri' ? 'table' : demo.mode === 'final' ? 'hu' : demo.mode);
        if (demo.mode === 'melds') stackDemoMelds(controller);
        if (demo.mode === 'seri') seriDemo(controller);
        if (demo.win) restyleDemoWin(controller, demo.win);
        if (demo.kong) addDemoKongs(controller);
        if (demo.mode === 'final') { finishDemoMatch(controller); setStandingsOpen(true); }
      }
      // `&result=closed` shows the table behind a finished hand; `&modal=history` opens the history.
      const params = new URLSearchParams(window.location.search);
      if (params.get('result') === 'closed') setTimeout(() => setResultOpen(false), 300);
      if (params.get('modal') === 'history') setModal('history');
      // `&sandbox=kong` opens Uji Tangan on a sample hand with a Kong Zhong and an open Kong.
      if (params.get('sandbox') === 'kong') setSandbox({ initial: DEMO_KONG_HAND });
    });
  }, []);

  const pos = seatPositions(controller.humanSeat);
  return (
    <div className={appClass(view, optionsOpen)}>
      <header className="app-header" inert={dice !== null || undefined}>
        <div className="brand">
          <span className="brand-tile">金</span>
          <div>
            <h1>Mahjong Indonesia</h1>
            <span className="release-version" aria-label={"Versi " + releaseVersion}>{"v" + releaseVersion}</span>
            {devMode && <span className="dev-badge" title="Mode developer aktif — game tidak dicatat ke riwayat">DEV</span>}
          </div>
        </div>

        <div className="header-actions">
          {devMode && <button type="button" className="icon-btn is-dev" onClick={() => setSandbox({ initial: null })} title="Uji Tangan (mode developer)" aria-label="Uji Tangan">
            <FlaskConical size={18} />
          </button>}
          <button type="button" className="icon-btn" onClick={() => setModal('history')} title="Riwayat Permainan">
            <History size={18} />
          </button>
          <button type="button" className="icon-btn" onClick={toggleSound} aria-label={settings.soundEnabled || settings.musicEnabled ? 'Bisukan semua audio' : 'Pulihkan pilihan audio'} title={settings.soundEnabled || settings.musicEnabled ? 'Bisukan semua audio' : 'Pulihkan pilihan audio'}>
            {settings.soundEnabled || settings.musicEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button type="button" className="icon-btn" onClick={() => setModal('settings')} title="Pengaturan">
            <Settings size={18} />
          </button>
          {matchStarted && <button type="button" className="btn btn-primary btn-new-game" title="Permainan Baru" onClick={() => midMatch ? setAbandonOpen(true) : newGame()}>
            <RotateCcw size={14} /> <span className="btn-text">Permainan Baru</span>
          </button>}
        </div>
      </header>

      {view === 'menu' ? (
        <MainMenu kimMode={settings.kimMode ?? (settings.kimEnabled ? 'natural' : 'off')} onKimModeChange={kimMode => {
          const stored = persistSettings(settings, { kimEnabled: kimMode !== 'off', kimMode });
          setSettings(stored);
          controller.setSettings(stored);
        }} difficulty={settings.aiDifficulty} onDifficultyChange={diff => {
          const stored = persistSettings(settings, { aiDifficulty: diff });
          setSettings(stored);
          controller.setSettings(stored);
        }} difficultyLabel={DIFFICULTY_LABEL[settings.aiDifficulty]} onPractice={startPractice}
          timeLimitMinutes={timeLimitMinutes} onTimeLimitChange={limit => { setTimeLimitMinutes(limit); saveMatchTimeLimit(limit); }}
          deadWall={deadWall} onDeadWallChange={option => { setDeadWall(option); saveDeadWall(option); }}
          lastResult={history[0] ? history[0].winner === null ? 'Seri' : tayKoinText(history[0]) : null} />
      ) : (
        <main className="table-felt" inert={dice !== null || undefined}>
          {controller.getState().kimFace && <div className="kim-indicator">Kim: {tileText({ ...controller.getState().kimFace!, id: 'kim-indicator', isKim: false })}{controller.getState().kimIndicator && <span className="kim-pointer"> · Penunjuk {tileText({ ...controller.getState().kimIndicator!, id: 'kim-pointer', isKim: false })}</span>}</div>}
          <OpponentPanel seat={pos.top} position="top" controller={controller} reveal={devMode && revealOpponents} />
          <OpponentPanel seat={pos.left} position="left" controller={controller} reveal={devMode && revealOpponents} />
          <CenterArea controller={controller} progress={
            <PlayProgress controller={controller} paused={paused} blocked={automationBlocked} pace={pace} onPaceChange={changePace} onToggleMotion={toggleMotion}
              onPause={() => setPaused(p => !p)} onStep={() => singleAutomationStep(controller, automationBlocked || !paused)}
              optionsOpen={optionsOpen} onOptionsOpenChange={changeOptionsOpen}>
              {devMode && <DevTools controller={controller} revealOpponents={revealOpponents} onRevealChange={setRevealOpponents} />}
            </PlayProgress>
          } />
          <OpponentPanel seat={pos.right} position="right" controller={controller} reveal={devMode && revealOpponents} />
          <div className="seat-bottom">
            <HumanArea controller={controller} actions={actions} selectedId={selectedId} onSelect={setSelectedId}
              hud={<ActionHud controller={controller} actions={actions} selectedId={selectedId} onSelect={setSelectedId} />}
              coach={<PracticeCoach controller={controller} actions={actions} selectedId={selectedId} />} />
            {outcome && !resultOpen && (
              <button type="button" className="btn btn-gold result-reopen" onClick={() => setResultOpen(true)}>
                Lihat hasil permainan
              </button>
            )}
          </div>
        </main>
      )}

      {view === 'table' && <KongToast payments={controller.currentKongPayments} />}
      {view === 'table' && outcome && resultOpen && !standingsOpen && !modal && !sandbox && <HuResultModal outcome={outcome} onClose={() => setResultOpen(false)}
        onNewGame={controller.match && !controller.matchOver ? () => { setResultOpen(false); setAbandonOpen(true); } : newGame}
        onNextHand={controller.match && !controller.matchOver ? nextHand : undefined}
        onStandings={controller.matchOver ? openStandings : undefined}
        matchSummary={controller.match ? <MatchResultNote match={controller.match} /> : undefined}
        onOpenSandbox={devMode && outcome.kind === 'hu' ? () => setSandbox({ initial: devHandFromOutcome(outcome, controller.getState()) }) : undefined} />}
      {view === 'table' && standingsOpen && controller.match && !modal && <MatchStandingsModal match={controller.match} onPlayAgain={startPractice} onMenu={newGame} />}
      {view === 'table' && dice && <DiceRoll key={JSON.stringify(dice.roll)} roll={dice.roll} humanSeat={controller.humanSeat} onDone={() => setDice(null)} />}
      {abandonOpen && <AbandonMatchDialog onStay={() => setAbandonOpen(false)} onLeave={newGame} />}
      {modal === 'settings' && <SettingsModal settings={settings} onAudioChange={changeAudio} onSave={saveSettings} onClose={() => setModal(null)} devMode={devMode} onDevModeChange={changeDevMode} />}
      {sandbox && <HandSandbox key={sandbox.initial ? 'outcome' : 'blank'} settings={settings} initial={sandbox.initial} onClose={() => setSandbox(null)} />}
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
