import { Hand, Layers, Sparkles, Trophy, Undo2, Flower2, ArrowDownToLine, Trash2, Crown } from 'lucide-react';
import type { ReactNode } from 'react';
import { sortTiles } from '../../core/tiles';
import type { Seat, Tile } from '../../core/types';
import { isKim } from '../../kim/wildcard-solver';
import type { GameController, HumanActions } from '../game-controller';
import { PLAYER_NAME, SEAT_LABEL, SEAT_SHORT, WIND_GLYPH, tileText } from '../labels';
import { MeldView, TileBack, TileRow, TileView } from './TileView';

/** Screen position of each seat relative to the human at the bottom (turn order runs counter-clockwise). */
export function seatPositions(human: Seat): Record<'bottom' | 'right' | 'top' | 'left', Seat> {
  const order: Seat[] = ['dong', 'nan', 'xi', 'bei'];
  const i = order.indexOf(human);
  return { bottom: human, right: order[(i + 1) % 4]!, top: order[(i + 2) % 4]!, left: order[(i + 3) % 4]! };
}

function WindBadges({ seat, controller }: { seat: Seat; controller: GameController }) {
  const s = controller.getState();
  return (
    <span className="badges">
      <span className="badge badge-seat" title={`Angin duduk: ${SEAT_LABEL[seat]}`}>
        {WIND_GLYPH[seat]} {SEAT_SHORT[seat]}
      </span>
      {s.roundWind === seat && (
        <span className="badge badge-round" title="Angin putaran sama dengan angin duduk">
          Putaran
        </span>
      )}
      {s.dealerSeat === seat && (
        <span className="badge badge-dealer" title="Dealer (Bandar)">
          <Crown size={11} /> Dealer
        </span>
      )}
      {s.players[seat].isPaoChin && <span className="badge badge-pao">Pao Chin</span>}
    </span>
  );
}

function FlowerRack({ tiles }: { tiles: readonly Tile[] }) {
  if (!tiles.length) return <span className="rack-empty">Belum ada Bunga/Musim</span>;
  return <TileRow tiles={tiles} size="sm" />;
}

export function OpponentPanel({ seat, position, controller }: { seat: Seat; position: string; controller: GameController }) {
  const s = controller.getState();
  const p = s.players[seat];
  const active = s.currentTurn === seat && (s.phase === 'ACTION_DECISION' || s.phase === 'TURN_DRAW');
  const kimInMelds = p.melds.flatMap((m) => m.tiles).filter(isKim).length;
  return (
    <section className={`seat-panel seat-${position}${active ? ' is-active' : ''}`} aria-label={`${PLAYER_NAME[seat]} — ${SEAT_LABEL[seat]}`}>
      <div className="seat-head">
        <strong>{PLAYER_NAME[seat]}</strong>
        <WindBadges seat={seat} controller={controller} />
        {kimInMelds > 0 && <span className="badge badge-kim">KIM ×{kimInMelds}</span>}
      </div>
      <div className="concealed" title={`${p.hand.length} tile tertutup`}>
        {p.hand.map((t) => (
          <TileBack key={t.id} size="sm" />
        ))}
        <span className="count">{p.hand.length}</span>
      </div>
      <div className="melds">
        {p.melds.map((m, i) => (
          <MeldView key={i} meld={m} />
        ))}
      </div>
      <div className="rack">
        <Flower2 size={12} /> <FlowerRack tiles={p.flowers} />
      </div>
    </section>
  );
}

