import { TableMotion } from './TableMotion';
import { Hand, Trophy, Undo2, Flower2, ArrowDownToLine, MoveDownRight, Crown } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { sortTiles } from '../../core/tiles';
import type { Seat, Tile } from '../../core/types';
import { isKim } from '../../kim/wildcard-solver';
import { loadAutoArrange, saveAutoArrange } from '../../storage';
import type { GameController, HumanActions } from '../game-controller';
import { PLAYER_NAME, SEAT_LABEL, SEAT_SHORT, WIND_GLYPH, tileText } from '../labels';
import { practiceCoachLine, type CoachEmphasis } from '../practice-coach';
import { handReadingLine } from '../hand-reading';
import { applyHandOrder, isNewHand, mergeHandOrder, moveInOrder } from '../hand-order';
import { isFirstGoAround, isInitialDealtHand, seatWindOf, toFullRules, toScoringOverlap } from '../win-context';
import { SeatCallouts } from './CallToast';
import { MeldView, TileBack, TileRow, TileView } from './TileView';

/** Display name per seat; single player uses PLAYER_NAME, online tables pass the room's nicknames. */
export type SeatNames = Record<Seat, string>;

/** Screen position of each seat relative to the human at the bottom (turn order runs counter-clockwise). */
export function seatPositions(human: Seat): Record<'bottom' | 'right' | 'top' | 'left', Seat> {
  const order: Seat[] = ['dong', 'nan', 'xi', 'bei'];
  const i = order.indexOf(human);
  return { bottom: human, right: order[(i + 1) % 4]!, top: order[(i + 2) % 4]!, left: order[(i + 3) % 4]! };
}

/** Online tables only: "Offline" / "AFK" next to a human seat (the controller opts in with `presence`). */
const presenceOf = (controller: GameController, seat: Seat) => (controller as { presence?: (seat: Seat) => string | null }).presence?.(seat) ?? null;

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
      {presenceOf(controller, seat) && <span className="badge badge-presence">{presenceOf(controller, seat)}</span>}
    </span>
  );
}

/** `seat` is the seat wind this hand: own Bunga / Musim number 1–4 = Timur–Utara. */
function FlowerRack({ tiles, seat }: { tiles: readonly Tile[]; seat: Seat }) {
  if (!tiles.length) return <span className="rack-empty">Belum ada Bunga / Musim</span>;
  const ownNumber = ['dong', 'nan', 'xi', 'bei'].indexOf(seat) + 1;
  return <span className="bonus-rack" title={`Nomor sendiri: ${ownNumber}`}><TileRow tiles={tiles} size="sm" /><small>Nomor sendiri: {ownNumber}</small></span>;
}

/** Wind names painted on the discard frame's edges. */
const FRAME_WIND: Record<Seat, [glyph: string, name: string]> = { dong: ['东', 'Dōng - EAST'], nan: ['南', 'Nán - SOUTH'], xi: ['西', 'Xī - WEST'], bei: ['北', 'Běi - NORTH'] };

/** Revealed sets, then bunga / musim: one row (a column for the side seats) between a hand and the pool. */
function SeatSets({ seat, controller, size, head }: { seat: Seat; controller: GameController; size?: 'md'; head?: ReactNode }) {
  const s = controller.getState();
  const p = s.players[seat];
  return (
    <div className="seat-sets">
      {head}
      <div data-meld-anchor={seat} className="melds">
        {p.melds.map((m, i) => (
          <MeldView key={i} meld={m} size={size} owner={seat} />
        ))}
      </div>
      <span className="rack">
        <FlowerRack tiles={p.flowers} seat={seatWindOf(s, seat)} />
      </span>
    </div>
  );
}

