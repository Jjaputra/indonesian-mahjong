import { PremiumBadge } from './GameTable';
import { deviceLimitFallback, useAccount } from '../../net/auth';
import { useState } from 'react';
import { connectionIndicator, type ConnectionStatus } from '../../net/connection';
import { Crown, HelpCircle, LogOut, MessageCircle, Share2 } from 'lucide-react';
import { SEAT_ORDER } from '../../core/tiles';
import type { Seat } from '../../core/types';
import type { RoomConfig, RoomInfo } from '../../net/protocol';
import { buildShareText, inviteLink, whatsAppUrl } from '../../net/room-store';
import { DIFFICULTY_LABEL, SEAT_LABEL } from '../labels';
import { PublicChoice } from './PublicTables';
import { InviteHelp } from './InviteHelp';
import { RoomConfigFields } from './RoomConfigFields';
import { AllowanceReset } from './AllowanceReset';
import { ReferralShare } from './ReferralShare';
import { DAILY_LIMIT_MESSAGE, useDailyRemaining } from '../../net/daily-limit';
import type { StorageLike } from '../../storage';

export function ConnectionIndicator({ status, latencyMs = null, pongLate = false }: { status: ConnectionStatus; latencyMs?: number | null; pongLate?: boolean }) {
  const indicator = connectionIndicator(status, latencyMs, pongLate);
  return <span className={`online-connection is-${indicator.tone}`} role="status"><span className="online-connection-dot" aria-hidden="true" />{indicator.text}</span>;
}

const KIM_TEXT = { natural: 'Kim dari tile', dedicated: 'Kim tambahan', off: 'Tanpa Kim' } as const;

/** Why the host can't press Mulai yet, or null when it can start. */
export function startBlocker(room: RoomInfo): string | null {
  const taken = room.seats.filter(s => s.name !== null).length;
  if (taken === 0) return 'Belum ada pemain yang duduk.';
  if (!room.config.fillWithBots && taken < 4) return `Butuh 4 pemain (baru ${taken}) atau nyalakan Isi pakai bot.`;
  return null;
}

export interface RoomLobbyProps {
  room: RoomInfo;
  connection?: { status: ConnectionStatus; latencyMs?: number | null; pongLate?: boolean };
  seat: Seat | null;
  isHost: boolean;
  dailyLimitStorage?: StorageLike;
  onSit: (seat: Seat) => void;
  onKick?: (name: string) => void;
  onStand: () => void;
  onStart: () => void;
  onConfig: (config: RoomConfig) => void;
  onLeave: () => void;
  onToast: (text: string) => void;
}