export function CenterArea({ controller }: { controller: GameController }) {
  const s = controller.getState();
  const settings = controller.getSettings();
  const pending = s.discardPending;
  const trail = controller.discardTrail;
  const lastCommitted = trail[trail.length - 1];
  return (
    <section className="center-area" aria-label="Area buangan">
      <div className="center-stats">
        <span className="stat" title="Sisa tile di tembok">
          <Layers size={14} /> Tembok: <b>{s.wall.remainingCount}</b>
        </span>
        <span className="stat" title="Angin putaran">
          Putaran: <b>{WIND_GLYPH[s.roundWind]} {SEAT_SHORT[s.roundWind]}</b>
        </span>
        <span className="stat">
          Giliran: <b>{PLAYER_NAME[s.currentTurn]}</b>
        </span>
        <span className={`stat kim-indicator${settings.kimEnabled ? '' : ' off'}`} title="Status Kim">
          <Sparkles size={14} /> {`KIM ${settings.kimEnabled ? (settings.kimDiscardAllowed ? 'aktif · boleh dibuang' : 'aktif · tidak boleh dibuang') : 'nonaktif'}`}
        </span>
      </div>
      {pending && (
        <div className="pending-discard">
          <span>
            {pending.isPromotedKong ? 'Kakan oleh' : 'Buangan'} {PLAYER_NAME[pending.discarder]}:
          </span>
          <TileView tile={pending.tile} size="lg" highlight />
        </div>
      )}
      <div className="discard-pool" aria-label="Riwayat buangan">
        {trail.length === 0 && !pending && <span className="muted">Belum ada buangan.</span>}
        {trail.map((d, i) => (
          <span key={d.tile.id} className={`pool-tile seat-mark-${d.seat}`} title={`${PLAYER_NAME[d.seat]} · ${tileText(d.tile)} (#${i + 1})`}>
            <TileView tile={d.tile} size="sm" highlight={!pending && d === lastCommitted} />
          </span>
        ))}
      </div>
      <ol className="game-log" aria-label="Log permainan">
        {controller.log.slice(-6).map((l) => (
          <li key={l.id}>{l.text}</li>
        ))}
      </ol>
    </section>
  );
}