/** `reveal` (developer mode, display only) shows the concealed tiles face-up. */
export function OpponentPanel({ seat, position, controller, reveal, names = PLAYER_NAME }: { seat: Seat; position: string; controller: GameController; reveal?: boolean; names?: SeatNames }) {
  const s = controller.getState();
  const p = s.players[seat];
  const active = s.currentTurn === seat && (s.phase === 'ACTION_DECISION' || s.phase === 'TURN_DRAW');
  const kimInMelds = p.melds.flatMap((m) => m.tiles).filter(isKim).length;
  return (
    <section className={`seat-panel seat-${position}${active ? ' is-active' : ''}`} aria-label={`${names[seat]} — ${SEAT_LABEL[seatWindOf(s, seat)]}`}>
      <div className="seat-head">
        <strong>{names[seat]}</strong>
        <WindBadges seat={seat} controller={controller} />
        {kimInMelds > 0 && <span className="badge badge-kim">KIM ×{kimInMelds}</span>}
      </div>
      <div data-hand-anchor={seat} className={`concealed${reveal ? ' is-revealed' : ''}`} title={`${p.hand.length} tile tertutup`}>
        {reveal ? sortTiles(p.hand).map((t) => <TileView key={t.id} tile={t} size="sm" />) : p.hand.map((t) => (
          <TileBack key={t.id} size="sm" />
        ))}
        <span className="count">{p.hand.length}</span>
      </div>
      <SeatSets seat={seat} controller={controller} />
    </section>
  );
}

/** A pool tile is this many times taller than wide (`--h` in the pool rules of index.css). */
const POOL_TILE_RATIO = 1.34;
/** The last row's seat mark hangs this far below its tile. */
const POOL_MARK_PAD = 3;

export interface PoolFitInput {
  /** Pool content box, px */
  width: number;
  height: number;
  count: number;
  /** Gap between tiles in a row / between rows, px */
  gap: number;
  rowGap: number;
  /** The stylesheet's `--pool-cols` for this layout: the size a tile has when the pool is not crowded */
  baseCols: number;
  /** Below this width a tile is only used when nothing larger fits, px */
  minTile?: number;
}

export interface PoolFit {
  cols: number;
  /** Multiplies the width `cols` gives a tile; 1 unless a few discards would otherwise grow past the cap */
  scale: number;
  /** Tile width and row gap that result, px */
  tile: number;
  rowGap: number;
}

/**
 * Column count and scale for the discard pool: the widest tiles that still hold every discard in the
 * frame. A tall frame gets fewer columns and more rows, a wide one more columns; a handful of
 * discards never grow past a cap, so tiles only shrink as the pool fills. The row gap tightens
 * only when tiles would otherwise fall below `minTile`.
 */
export function fitDiscardPool({ width, height, count, gap, rowGap, baseCols, minTile = 22 }: PoolFitInput): PoolFit {
  const widthAt = (cols: number) => (width - 1 - (cols - 1) * gap) / cols;
  const base = Math.max(1, baseCols);
  const fallback: PoolFit = { cols: base, scale: 1, tile: Math.max(0, widthAt(base)), rowGap };
  if (width <= 0 || height <= 0 || count <= 0) return fallback;
  const baseTile = Math.max(0, widthAt(base));
  const cap = Math.max(baseTile, Math.min(38, baseTile * 1.25));
  const best = (rg: number): PoolFit | null => {
    let found: PoolFit | null = null;
    // Per row count: the tallest tiles the height allows, held back by the width a full row needs and by the cap.
    for (let rows = 1; rows <= count; rows++) {
      const tile = Math.min(cap, (height - POOL_MARK_PAD - (rows - 1) * rg) / (rows * POOL_TILE_RATIO), widthAt(Math.ceil(count / rows)));
      if (tile < 2 || (found && tile <= found.tile)) continue;
      // Columns are what a row of this tile width holds (never fewer than the discards need); scale trims the stylesheet's width to it.
      const cols = Math.max(1, Math.floor((width - 1 + gap) / (tile + gap)));
      found = { cols, scale: tile / widthAt(cols), tile, rowGap: rg };
    }
    return found;
  };
  const roomy = best(rowGap);
  if (roomy && roomy.tile >= minTile) return roomy;
  const tight = best(Math.min(rowGap, POOL_MARK_PAD + 1));
  const pick = tight && (!roomy || tight.tile > roomy.tile) ? tight : roomy;
  if (pick) return pick;
  // Not even 2px tiles hold this many discards: keep the stylesheet's size and let the last rows clip.
  return fallback;
}

