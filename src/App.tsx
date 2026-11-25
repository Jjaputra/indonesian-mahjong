import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { History, Settings, Volume2, VolumeX } from 'lucide-react';
import { AudioSettingsWriter, AudioQuickMute, backgroundMusic, soundEffects } from './audio';
import { clearGameHistory, deleteGameRecord, loadGameHistory, loadSettings, updateSettings, getStorage, type GameSettings, type StorageLike } from './storage';
import { HistoryModal } from './ui/components/HistoryModal';
import { SettingsModal } from './ui/components/SettingsModal';
import { AdminPage } from './ui/components/AdminPage';
import { MainMenu } from './ui/components/MainMenu';
import { OnlineScreen } from './ui/components/OnlineScreen';
import type { OnlineStep } from './ui/components/OnlineMenu';
import { openAuth, useAccount } from './net/auth';
import { loadLastRoom, mpServerUrl, parseRoomParam } from './net/room-store';
import { useScreenWakeLock } from './ui/wake-lock';
import { usePhoneLandscape } from './ui/components/ChatPanel';
import { releaseVersion } from './ui/release';
import logoSmall from './assets/brand/maciokyu-logo-sm.png';

type View = 'menu' | 'table' | 'online';

const OnlineAuditPreview = import.meta.env.DEV ? lazy(async () => {
  const module = await import('./ui/dev-online-demo');
  await module.prepareOnlineAudit();
  return { default: module.OnlineAuditPreview };
}) : null;
const DemoPreview = import.meta.env.DEV ? lazy(() => import('./ui/dev-demo').then(module => ({ default: module.DemoPreview }))) : null;

export function demoPreviewEnabled(search: string): boolean {
  return import.meta.env.DEV && /^(online|table|late|claim|hu|seri|dice|melds|final)$/.test(new URLSearchParams(search).get('demo') ?? '');
}

export const OPTIONS_OPEN_KEY = 'itm.options-open.v1';