interface HumanAreaProps {
  controller: GameController;
  actions: HumanActions;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function HumanArea({ controller, actions, selectedId, onSelect }: HumanAreaProps) {
  const s = controller.getState();
  const seat = controller.humanSeat;
  const p = s.players[seat];
  const drawnId = controller.humanDrawnTileId;
  const drawn = p.hand.find((t) => t.id === drawnId);
  const rest = sortTiles(p.hand.filter((t) => t.id !== drawnId));
  const discardable = new Set(actions.discardableTileIds);
  const active = s.currentTurn === seat && s.phase === 'ACTION_DECISION';

  const tileButton = (t: Tile, isDrawn: boolean) => {
    const canPick = actions.canDiscard && discardable.has(t.id);
    return (
      <TileView
        key={t.id}
        tile={t}
        size="lg"
        drawn={isDrawn}
        selected={selectedId === t.id}
        disabled={actions.canDiscard && !canPick}
        onClick={() => {
          if (!canPick) return;
          if (selectedId === t.id) controller.humanDiscard(t.id);
          else onSelect(t.id);
        }}
        onDoubleClick={() => canPick && controller.humanDiscard(t.id)}
      />
    );
  };

  return (
    <section className={`human-area${active ? ' is-active' : ''}`} aria-label="Tangan Anda">
      <div className="seat-head">
        <strong>{PLAYER_NAME[seat]}</strong>
        <WindBadges seat={seat} controller={controller} />
        <span className="rack">
          <Flower2 size={12} /> <FlowerRack tiles={p.flowers} />
        </span>
      </div>
      <div className="melds">
        {p.melds.map((m, i) => (
          <MeldView key={i} meld={m} size="md" />
        ))}
      </div>
      <div className="hand-row" role="group" aria-label="Tile di tangan">
        {rest.map((t) => tileButton(t, false))}
        {drawn && <span className="drawn-gap" />}
        {drawn && tileButton(drawn, true)}
      </div>
      {actions.canDiscard && (
        <p className="hint">Klik tile untuk memilih, klik lagi (atau dobel klik) untuk Buang. Tile KIM tidak dapat dibuang bila aturan melarang.</p>
      )}
    </section>
  );
}

interface HudButtonProps {
  label: string;
  enabled: boolean;
  onClick: () => void;
  tone?: 'primary' | 'gold' | 'danger' | 'plain';
  icon?: ReactNode;
  title?: string;
}

function HudButton({ label, enabled, onClick, tone = 'plain', icon, title }: HudButtonProps) {
  return (
    <button type="button" className={`hud-btn hud-${tone}`} disabled={!enabled} onClick={onClick} title={title}>
      {icon}
      {label}
    </button>
  );
}

export function ActionHud({
  controller,
  actions,
  selectedId,
  onSelect,
}: {
  controller: GameController;
  actions: HumanActions;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const claim = actions.claim;
  const huScore = claim ? claim.huScore : actions.selfHuScore;
  const canHu = claim ? claim.canHu : actions.canSelfDrawHu;
  const huTitle = huScore
    ? huScore.isValidHu
      ? `${huScore.totalTay} Tay — Hu sah`
      : `Hand lengkap, tetapi ${huScore.totalTay} Tay < minimum ${huScore.minHuTay} (Lew Fit)`
    : 'Hand belum lengkap';
  const selectedOk = !!selectedId && actions.discardableTileIds.includes(selectedId);

  return (
    <div className="action-hud" role="toolbar" aria-label="Aksi">
      {claim && (
        <div className="claim-banner">
          {claim.isPromotedKong ? 'Chiong Kong?' : 'Klaim buangan'} {PLAYER_NAME[claim.discarder]}: <TileView tile={claim.tile} size="sm" />
        </div>
      )}
      {actions.canReplaceFlowers && (
        <HudButton label="Ganti Bunga" tone="gold" enabled onClick={() => controller.humanReplaceFlowers()} icon={<Flower2 size={14} />} />
      )}
      <HudButton label="Tarik" enabled={actions.canDraw} onClick={() => controller.humanDraw()} icon={<ArrowDownToLine size={14} />} title="Tarik tile dari tembok (otomatis setelah semua Lew)" />
      <HudButton
        label="Buang"
        tone="primary"
        enabled={actions.canDiscard && selectedOk}
        onClick={() => {
          if (selectedId) controller.humanDiscard(selectedId);
          onSelect(null);
        }}
        icon={<Trash2 size={14} />}
      />
      {claim?.jiaOptions.length
        ? claim.jiaOptions.map((opt, i) => (
            <HudButton
              key={i}
              label={`Jia ${sortTiles([...opt, claim.tile]).map((t) => t.value).join('-')}`}
              enabled
              onClick={() => controller.humanClaim('jia', i)}
            />
          ))
        : <HudButton label="Jia" enabled={false} onClick={() => undefined} />}
      <HudButton label="Pung" enabled={!!claim?.canPung} onClick={() => controller.humanClaim('pung')} />
      {claim ? (
        <HudButton label="Kong" enabled={claim.canKong} onClick={() => controller.humanClaim('kong')} />
      ) : (
        <>
          {actions.ankongOptions.length > 0 ? (
            actions.ankongOptions.map((g, i) => (
              <HudButton key={`a${i}`} label={`Ankong ${tileText(g[0]!)}`} enabled onClick={() => controller.humanAnkong(i)} />
            ))
          ) : (
            <HudButton label="Kong" enabled={false} onClick={() => undefined} />
          )}
          {actions.kakanOptions.map((o, i) => (
            <HudButton key={`k${i}`} label={`Kakan ${tileText(o.tile)}`} enabled onClick={() => controller.humanKakan(i)} />
          ))}
        </>
      )}
      <HudButton label="Pao Chin" enabled={actions.canPaoChin} onClick={() => controller.humanPaoChin()} icon={<Hand size={14} />} title="Hand langsung Cin pada pembagian pertama" />
      <HudButton
        label={huScore ? `Hu (${huScore.totalTay} Tay)` : 'Hu'}
        tone="gold"
        enabled={canHu}
        title={huTitle}
        onClick={() => (claim ? controller.humanClaim('hu') : controller.humanSelfDrawHu())}
        icon={<Trophy size={14} />}
      />
      <HudButton label="Lew" tone="danger" enabled={!!claim} onClick={() => controller.humanClaim('pass')} icon={<Undo2 size={14} />} title="Lewati klaim" />
    </div>
  );
}