/** Reads a computed px length (`row-gap` can be "normal" before layout), falling back to `or`. */
const px = (value: string, or: number) => (Number.isFinite(parseFloat(value)) ? parseFloat(value) : or);

export function CenterArea({ controller, progress, names = PLAYER_NAME }: { controller: GameController; progress?: ReactNode; names?: SeatNames }) {
  const s = controller.getState();
  const pending = s.discardPending;
  const trail = controller.discardTrail;
  const positions = seatPositions(controller.humanSeat);
  const source = (seat: Seat) => Object.entries(positions).find(([, s]) => s === seat)?.[0];
  // Latest discard stays marked: the claimable one, else the last committed one.
  const freshId = pending?.tile.id ?? controller.lastDiscard?.tile.id ?? trail[trail.length - 1]?.tile.id;
  const won = controller.outcome?.kind === 'hu' ? controller.outcome : null;
  // Drawable tiles: excludes the optional 14-tile dead wall.
  const left = controller.remainingDrawable;
  const poolRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const pool = poolRef.current;
    if (!pool) return;
    // Columns and scale come from the frame's real width and height (fitDiscardPool), so tiles stay as large as every discard allows.
    const fit = () => {
      pool.style.removeProperty('--pool-cols');
      pool.style.removeProperty('row-gap');
      pool.style.setProperty('--pool-scale', '1');
      const css = getComputedStyle(pool);
      const result = fitDiscardPool({
        width: pool.clientWidth,
        height: pool.clientHeight,
        count: pool.querySelectorAll('.pool-tile').length,
        gap: px(css.columnGap, 3),
        rowGap: px(css.rowGap, 8),
        baseCols: Number(css.getPropertyValue('--pool-cols')) || 17,
      });
      pool.style.setProperty('--pool-cols', String(result.cols));
      pool.style.setProperty('--pool-scale', String(Math.round(result.scale * 1000) / 1000));
      pool.style.setProperty('row-gap', `${result.rowGap}px`);
      // Rounding or an odd frame can still leave a row over: shrink in small steps as a last resort.
      let scale = result.scale;
      while (scale > 0.3 && pool.scrollHeight > pool.clientHeight + 1) {
        scale = Math.round((scale - 0.03) * 1000) / 1000;
        pool.style.setProperty('--pool-scale', String(scale));
      }
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(pool);
    return () => observer.disconnect();
  }, [trail.length]);
  return (
    <>
    <section className="center-area" aria-label="Area buangan">
      <div className="board-plane">
        <div className="pool-frame">
          {/* No wall on the felt: this tab is also where a draw's tile flies from. */}
          <p data-wall-anchor="" className={`wall-counter${left <= 20 ? ' is-low' : ''}`} aria-label={`Sisa ${left} tile di tembok`}>
            SISA: <b>{left}</b> TILE
          </p>
          {(Object.entries(positions) as ['bottom' | 'right' | 'top' | 'left', Seat][]).map(([position, seat]) => {
            const wind = seatWindOf(s, seat);
            return (
              <span key={position} className={`felt-wind felt-${position}${s.currentTurn === seat ? ' is-turn' : ''}`} aria-hidden="true">
                <b>{FRAME_WIND[wind][0]}</b> {FRAME_WIND[wind][1]}{s.dealerSeat === seat && <small> · Dealer</small>}
              </span>
            );
          })}
          <div ref={poolRef} className={`discard-pool${trail.length === 0 && !pending ? ' is-empty' : ''}`} aria-label="Riwayat buangan">
            {trail.length === 0 && !pending && <span className="muted">Belum ada buangan.</span>}
            {trail.map((d, i) => (
              <span key={d.tile.id} className={`pool-tile seat-mark-${d.seat}${d.tile.id === freshId ? ' is-fresh' : ''}`} data-from={source(d.seat)} data-seat={d.seat} title={`${names[d.seat]} · ${tileText(d.tile)} (#${i + 1})`}>
                <TileView tile={d.tile} size="sm" highlight={d.tile.id === freshId} />
              </span>
            ))}
          </div>
        </div>
      </div>
      {pending && (
        <div key={pending.tile.id} className="pending-discard" data-pending-discard="" data-from={source(pending.discarder)} data-seat={pending.discarder} aria-label={`${names[pending.discarder]} ke area buangan tengah`}>
          <span>
            {pending.isPromotedKong ? 'Kong oleh' : 'Buangan'} {names[pending.discarder]}:
          </span>
          <TileView tile={pending.tile} size="lg" highlight />
        </div>
      )}
      <SeatCallouts controller={controller} positions={positions} />
      {won && <p className={`hu-burst${won.scoring.isValidHu ? '' : ' is-lew-fit'}`} role="status">{won.scoring.isValidHu ? 'HU' : 'LEW FIT'}<small>{names[won.winner]}</small></p>}
    </section>
    <aside className="table-hud" aria-label="Info meja">
      {progress ?? <TableMotion controller={controller} />}
    </aside>
    </>
  );
}