export function loadOptionsOpen(storage?: StorageLike): boolean {
  try {
    const stored = (storage ?? getStorage()).getItem(OPTIONS_OPEN_KEY);
    if (stored === '0' || stored === 'false') return false;
    if (stored === '1' || stored === 'true') return true;
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 640px), (orientation: landscape) and (max-height: 500px)').matches) return false;
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

export function useOptionsOpen(storage?: StorageLike) {
  const [optionsOpen, setOptionsOpen] = useState(() => loadOptionsOpen(storage));
  const changeOptionsOpen = useCallback((open: boolean, persist = true) => { setOptionsOpen(open); if (persist) saveOptionsOpen(open, storage); }, [storage]);
  const phone = usePhoneLandscape();
  const prevPhone = useRef(phone);
  useEffect(() => {
    const wasPhone = prevPhone.current;
    prevPhone.current = phone;
    if (wasPhone && !phone) setOptionsOpen(loadOptionsOpen(storage));
  }, [phone, storage]);
  return [optionsOpen, changeOptionsOpen] as const;
}

export function App() {
  const [settings, setSettings] = useState(loadSettings);
  useEffect(() => { try { getStorage().removeItem('maciokyu.solo-match.v1'); } catch { /* Storage may be unavailable. */ } }, []);
  const mpServer = mpServerUrl();
  const account = useAccount();
  useEffect(() => {
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('demo') === 'online') return;
    if (mpServer) void openAuth(mpServer).catch(() => {});
  }, [mpServer]);
  const [inviteCode, setInviteCode] = useState(() => mpServer && typeof window !== 'undefined' ? parseRoomParam(window.location.search) : null);
  const [view, setView] = useState<View>(inviteCode ? 'online' : 'menu');
  const [initialStep, setInitialStep] = useState<OnlineStep>('create');
  const [onlineTable, setOnlineTable] = useState(false);
  const [resumeOnline, setResumeOnline] = useState(false);
  const [modal, setModal] = useState<'settings' | 'history' | null>(null);
  const [history, setHistory] = useState(loadGameHistory);
  const [optionsOpen, changeOptionsOpen] = useOptionsOpen();
  const [quickMute] = useState(() => new AudioQuickMute());
  const [audioWriter] = useState(() => new AudioSettingsWriter(patch => { updateSettings(patch); }));
  const liveAudioSettings = useRef(settings);
  liveAudioSettings.current = settings;
  useEffect(() => { audioWriter.flush(); }, [modal, audioWriter]);
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
      if (document.hidden) audioWriter.flush();
      backgroundMusic.setPaused(document.hidden);
      // Effects use their own context, which iOS can interrupt while hidden.
      if (!document.hidden && unlocked) { void backgroundMusic.start(); void soundEffects.unlock(); }
    };
    const pagehide = () => audioWriter.flush();
    window.addEventListener('pagehide', pagehide);
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('click', unlock);
    document.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      audioWriter.flush();
      window.removeEventListener('pagehide', pagehide);
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('click', unlock);
      document.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', visibility);
      void backgroundMusic.dispose();
    };
  }, [audioWriter]);
  const changeAudio = (patch: Partial<Pick<GameSettings, 'soundEnabled' | 'musicEnabled' | 'musicVolume' | 'masterVolume' | 'effectsVolume'>>, fromQuickMute = false) => {
    // Only a real switch change drops the mute snapshot (Batalkan perubahan resends unchanged values).
    if (!fromQuickMute && ((patch.soundEnabled ?? settings.soundEnabled) !== settings.soundEnabled
      || (patch.musicEnabled ?? settings.musicEnabled) !== settings.musicEnabled)) quickMute.clear();
    const stored = { ...liveAudioSettings.current, ...patch };
    liveAudioSettings.current = stored;
    audioWriter.queue(patch);
    if (fromQuickMute || patch.soundEnabled !== undefined || patch.musicEnabled !== undefined) audioWriter.flush();
    backgroundMusic.applySettings(stored);
    soundEffects.applySettings(stored);
    setSettings(stored);
  };


  useScreenWakeLock(settings.keepScreenOn && view === 'online' && onlineTable);
  const showDemo = typeof window !== 'undefined' && demoPreviewEnabled(window.location.search);
  const onlineAudit = import.meta.env.DEV && showDemo && new URLSearchParams(window.location.search).get('demo') === 'online';
  const auditState = onlineAudit ? new URLSearchParams(window.location.search).get('state') ?? 'early' : '';
  const auditMenu = onlineAudit && /^(public-list|lobby|menu|create|join|settings|history|premium|match-help|admin)/.test(auditState);
  if (mpServer && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('admin') === '1') return <AdminPage server={mpServer} />;
  return (
    <div className={appClass(onlineTable || (showDemo && !auditMenu) ? 'table' : 'menu', onlineAudit ? auditState.endsWith('options-open') : optionsOpen)}>
      <header className="app-header">
        <div className="brand">
          <div>
            <h1 className="brand-logo"><img src={logoSmall} alt="maciokYU!" width={94} height={30} /></h1>
            <span className="release-version" aria-label={"Versi " + releaseVersion}>{"v" + releaseVersion}</span>
          </div>
        </div>

        <div className="header-actions">
          <button type="button" className="icon-btn" onClick={() => { setHistory(loadGameHistory()); setModal('history'); }} title="Riwayat">
            <History size={18} />
          </button>
          <button type="button" className="icon-btn" onClick={() => changeAudio(quickMute.toggle(settings), true)} aria-label={settings.soundEnabled || settings.musicEnabled ? 'Bisukan semua audio' : 'Balikin pilihan audio'} title={settings.soundEnabled || settings.musicEnabled ? 'Bisukan semua audio' : 'Balikin pilihan audio'}>
            {settings.soundEnabled || settings.musicEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button type="button" className="icon-btn" onClick={() => setModal('settings')} title="Pengaturan">
            <Settings size={18} />
          </button>
        </div>
      </header>


      {onlineAudit && OnlineAuditPreview ? <Suspense fallback={null}><OnlineAuditPreview search={window.location.search} /></Suspense> : showDemo && DemoPreview ? <Suspense fallback={null}><DemoPreview search={window.location.search} /></Suspense> : view === 'online' && mpServer ? (
        <OnlineScreen server={mpServer} inviteCode={inviteCode} resume={resumeOnline} initialStep={initialStep}
          onTableChange={setOnlineTable} optionsOpen={optionsOpen} onOptionsOpenChange={changeOptionsOpen}
          onExit={() => { setInviteCode(null); setResumeOnline(false); setView('menu'); }} />
      ) : (
        <MainMenu onOnline={mpServer ? step => { setInitialStep(step); setView('online'); } : undefined}
          resumeRoomCode={mpServer ? account ? account.currentRoom?.code : loadLastRoom()?.code : null}
          onResumeRoom={() => { setResumeOnline(true); setView('online'); }} />
      )}
      {modal === 'settings' && <SettingsModal settings={settings} onAudioChange={changeAudio}
        onSave={draft => { setSettings(updateSettings(draft)); setModal(null); }} onClose={() => setModal(null)} />}
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
