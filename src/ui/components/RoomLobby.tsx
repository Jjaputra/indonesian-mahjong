import { useState } from 'react';
import { Crown, HelpCircle, LogOut, MessageCircle, Share2 } from 'lucide-react';
import { SEAT_ORDER } from '../../core/tiles';
import type { Seat } from '../../core/types';
import type { RoomConfig, RoomInfo } from '../../net/protocol';
import { buildShareText, inviteLink, whatsAppUrl } from '../../net/room-store';
import { DIFFICULTY_LABEL, SEAT_LABEL } from '../labels';
import { InviteHelp } from './InviteHelp';
import { RoomConfigFields } from './RoomConfigFields';

const KIM_TEXT = { natural: 'Kim dari tile', dedicated: 'Kim tambahan', off: 'Tanpa Kim' } as const;

/** Why the host can't press Mulai yet, or null when it can start. */
export function startBlocker(room: RoomInfo): string | null {
  const taken = room.seats.filter(s => s.name !== null).length;
  if (taken === 0) return 'Belum ada pemain yang duduk.';
  if (!room.config.fillWithBots && taken < 4) return `Butuh 4 pemain (baru ${taken}), atau aktifkan bot.`;
  return null;
}

export interface RoomLobbyProps {
  room: RoomInfo;
  seat: Seat | null;
  isHost: boolean;
  onSit: (seat: Seat) => void;
  onStand: () => void;
  onStart: () => void;
  onConfig: (config: RoomConfig) => void;
  onLeave: () => void;
  onToast: (text: string) => void;
}

export function RoomLobby({ room, seat, isHost, onSit, onStand, onStart, onConfig, onLeave, onToast }: RoomLobbyProps) {
  const [help, setHelp] = useState(false);
  const { config } = room;
  const blocker = startBlocker(room);
  const text = buildShareText(room.code, inviteLink(room.code, window.location));

  const share = async () => {
    try {
      if (typeof navigator.share === 'function') { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      onToast('Tautan undangan disalin');
    } catch (error) {
      if ((error as { name?: string })?.name !== 'AbortError') onToast('Gagal membagikan. Salin kode room secara manual.');
    }
  };

  return (
    <main className="main-menu">
      <section className="menu-card mp-card" aria-label="Lobi room">
        <div className="mp-bar">
          <button type="button" className="mp-link" onClick={onLeave}><LogOut size={16} aria-hidden="true" /> Keluar room</button>
          <button type="button" className="mp-link" onClick={() => setHelp(true)}><HelpCircle size={16} aria-hidden="true" /> Cara undang teman</button>
        </div>
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
                  {info?.name ?? (config.fillWithBots ? 'Kosong · bot akan duduk' : 'Kosong · perlu 4 pemain')}
                  {mine && <small> (Anda)</small>}
                  {info?.bot && <span className="badge">Bot</span>}
                  {info?.name && !info.bot && !info.connected && <span className="badge mp-offline">Offline</span>}
                </strong>
                {!info?.name && seat === null && <button type="button" className="btn" onClick={() => onSit(id)}>Duduk</button>}
                {mine && <button type="button" className="btn" onClick={onStand}>Berdiri</button>}
              </li>
            );
          })}
        </ul>
        {room.spectators > 0 && <p className="muted mp-note">{room.spectators} penonton</p>}

        <dl className="mp-rules" aria-label="Ringkasan aturan">
          <div><dt>Kim</dt><dd>{KIM_TEXT[config.kimMode]}</dd></div>
          <div><dt>Min Tay</dt><dd>{config.minHuTay}</dd></div>
          <div><dt>Waktu giliran</dt><dd>{config.turnSeconds === null ? 'Tanpa batas' : `${config.turnSeconds} dtk`}</dd></div>
          <div><dt>Pertandingan</dt><dd>16 game{config.timeLimitMinutes ? ` · maks ${config.timeLimitMinutes} menit` : ''}</dd></div>
          <div><dt>Bot</dt><dd>{config.fillWithBots ? `Isi kursi kosong · ${DIFFICULTY_LABEL[config.botLevel]}` : 'Tidak ada'}</dd></div>
          <div><dt>Penonton</dt><dd>{config.allowSpectators ? 'Boleh' : 'Tidak'}</dd></div>
        </dl>

        {isHost && (
          <details className="mp-config">
            <summary>Ubah aturan</summary>
            <RoomConfigFields config={config} onChange={patch => onConfig({ ...config, ...patch })} />
          </details>
        )}

        <div className="menu-choices">
          {isHost ? (
            <button type="button" className="btn btn-primary menu-choice" disabled={blocker !== null} onClick={onStart}>
              <strong>Mulai</strong><span>{blocker ?? (config.fillWithBots ? 'Kursi kosong diisi bot' : 'Keempat kursi sudah terisi')}</span>
            </button>
          ) : (
            <p className="muted mp-note" role="status">{seat === null ? 'Tekan Duduk di kursi kosong untuk ikut bermain.' : 'Menunggu host menekan Mulai…'}</p>
          )}
        </div>
      </section>
      {help && <InviteHelp onClose={() => setHelp(false)} />}
    </main>
  );
}