interface HumanAreaProps {
  controller: GameController;
  actions: HumanActions;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Coach line shown just above the hand (see PracticeCoach) */
  coach?: ReactNode;
  /** Action pills (see ActionHud): they float just above this seat, on the felt's near edge */
  hud?: ReactNode;
  names?: SeatNames;
  /** Spectators: the bottom seat shows tile backs and cannot pick tiles. */
  facedown?: boolean;
}

export function HumanArea({ controller, actions, selectedId, onSelect, coach, hud, names = PLAYER_NAME, facedown }: HumanAreaProps) {
  const s = controller.getState();
  const seat = controller.humanSeat;
  const p = s.players[seat];
  const drawnId = controller.humanDrawnTileId;
  const drawn = p.hand.find((t) => t.id === drawnId);
  const restTiles = p.hand.filter((t) => t.id !== drawnId);
  const sortedRest = sortTiles(restTiles);
  const discardable = new Set(actions.discardableTileIds);
  const active = s.currentTurn === seat && s.phase === 'ACTION_DECISION';

  // "Susun otomatis": on = sorted; off = the player's own order (display only, by tile id).
  const [auto, setAuto] = useState(() => loadAutoArrange());
  const [, redraw] = useState(0);
  const [dragId, setDragId] = useState<string | null>(null);
  const orderRef = useRef<string[]>([]);
  const rowRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; x: number; y: number; grab: number; pointer: number; moving: boolean } | null>(null);
  const clickBlocked = useRef(false);
  const stopDrag = useRef<(() => void) | null>(null);
  const handSeen = useRef({ key: -1, trail: 0 });
  // Tile ids repeat from hand to hand, so a new hand (next match hand, or the pool emptying) restarts sorted.
  const handKey = controller.match?.hands.length ?? 0;
  const trailLen = controller.discardTrail.length;
  if (isNewHand(handSeen.current, { key: handKey, trail: trailLen })) orderRef.current = [];
  handSeen.current = { key: handKey, trail: trailLen };
  orderRef.current = auto ? sortedRest.map((t) => t.id) : mergeHandOrder(orderRef.current, restTiles);
  const rest = auto ? sortedRest : applyHandOrder(orderRef.current, restTiles);
  const canArrange = !facedown && !auto;

  const toggleAuto = () => {
    const next = !auto;
    setAuto(next);
    saveAutoArrange(next);
  };

  /** The dragged tile follows the pointer on top of its (live reordered) slot. */
  const placeDragged = () => {
    const d = dragRef.current;
    const el = d && rowRef.current?.querySelector<HTMLElement>(`[data-tile-id="${d.id}"]`);
    if (!d || !el) return;
    el.style.transform = '';
    const left = el.getBoundingClientRect().left;
    el.style.transform = `translate(${d.x - d.grab - left}px, -14px)`;
  };
  useLayoutEffect(placeDragged);
  useEffect(() => () => stopDrag.current?.(), []);

  const startDrag = (id: string) => (e: PointerEvent<HTMLButtonElement>) => {
    if (!canArrange || e.button !== 0 || dragRef.current) return;
    const grab = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const d0 = { id, x: e.clientX, y: e.clientY, grab, pointer: e.pointerId, moving: false };
    dragRef.current = d0;
    const start = { x: e.clientX, y: e.clientY };
    const row = rowRef.current;
    try { row?.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    const move = (ev: globalThis.PointerEvent) => {
      const d = dragRef.current;
      if (!d || ev.pointerId !== d.pointer) return;
      d.x = ev.clientX;
      if (!d.moving) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
        d.moving = true;
        setDragId(id);
      }
      const others = [...(rowRef.current?.querySelectorAll<HTMLElement>('.tile:not(.is-drawn)') ?? [])].filter((el) => el.dataset.tileId !== id);
      const slot = others.filter((el) => { const r = el.getBoundingClientRect(); return r.left + r.width / 2 < ev.clientX; }).length;
      const order = orderRef.current;
      if (order.indexOf(id) !== slot) {
        orderRef.current = moveInOrder(order, id, slot);
        redraw((n) => n + 1);
      }
      placeDragged();
    };
    const end = (ev?: globalThis.PointerEvent) => {
      if (ev && dragRef.current && ev.pointerId !== dragRef.current.pointer) return;
      const moved = dragRef.current?.moving;
      const el = rowRef.current?.querySelector<HTMLElement>(`[data-tile-id="${id}"]`);
      if (el) el.style.transform = '';
      dragRef.current = null;
      stopDrag.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      row?.removeEventListener('lostpointercapture', end);
      try { row?.releasePointerCapture(ev?.pointerId ?? d0.pointer); } catch { /* already released */ }
      if (moved) {
        clickBlocked.current = true;
        setTimeout(() => { clickBlocked.current = false; }, 60);
        setDragId(null);
      }
    };
    stopDrag.current = end;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    row?.addEventListener('lostpointercapture', end);
  };

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
        dragging={dragId === t.id}
        onPointerDown={isDrawn ? undefined : startDrag(t.id)}
        onClick={() => {
          if (clickBlocked.current || !canPick) return;
          if (selectedId === t.id) controller.humanDiscard(t.id);
          else onSelect(t.id);
        }}
        onDoubleClick={() => !clickBlocked.current && canPick && controller.humanDiscard(t.id)}
      />
    );
  };

  return (
    <section className={`human-area${active ? ' is-active' : ''}`} data-seat-panel={seat} aria-label="Tangan kamu">
      {hud}
      {coach && <div className="coach-slot">{coach}</div>}
      <SeatSets seat={seat} controller={controller} size="md" head={
        <div className="seat-head">
          <strong>{names[seat]}</strong>
          <WindBadges seat={seat} controller={controller} />
          {!facedown && (
            <button type="button" className={`arrange-toggle${auto ? ' is-on' : ''}`} aria-pressed={auto} onClick={toggleAuto} title="Tile diurutkan otomatis; matikan buat geser tile manual">
              Susun otomatis: {auto ? 'ON' : 'OFF'}
            </button>
          )}
        </div>
      } />
      <div ref={rowRef} data-hand-anchor={seat} className={`hand-row${canArrange ? ' is-manual' : ''}`} role="group" aria-label="Tile di tangan">
        {facedown ? p.hand.map((t) => <TileBack key={t.id} size="lg" />) : rest.map((t) => tileButton(t, false))}
        {!facedown && drawn && <span className="drawn-gap" />}
        {!facedown && drawn && tileButton(drawn, true)}
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

interface CoachProps {
  controller: GameController;
  actions: HumanActions;
  selectedId: string | null;
}

function coachFor({ controller, actions, selectedId }: CoachProps) {
  const player = controller.getState().players[controller.humanSeat];
  const selected = player.hand.find(t => t.id === selectedId);
  return practiceCoachLine({ ...actions, selectedTileId: selectedId, selectedTileLabel: selected ? tileText(selected) : null, outcome: controller.outcome, matchComplete: controller.match ? controller.matchOver : undefined });
}

/** The coach line and, with a tile picked, what that tile would read as: shown just above the hand. */
export function PracticeCoach({ controller, actions, selectedId }: CoachProps) {
  const claim = actions.claim;
  const state = controller.getState();
  const player = state.players[controller.humanSeat];
  const selected = player.hand.find(t => t.id === selectedId);
  const coach = coachFor({ controller, actions, selectedId });
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
  return (
    <>
      <p className="practice-coach" role="status">{coach.text}</p>
      {reading && <p className="hand-reading">{reading}</p>}
    </>
  );
}

export function ActionHud({
  controller,
  actions,
  selectedId,
  onSelect,
  names = PLAYER_NAME,
}: {
  controller: GameController;
  actions: HumanActions;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  names?: SeatNames;
}) {
  const claim = actions.claim;
  const coach = coachFor({ controller, actions, selectedId });
  const coached = (action: CoachEmphasis) => coach.emphasis === action;
  const huScore = claim ? claim.huScore : actions.selfHuScore;
  const canHu = claim ? claim.canHu : actions.canSelfDrawHu;
  const huTitle = huScore
    ? huScore.isValidHu
      ? `${huScore.totalTay} Tay — Hu sah`
      : `Hand lengkap, tapi ${huScore.totalTay} Tay < minimum ${huScore.minHuTay} (Lew Fit)`
    : 'Hand belum lengkap';
  const selectedOk = !!selectedId && actions.discardableTileIds.includes(selectedId);

  return (
    <div className="action-hud" role="toolbar" aria-label="Aksi">
      {claim && (
        <div className="claim-banner">
          {claim.isPromotedKong ? 'Chiong Kong?' : 'Klaim buangan'} {names[claim.discarder]}: <TileView tile={claim.tile} size="sm" />
        </div>
      )}
      {actions.canReplaceFlowers && (
        <HudButton coached={coached('flowers')} label="Ganti Bunga" tone="gold" enabled onClick={() => controller.humanReplaceFlowers()} icon={<Flower2 size={14} />} />
      )}
      {actions.canDraw && <HudButton coached={coached('tarik')} label="Tarik" enabled={actions.canDraw} onClick={() => controller.humanDraw()} icon={<ArrowDownToLine size={14} />} title="Tarik tile dari tembok (jalan sendiri setelah semua Lew)" />}
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
              <HudButton key={`a${i}`} coached={coached('ankong')} label={`Kong ${tileText(g[0]!)}`} enabled onClick={() => controller.humanAnkong(i)} />
            ))
          ) : (
            null
          )}
          {actions.kakanOptions.map((o, i) => (
            <HudButton key={`k${i}`} coached={coached('kakan')} label={`Kong ${tileText(o.tile)}`} enabled onClick={() => controller.humanKakan(i)} />
          ))}
        </>
      )}
      {actions.canPaoChin && <HudButton coached={coached('pao-chin')} label="Pao Chin" enabled={actions.canPaoChin} onClick={() => controller.humanPaoChin()} icon={<Hand size={14} />} title="Hand langsung Cin di pembagian pertama" />}
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
  );
}
