import { TableMotion } from './TableMotion';
import { Hand, Layers, Sparkles, Trophy, Undo2, Flower2, ArrowDownToLine, MoveDownRight, Crown } from 'lucide-react';
import type { ReactNode } from 'react';
import { sortTiles } from '../../core/tiles';
import type { Seat, Tile } from '../../core/types';
import { isKim } from '../../kim/wildcard-solver';
import type { GameController, HumanActions } from '../game-controller';
import { PLAYER_NAME, SEAT_LABEL, SEAT_SHORT, WIND_GLYPH, tileText } from '../labels';
import { practiceCoachLine, type CoachEmphasis } from '../practice-coach';
import { handReadingLine } from '../hand-reading';
import { isFirstGoAround, isInitialDealtHand, seatWindOf, toFullRules, toScoringOverlap } from '../win-context';
import { MeldView, TileBack, TileRow, TileView } from './TileView';

/** Screen position of each seat relative to the human at the bottom (turn order runs counter-clockwise). */
export function seatPositions(human: Seat): Record<'bottom' | 'right' | 'top' | 'left', Seat> {
  const order: Seat[] = ['dong', 'nan', 'xi', 'bei'];
  const i = order.indexOf(human);
  return { bottom: human, right: order[(i + 1) % 4]!, top: order[(i + 2) % 4]!, left: order[(i + 3) % 4]! };
}