export function RoomLobby({ room, connection, seat, isHost, dailyLimitStorage, onSit, onKick, onStand, onStart, onConfig, onLeave, onToast }: RoomLobbyProps) {
  const [help, setHelp] = useState(false);
  const account = useAccount();
  const loginBlocked = !account && !deviceLimitFallback();
  const remaining = useDailyRemaining(dailyLimitStorage);
  const { config } = room;
  const blocker = isHost && seat === null ? 'Duduk dulu buat mulai' : startBlocker(room);
  const text = buildShareText(room.code, inviteLink(room.code, window.location));

  const share = async () => {
    try {
      if (typeof navigator.share === 'function') { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      onToast('Link undangan disalin');
    } catch (error) {
      if ((error as { name?: string })?.name !== 'AbortError') onToast('Nggak bisa bagikan. Salin kode room-nya sendiri.');
    }
  };

  return (
    <main className="main-menu">
      <section className="menu-card mp-card" aria-label="Lobi room">
        <div className="mp-bar">
          <button type="button" className="mp-link" onClick={onLeave}><LogOut size={16} aria-hidden="true" /> Keluar room</button>
          <button type="button" className="mp-link" onClick={() => setHelp(true)}><HelpCircle size={16} aria-hidden="true" /> Cara undang teman</button>
        </div>
        {connection && <ConnectionIndicator {...connection} />}
        <p className="menu-eyebrow">Kode room</p>
        <p className="mp-code" aria-label={`Kode room ${room.code.split('').join(' ')}`}>{room.code}</p>
        <div className="mp-share">
          <button type="button" className="btn btn-gold" onClick={share}><Share2 size={16} aria-hidden="true" /> Bagikan</button>
          <button type="button" className="btn btn-gold" onClick={() => window.open(whatsAppUrl(text), '_blank', 'noopener')}><MessageCircle size={16} aria-hidden="true" /> WhatsApp</button>
        </div>

        <ul className="mp-seats" aria-label="Kursi">
          {SEAT_ORDER.map(id => {
            const info = room.seats.find(s => s.seat === id);
            const mine = seat === id;
            return (
              <li key={id} className={`mp-seat${mine ? ' is-mine' : ''}${info?.name ? '' : ' is-empty'}`}>
                <span className="mp-seat-wind">{SEAT_LABEL[id]}</span>
                <strong className="mp-seat-name">
                  {info?.host && <Crown size={14} aria-label="Host" />}
                  <span className="player-name">{info?.name ?? (config.fillWithBots ? 'Kosong · nanti diisi bot' : 'Kosong · perlu 4 pemain')}</span>
                  {info?.premium && !info.bot && <PremiumBadge />}
                  {mine && <small> (kamu)</small>}
                  {info?.bot && <span className="badge">Bot</span>}
                  {info?.name && !info.bot && !info.connected && <span className="badge mp-offline">Offline</span>}
                </strong>
                {!info?.name && seat === null && <button type="button" className="btn" onClick={() => onSit(id)}>Duduk</button>}
                {room.phase === 'lobby' && isHost && !mine && info?.name && !info.bot && !info.host && onKick && <button type="button" className="btn" onClick={() => onKick(info.name!)}>Keluarkan</button>}
                {mine && <button type="button" className="btn" onClick={onStand}>Berdiri</button>}
              </li>
            );
          })}
        </ul>
        {room.spectators > 0 && <p className="muted mp-note">{room.spectators} penonton</p>}

        {(room.spectatorDetails ?? room.spectatorNames?.map(name => ({ name, premium: false })))?.map(({ name, premium }) => <div className="mp-public-spectator" key={name}><span className="player-with-premium"><span className="player-name">{name}</span>{premium && <PremiumBadge />}</span>{room.phase === 'lobby' && isHost && name !== room.hostName && onKick && <button className="btn" onClick={() => onKick(name)}>Keluarkan</button>}</div>)}
        <dl className="mp-rules" aria-label="Ringkasan aturan">
          <div><dt>Gabung</dt><dd>{config.public ? 'Meja publik' : 'Lewat kode/link'}</dd></div>
          <div><dt>Kim</dt><dd>{KIM_TEXT[config.kimMode]}</dd></div>
          <div><dt>Min Tay</dt><dd>{config.minHuTay}</dd></div>
          <div><dt>Waktu giliran</dt><dd>{config.turnSeconds === null ? 'Tanpa batas' : `${config.turnSeconds} dtk`}</dd></div>
          <div><dt>Match</dt><dd>16 game{config.timeLimitMinutes ? ` · maks ${config.timeLimitMinutes} menit` : ''}</dd></div>
          <div><dt>Bot</dt><dd>{config.fillWithBots ? `Isi kursi kosong · ${DIFFICULTY_LABEL[config.botLevel]}` : 'Tidak ada'}</dd></div>
          <div><dt>Penonton</dt><dd>{config.allowSpectators ? 'Boleh' : 'Tidak'}</dd></div>
        </dl>

        {isHost && (
          <details className="mp-config">
            <summary>Ubah aturan</summary>
            <PublicChoice config={config} onChange={patch => onConfig({ ...config, ...patch })} />
            <RoomConfigFields config={config} onChange={patch => onConfig({ ...config, ...patch })} />
          </details>
        )}

        <div className="menu-choices">
          {isHost ? (
            <button type="button" className="btn btn-primary menu-choice" disabled={blocker !== null || remaining === 0 || loginBlocked} onClick={onStart}>
              <strong>Mulai</strong><span>{blocker ?? (config.fillWithBots ? 'Kursi kosong diisi bot' : 'Keempat kursi udah terisi')}</span>
            </button>
          ) : (
            <p className="muted mp-note" role="status">{seat === null ? 'Tekan Duduk di kursi kosong buat ikut main.' : 'Nunggu host tekan Mulai…'}</p>
          )}
        </div>
        {isHost && <div className="online-daily-limit" role="status">
          <p>{Number.isFinite(remaining) ? `Jatah host hari ini: sisa ${Math.max(0, remaining - (account?.bonusMatches ?? 0))}${account?.bonusMatches ? ` +${account.bonusMatches} tabungan` : ''}` : account ? 'Jatah host: tanpa batas' : 'Host perlu masuk dulu.'}</p>
          {remaining === 0 && <><p>{DAILY_LIMIT_MESSAGE()}</p><ReferralShare onError={onToast} onToast={onToast} /></>}<AllowanceReset remaining={remaining} />
        </div>}
      </section>
      {help && <InviteHelp onClose={() => setHelp(false)} />}
    </main>
  );
}