function WindBadges({ seat, controller }: { seat: Seat; controller: GameController }) {
  const s = controller.getState();
  const wind = seatWindOf(s, seat);
  return (
    <span className="badges">
      <span className="badge badge-seat" title={`Angin duduk: ${SEAT_LABEL[wind]}`}>
        {WIND_GLYPH[wind]} {SEAT_SHORT[wind]}
      </span>
      {s.roundWind === wind && (
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

/** `seat` is the seat wind this hand: own Bunga / Musim number 1–4 = Timur–Utara. */
function FlowerRack({ tiles, seat }: { tiles: readonly Tile[]; seat: Seat }) {
  if (!tiles.length) return <span className="rack-empty">Belum ada Bunga / Musim</span>;
  const ownNumber = ['dong', 'nan', 'xi', 'bei'].indexOf(seat) + 1;
  return <span className="bonus-rack"><TileRow tiles={tiles} size="sm" /><small>Nomor sendiri: {ownNumber}</small></span>;
}

export function OpponentPanel({ seat, position, controller }: { seat: Seat; position: string; controller: GameController }) {
  const s = controller.getState();
  const p = s.players[seat];
  const active = s.currentTurn === seat && (s.phase === 'ACTION_DECISION' || s.phase === 'TURN_DRAW');
  const kimInMelds = p.melds.flatMap((m) => m.tiles).filter(isKim).length;
  return (
    <section className={`seat-panel seat-${position}${active ? ' is-active' : ''}`} aria-label={`${PLAYER_NAME[seat]} — ${SEAT_LABEL[seatWindOf(s, seat)]}`}>
      <div className="seat-head">
        <strong>{PLAYER_NAME[seat]}</strong>
        <WindBadges seat={seat} controller={controller} />
        {kimInMelds > 0 && <span className="badge badge-kim">KIM ×{kimInMelds}</span>}
      </div>
      <div data-hand-anchor={seat} className="concealed" title={`${p.hand.length} tile tertutup`}>
        {p.hand.map((t) => (
          <TileBack key={t.id} size="sm" />
        ))}
        <span className="count">{p.hand.length}</span>
      </div>
      <div data-meld-anchor={seat} className="melds">
        {p.melds.map((m, i) => (
          <MeldView key={i} meld={m} />
        ))}
      </div>
      <div className="rack">
        <Flower2 size={12} /> <FlowerRack tiles={p.flowers} seat={seatWindOf(s, seat)} />
      </div>
    </section>
  );
}

/** Stacks of the remaining wall, dealt around the four sides of the square inside the table. */
function WallRing({ remaining }: { remaining: number }) {
  const stacks = Math.ceil(remaining / 2);
  const sides = (['bottom', 'right', 'top', 'left'] as const).map((side, i) => ({ side, count: Math.floor(stacks / 4) + (i < stacks % 4 ? 1 : 0) }));
  return (
    <div data-wall-anchor className="wall-ring" aria-hidden="true">
      {sides.map(({ side, count }) => (
        <span key={side} className={`wall-side wall-${side}`}>
          {Array.from({ length: Math.min(count, 18) }, (_, i) => <span key={i} className="wall-stack" />)}
        </span>
      ))}
    </div>
  );
}

export function CenterArea({ controller, progress }: { controller: GameController; progress?: ReactNode }) {
  const s = controller.getState();
  const settings = controller.getSettings();
  const pending = s.discardPending;
  const trail = controller.discardTrail;
  const positions = seatPositions(controller.humanSeat);
  const source = (seat: Seat) => Object.entries(positions).find(([, s]) => s === seat)?.[0];
  const freshId = controller.lastDiscard?.tile.id;
  const won = controller.outcome?.kind === 'hu' ? controller.outcome : null;
  return (
    <>
    <section className="center-area" aria-label="Area buangan">
      <div className="board-plane">
        <WallRing remaining={s.wall.remainingCount} />
        {(Object.entries(positions) as ['bottom' | 'right' | 'top' | 'left', Seat][]).map(([position, seat]) => {
          const wind = seatWindOf(s, seat);
          return (
            <span key={position} className={`felt-wind felt-${position}${s.currentTurn === seat ? ' is-turn' : ''}`} aria-hidden="true">
              {SEAT_SHORT[wind]} <b>{WIND_GLYPH[wind]}</b>{s.dealerSeat === seat && <small> · Dealer</small>}
            </span>
          );
        })}
        <div className={`discard-pool${trail.length === 0 && !pending ? ' is-empty' : ''}`} aria-label="Riwayat buangan">
          {trail.length === 0 && !pending && <span className="muted">Belum ada buangan.</span>}
          {trail.map((d, i) => (
            <span key={d.tile.id} className={`pool-tile seat-mark-${d.seat}${d.tile.id === freshId ? ' is-fresh' : ''}`} data-from={source(d.seat)} data-seat={d.seat} title={`${PLAYER_NAME[d.seat]} · ${tileText(d.tile)} (#${i + 1})`}>
              <TileView tile={d.tile} size="sm" highlight={d.tile.id === freshId} />
            </span>
          ))}
        </div>
      </div>
      {pending && (
        <div key={pending.tile.id} className="pending-discard" data-from={source(pending.discarder)} data-seat={pending.discarder} aria-label={`${PLAYER_NAME[pending.discarder]} ke area buangan tengah`}>
          <span>
            {pending.isPromotedKong ? 'Kakan oleh' : 'Buangan'} {PLAYER_NAME[pending.discarder]}:
          </span>
          <TileView tile={pending.tile} size="lg" highlight={freshId === pending.tile.id} />
        </div>
      )}
      {won && <p className={`hu-burst${won.scoring.isValidHu ? '' : ' is-lew-fit'}`} role="status">{won.scoring.isValidHu ? 'HU' : 'LEW FIT'}<small>{PLAYER_NAME[won.winner]}</small></p>}
    </section>
    <aside className="table-hud" aria-label="Info meja">
      <TableMotion controller={controller} />
      {progress}
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
          <Sparkles size={14} /> {settings.kimEnabled ? "Ada Kim" : "Tanpa Kim"}
        </span>
      </div>
      <details className="activity-history" open><summary>Aktivitas terbaru</summary>
      <ol className="game-log" aria-label="Log permainan" start={Math.max(1, controller.log.length - 11)}>
        {controller.log.slice(-12).map((l) => (
          <li key={l.id}>{l.text}</li>
        ))}
      </ol></details>
    </aside>
    </>
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
    <section className={`human-area${active ? ' is-active' : ''}`} data-seat-panel={seat} aria-label="Tangan Anda">
      <div className="seat-head">
        <strong>{PLAYER_NAME[seat]}</strong>
        <WindBadges seat={seat} controller={controller} />
        <span className="rack">
          <Flower2 size={12} /> <FlowerRack tiles={p.flowers} seat={seatWindOf(s, seat)} />
        </span>
      </div>
      <div data-meld-anchor={seat} className="melds">
        {p.melds.map((m, i) => (
          <MeldView key={i} meld={m} size="md" />
        ))}
      </div>
      <div data-hand-anchor={seat} className="hand-row" role="group" aria-label="Tile di tangan">
        {rest.map((t) => tileButton(t, false))}
        {drawn && <span className="drawn-gap" />}
        {drawn && tileButton(drawn, true)}
      </div>

    </section>
  );
}

interface HudButtonProps {
  label: string;
  coached?: boolean;
  enabled: boolean;
  onClick: () => void;
  tone?: 'primary' | 'gold' | 'danger' | 'call' | 'plain';
  icon?: ReactNode;
  title?: string;
  /** Tiles the call would expose, previewed beside the label */
  tiles?: readonly Tile[];
}

function HudButton({ label, enabled, onClick, tone = 'plain', icon, title, coached, tiles }: HudButtonProps) {
  return (
    <button type="button" className={`hud-btn hud-${tone}${coached ? ' is-coached' : ''}${tiles ? ' has-preview' : ''}`} disabled={!enabled} onClick={onClick} title={title}>
      <span className="hud-label">{icon}{label}</span>
      {tiles && <span className="hud-preview" aria-hidden="true">{tiles.map((t, i) => <TileView key={`${t.id}-${i}`} tile={t} size="sm" />)}</span>}
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
  const state = controller.getState();
  const player = state.players[controller.humanSeat];
  const selected = player.hand.find(t => t.id === selectedId);
  const coach = practiceCoachLine({ ...actions, selectedTileId: selectedId, selectedTileLabel: selected ? tileText(selected) : null, outcome: controller.outcome, matchComplete: controller.match ? controller.matchOver : undefined });
  const coached = (action: CoachEmphasis) => coach.emphasis === action;
  const reading = selected ? handReadingLine({ hand: player.hand.filter(t => t.id !== selected.id), winningTile: selected,
    melds: player.melds, flowers: player.flowers, seat: seatWindOf(state, controller.humanSeat), roundWind: state.roundWind,
    flags: {
      isSelfDraw: !claim,
      isRobbingKong: !!claim?.isPromotedKong,
      consecutiveKongs: state.consecutiveKongs,
      isFirstGoAround: isFirstGoAround(state),
      isInitialDealtHand: !claim && isInitialDealtHand(state, controller.humanSeat),
      isPaoChin: player.isPaoChin,
      discarderSeat: claim?.discarder,
    },
    rules: toFullRules(controller.getSettings()),
    overlapPolicy: toScoringOverlap(controller.getSettings().overlapPolicy),
    minHuTay: controller.getSettings().minHuTay }) : null;
  const huScore = claim ? claim.huScore : actions.selfHuScore;
  const canHu = claim ? claim.canHu : actions.canSelfDrawHu;
  const huTitle = huScore
    ? huScore.isValidHu
      ? `${huScore.totalTay} Tay — Hu sah`
      : `Hand lengkap, tetapi ${huScore.totalTay} Tay < minimum ${huScore.minHuTay} (Lew Fit)`
    : 'Hand belum lengkap';
  const selectedOk = !!selectedId && actions.discardableTileIds.includes(selectedId);

  return (
    <>
    <div className="action-hud" role="toolbar" aria-label="Aksi">
      {claim && (
        <div className="claim-banner">
          {claim.isPromotedKong ? 'Chiong Kong?' : 'Klaim buangan'} {PLAYER_NAME[claim.discarder]}: <TileView tile={claim.tile} size="sm" />
        </div>
      )}
      {actions.canReplaceFlowers && (
        <HudButton coached={coached('flowers')} label="Ganti Bunga" tone="gold" enabled onClick={() => controller.humanReplaceFlowers()} icon={<Flower2 size={14} />} />
      )}
      {actions.canDraw && <HudButton coached={coached('tarik')} label="Tarik" enabled={actions.canDraw} onClick={() => controller.humanDraw()} icon={<ArrowDownToLine size={14} />} title="Tarik tile dari tembok (otomatis setelah semua Lew)" />}
      {actions.canDiscard && <HudButton coached={coached('buang')}
        label="Buang"
        tone="primary"
        enabled={actions.canDiscard && selectedOk}
        onClick={() => {
          if (selectedId) controller.humanDiscard(selectedId);
          onSelect(null);
        }}
        icon={<MoveDownRight size={14} />}
      />}
      {claim?.jiaOptions.length
        ? claim.jiaOptions.map((opt, i) => (
            <HudButton
              key={i}
              coached={coached('jia')} label={`Jia ${sortTiles([...opt, claim.tile]).map((t) => t.value).join('-')}`}
              tone="call"
              tiles={sortTiles([...opt, claim.tile])}
              enabled
              onClick={() => controller.humanClaim('jia', i)}
            />
          ))
        : null}
      {claim?.canPung && <HudButton coached={coached('pung')} label="Pung" tone="call" tiles={[claim.tile, claim.tile, claim.tile]} enabled onClick={() => controller.humanClaim('pung')} />}
      {claim ? (
        claim.canKong && <HudButton coached={coached('kong')} label="Kong" tone="call" tiles={[claim.tile, claim.tile, claim.tile, claim.tile]} enabled onClick={() => controller.humanClaim('kong')} />
      ) : (
        <>
          {actions.ankongOptions.length > 0 ? (
            actions.ankongOptions.map((g, i) => (
              <HudButton key={`a${i}`} coached={coached('ankong')} label={`Ankong ${tileText(g[0]!)}`} enabled onClick={() => controller.humanAnkong(i)} />
            ))
          ) : (
            null
          )}
          {actions.kakanOptions.map((o, i) => (
            <HudButton key={`k${i}`} coached={coached('kakan')} label={`Kakan ${tileText(o.tile)}`} enabled onClick={() => controller.humanKakan(i)} />
          ))}
        </>
      )}
      {actions.canPaoChin && <HudButton coached={coached('pao-chin')} label="Pao Chin" enabled={actions.canPaoChin} onClick={() => controller.humanPaoChin()} icon={<Hand size={14} />} title="Hand langsung Cin pada pembagian pertama" />}
      {canHu && <HudButton coached={coached('hu')}
        label={huScore ? `Hu (${huScore.totalTay} Tay)` : 'Hu'}
        tone="gold"
        enabled={canHu}
        title={huTitle}
        onClick={() => (claim ? controller.humanClaim('hu') : controller.humanSelfDrawHu())}
        icon={<Trophy size={14} />}
      />}
      {claim && <HudButton coached={coached('lew')} label="Lew" tone="danger" enabled={!!claim} onClick={() => controller.humanClaim('pass')} icon={<Undo2 size={14} />} title="Lewati klaim" />}
    </div>
    <p className="practice-coach" role="status">{coach.text}</p>
    {reading && <p className="hand-reading">{reading}</p>}
    </>
  );
}
