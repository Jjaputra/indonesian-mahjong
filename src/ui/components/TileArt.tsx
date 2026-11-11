import type { ReactNode } from 'react';
import type { Tile } from '../../core/types';
import { WIND_CUE, getTileFace, type TileFace } from '../labels';

/**
 * Original, code-drawn tile faces. Every face is a 60×80 SVG on an ivory tile so it scales to all
 * three tile sizes; nothing here is traced or copied from a printed set.
 */

const INK = {
  black: '#1d2530',
  blue: '#1f4e9c',
  green: '#1d7a47',
  red: '#c0392b',
  kim: '#5b3a8c',
  ivory: '#fffdf6',
} as const;

const CN_NUMERAL = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
/** Bonus ink per family, following tiles rev2.pdf p. 2: Musim red, Bunga blue/black. */
export const BONUS_INK = { season: INK.red, flower: INK.blue } as const;

type Pt = readonly [number, number];
type Ink = keyof typeof INK;

// ---------- Dots (Tong) ----------

/** Dot layouts as [x, y, colour]; radius per count keeps every dot separately countable. */
const DOT_LAYOUT: Record<number, { r: number; dots: readonly (readonly [number, number, Ink])[] }> = {
  2: { r: 11, dots: [[30, 21, 'green'], [30, 59, 'blue']] },
  3: { r: 9, dots: [[15, 16, 'blue'], [30, 40, 'red'], [45, 64, 'green']] },
  4: { r: 10, dots: [[18, 22, 'blue'], [42, 22, 'green'], [18, 58, 'green'], [42, 58, 'blue']] },
  5: { r: 9, dots: [[16, 18, 'blue'], [44, 18, 'green'], [30, 40, 'red'], [16, 62, 'green'], [44, 62, 'blue']] },
  6: { r: 8.5, dots: [[19, 15, 'green'], [41, 15, 'green'], [19, 43, 'red'], [41, 43, 'red'], [19, 65, 'red'], [41, 65, 'red']] },
  7: {
    r: 7,
    dots: [[14, 11, 'green'], [30, 19, 'green'], [46, 27, 'green'], [19, 48, 'red'], [41, 48, 'red'], [19, 67, 'red'], [41, 67, 'red']],
  },
  8: {
    r: 7.6,
    dots: [[19, 12, 'blue'], [41, 12, 'blue'], [19, 31, 'blue'], [41, 31, 'blue'], [19, 49, 'blue'], [41, 49, 'blue'], [19, 68, 'blue'], [41, 68, 'blue']],
  },
  9: {
    r: 7,
    dots: [[15, 17, 'blue'], [30, 17, 'blue'], [45, 17, 'blue'], [15, 40, 'red'], [30, 40, 'red'], [45, 40, 'red'], [15, 63, 'green'], [30, 63, 'green'], [45, 63, 'green']],
  },
};

function Dot({ x, y, r, ink }: { x: number; y: number; r: number; ink: Ink }) {
  return (
    <g className="art-dot">
      <circle cx={x} cy={y} r={r} fill={INK[ink]} />
      <circle cx={x} cy={y} r={r * 0.58} fill={INK.ivory} />
      <circle cx={x} cy={y} r={r * 0.3} fill={INK[ink]} />
    </g>
  );
}

function DotsFace({ value }: { value: number }) {
  if (value === 1) {
    return (
      <g className="art-dot">
        <circle cx={30} cy={40} r={19} fill={INK.green} />
        <circle cx={30} cy={40} r={15} fill={INK.ivory} />
        <circle cx={30} cy={40} r={12} fill={INK.blue} />
        <circle cx={30} cy={40} r={8} fill={INK.ivory} />
        <circle cx={30} cy={40} r={5} fill={INK.red} />
      </g>
    );
  }
  const layout = DOT_LAYOUT[value];
  if (!layout) return null;
  return (
    <>
      {layout.dots.map(([x, y, ink], i) => (
        <Dot key={i} x={x} y={y} r={layout.r} ink={ink} />
      ))}
    </>
  );
}

// ---------- Bamboo (Sok) ----------

/** Stick centres as [x, y, colour]; `h` is the stick height for that count. */
const STICK_LAYOUT: Record<number, { h: number; sticks: readonly (readonly [number, number, Ink])[] }> = {
  2: { h: 30, sticks: [[30, 22, 'green'], [30, 58, 'green']] },
  3: { h: 30, sticks: [[30, 22, 'green'], [19, 58, 'green'], [41, 58, 'green']] },
  4: { h: 30, sticks: [[19, 22, 'green'], [41, 22, 'blue'], [19, 58, 'blue'], [41, 58, 'green']] },
  5: { h: 28, sticks: [[15, 21, 'green'], [45, 21, 'blue'], [30, 40, 'red'], [15, 59, 'blue'], [45, 59, 'green']] },
  6: { h: 30, sticks: [[15, 22, 'green'], [30, 22, 'green'], [45, 22, 'green'], [15, 58, 'blue'], [30, 58, 'blue'], [45, 58, 'blue']] },
  7: {
    h: 22,
    sticks: [[30, 15, 'red'], [15, 40, 'green'], [30, 40, 'green'], [45, 40, 'green'], [15, 65, 'green'], [30, 65, 'green'], [45, 65, 'green']],
  },
  8: {
    h: 30,
    sticks: [[12, 22, 'green'], [24, 22, 'green'], [36, 22, 'green'], [48, 22, 'green'], [12, 58, 'green'], [24, 58, 'green'], [36, 58, 'green'], [48, 58, 'green']],
  },
  9: {
    h: 21,
    sticks: [[15, 16, 'green'], [30, 16, 'red'], [45, 16, 'blue'], [15, 40, 'green'], [30, 40, 'red'], [45, 40, 'blue'], [15, 64, 'green'], [30, 64, 'red'], [45, 64, 'blue']],
  },
};

function Stick({ x, y, h, ink }: { x: number; y: number; h: number; ink: Ink }) {
  const top = y - h / 2;
  return (
    <g className="art-stick">
      <rect x={x - 3.6} y={top} width={7.2} height={h} rx={3.6} fill={INK[ink]} />
      <line x1={x - 3.6} x2={x + 3.6} y1={y} y2={y} stroke={INK.ivory} strokeWidth={1.3} />
      <line x1={x} x2={x} y1={top + 3} y2={y - 2.5} stroke={INK.ivory} strokeWidth={1} opacity={0.7} />
      <line x1={x} x2={x} y1={y + 2.5} y2={top + h - 3} stroke={INK.ivory} strokeWidth={1} opacity={0.7} />
    </g>
  );
}

/** 1 Sok: a perched bird drawn from simple shapes, as on most printed sets. */
function BambooBird() {
  return (
    <g className="art-bird">
      <rect x={10} y={66} width={40} height={5} rx={2.5} fill={INK.green} />
      <ellipse cx={15} cy={55} rx={11} ry={4} transform="rotate(38 15 55)" fill={INK.red} />
      <ellipse cx={19} cy={58} rx={10} ry={3.6} transform="rotate(62 19 58)" fill={INK.blue} />
      <ellipse cx={33} cy={45} rx={14} ry={10} fill={INK.green} />
      <ellipse cx={30} cy={45} rx={8.5} ry={5} transform="rotate(-18 30 45)" fill="#145a34" />
      <ellipse cx={40} cy={34} rx={6} ry={8} fill={INK.green} />
      <circle cx={43} cy={25} r={7} fill={INK.blue} />
      <path d="M40 18 L43 11 L46 18 Z" fill={INK.red} />
      <path d="M49 23 L56 26 L49 28 Z" fill="#d98b1a" />
      <circle cx={45} cy={23.5} r={1.7} fill={INK.ivory} />
      <circle cx={45.3} cy={23.5} r={0.9} fill={INK.black} />
      <path d="M31 54 L30 66 M37 54 L38 66" stroke="#d98b1a" strokeWidth={1.8} strokeLinecap="round" />
    </g>
  );
}

function BambooFace({ value }: { value: number }) {
  if (value === 1) return <BambooBird />;
  const layout = STICK_LAYOUT[value];
  if (!layout) return null;
  return (
    <>
      {layout.sticks.map(([x, y, ink], i) => (
        <Stick key={i} x={x} y={y} h={layout.h} ink={ink} />
      ))}
    </>
  );
}

// ---------- Characters (Ban), honours, bonus and Kim ----------

function Glyph({ x = 30, y, size, fill, children, className = 'art-glyph' }: { x?: number; y: number; size: number; fill: string; children: ReactNode; className?: string }) {
  return (
    <text className={className} x={x} y={y} fontSize={size} fill={fill} textAnchor="middle" dominantBaseline="central">
      {children}
    </text>
  );
}

/** Corner index that stays readable on the smallest tiles. */
function CornerIndex({ label, fill, size = 17 }: { label: string; fill: string; size?: number }) {
  return (
    <text className="art-index" x={4} y={4} fontSize={size} fill={fill} dominantBaseline="hanging" stroke={INK.ivory} strokeWidth={2.4} paintOrder="stroke">
      {label}
    </text>
  );
}

function BanFace({ value }: { value: number }) {
  return (
    <>
      <CornerIndex label={String(value)} fill={INK.blue} />
      <Glyph y={27} size={25} fill={INK.black}>
        {CN_NUMERAL[value] ?? value}
      </Glyph>
      <Glyph y={59} size={27} fill={INK.red}>
        萬
      </Glyph>
    </>
  );
}

function WindFace({ face, value }: { face: TileFace; value: number }) {
  const cue = WIND_CUE[value];
  return (
    <>
      <rect x={2} y={2} width={21} height={22} rx={4} fill="#e3ecf6" />
      <text className="art-index" x={12.5} y={13.5} fontSize={17} fill={INK.blue} textAnchor="middle" dominantBaseline="central">
        {cue?.letter ?? '?'}
      </text>
      <Glyph y={48} size={34} fill={INK.black}>
        {face.main}
      </Glyph>
      <text className="art-detail" x={30} y={74} fontSize={8} fill={INK.blue} textAnchor="middle">
        {cue?.word}
      </text>
    </>
  );
}

function DragonFace({ value }: { value: number }) {
  if (value === 1) {
    return (
      <Glyph y={41} size={42} fill={INK.red}>
        中
      </Glyph>
    );
  }
  if (value === 2) {
    return (
      <Glyph y={41} size={36} fill={INK.green}>
        發
      </Glyph>
    );
  }
  return (
    <g className="art-white-frame">
      <rect x={10} y={12} width={40} height={56} rx={5} fill="none" stroke={INK.blue} strokeWidth={3.2} />
      <rect x={16} y={18} width={28} height={44} rx={3} fill="none" stroke={INK.blue} strokeWidth={1.4} />
    </g>
  );
}

// Original sprigs, one per bonus tile, so the four Bunga and four Musim are told apart by picture as well
// as by number. Only the numeral and glyph carry the family ink; petals are free decoration.

const LEAF = INK.green;
const STEM = '#7a4b24';

function Petals({ cx, cy, r, n, fill, len = 1.7 }: { cx: number; cy: number; r: number; n: number; fill: string; len?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <ellipse key={i} cx={cx} cy={cy - r * len * 0.55} rx={r * 0.55} ry={r * len * 0.55} transform={`rotate(${(360 / n) * i} ${cx} ${cy})`} fill={fill} />
      ))}
    </>
  );
}

/** Bunga 1 梅 plum: blossoms on a dark branch. */
function PlumSprig() {
  return (
    <>
      <path d="M14 76 L26 58 L36 48 M26 58 L42 62 M36 48 L44 36" stroke="#3b2a4a" strokeWidth={2.4} fill="none" strokeLinecap="round" />
      {([[34, 40, 4.4], [44, 52, 4], [22, 54, 3.8], [40, 66, 3.4]] as const).map(([x, y, r]) => (
        <g key={`${x}-${y}`}>
          <Petals cx={x} cy={y} r={r} n={5} fill="#d2453a" len={1.2} />
          <circle cx={x} cy={y} r={r * 0.4} fill="#f2c94c" />
        </g>
      ))}
    </>
  );
}

/** Bunga 2 蘭 orchid: arching leaves and small magenta blooms. */
function OrchidSprig() {
  return (
    <>
      <path d="M30 78 Q20 56 10 50 M30 78 Q34 54 48 44 M30 78 Q30 60 26 40" stroke={LEAF} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      {([[16, 46], [26, 36], [44, 40], [38, 54]] as const).map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <Petals cx={x} cy={y} r={3.4} n={5} fill="#b03a7a" len={1.3} />
          <circle cx={x} cy={y} r={1.3} fill={INK.ivory} />
        </g>
      ))}
    </>
  );
}

/** Bunga 3 竹 bamboo: two jointed stalks with leaves. */
function BambooSprig() {
  return (
    <>
      {([[24, 34], [36, 42]] as const).map(([x, top]) => (
        <g key={x}>
          <rect x={x - 2.6} y={top} width={5.2} height={78 - top} rx={2} fill={LEAF} />
          {[top + 12, top + 24].map((y) => (
            <line key={y} x1={x - 3} x2={x + 3} y1={y} y2={y} stroke={INK.ivory} strokeWidth={1.2} />
          ))}
        </g>
      ))}
      {([[16, 42, -35], [32, 36, 30], [44, 50, 25], [14, 58, -25], [46, 62, 20]] as const).map(([x, y, deg]) => (
        <ellipse key={`${x}-${y}`} cx={x} cy={y} rx={7} ry={1.9} transform={`rotate(${deg} ${x} ${y})`} fill="#2f8f57" />
      ))}
    </>
  );
}

/** Bunga 4 菊 chrysanthemum: a dense orange head over leaves. */
function ChrysanthemumSprig() {
  return (
    <>
      <path d="M30 78 Q28 64 32 52" stroke={LEAF} strokeWidth={2} fill="none" strokeLinecap="round" />
      <ellipse cx={22} cy={66} rx={6.5} ry={2.8} transform="rotate(-30 22 66)" fill={LEAF} />
      <ellipse cx={39} cy={70} rx={6} ry={2.6} transform="rotate(28 39 70)" fill={LEAF} />
      <Petals cx={32} cy={44} r={4.2} n={14} fill="#e0892b" len={2.2} />
      <circle cx={32} cy={44} r={3.6} fill="#c8621c" />
    </>
  );
}

/** Musim 1 春 spring: tulip buds. */
function SpringSprig() {
  return (
    <>
      <path d="M30 78 Q24 60 18 46 M30 78 Q30 58 32 40 M30 78 Q38 62 44 52" stroke={LEAF} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <ellipse cx={20} cy={70} rx={8} ry={2.4} transform="rotate(-40 20 70)" fill={LEAF} />
      <ellipse cx={40} cy={70} rx={8} ry={2.4} transform="rotate(40 40 70)" fill={LEAF} />
      {([[18, 42, '#e0892b'], [32, 36, '#d2453a'], [45, 48, '#3d6fb8']] as const).map(([x, y, fill]) => (
        <path key={x} d={`M${x - 4.5} ${y + 3} Q${x - 5} ${y - 6} ${x - 2} ${y - 5} L${x} ${y - 1} L${x + 2} ${y - 5} Q${x + 5} ${y - 6} ${x + 4.5} ${y + 3} Z`} fill={fill} />
      ))}
    </>
  );
}

/** Musim 2 夏 summer: red poppies. */
function SummerSprig() {
  return (
    <>
      <path d="M30 78 Q20 62 18 46 M30 78 Q32 60 40 44 M30 78 Q30 66 30 58" stroke={LEAF} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      {([[18, 44, 6.5], [40, 42, 6], [30, 56, 5]] as const).map(([x, y, r]) => (
        <g key={x}>
          <circle cx={x} cy={y} r={r} fill="#d2453a" />
          <circle cx={x} cy={y} r={r * 0.35} fill="#2b2b2b" />
        </g>
      ))}
    </>
  );
}

/** Musim 3 秋 autumn: a sunflower. */
function AutumnSprig() {
  return (
    <>
      <path d="M30 78 Q30 66 30 54" stroke={LEAF} strokeWidth={2} fill="none" strokeLinecap="round" />
      <ellipse cx={22} cy={68} rx={7} ry={3.4} transform="rotate(-25 22 68)" fill={LEAF} />
      <ellipse cx={38} cy={70} rx={7} ry={3.4} transform="rotate(25 38 70)" fill={LEAF} />
      <Petals cx={30} cy={44} r={3.6} n={12} fill="#e8a33a" len={2.4} />
      <circle cx={30} cy={44} r={4.8} fill="#a4521c" />
    </>
  );
}

/** Musim 4 冬 winter: a lily spray on a brown stem. */
function WinterSprig() {
  return (
    <>
      <path d="M30 78 Q28 62 34 44 M31 64 L20 54" stroke={STEM} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <ellipse cx={24} cy={72} rx={7} ry={2.4} transform="rotate(-35 24 72)" fill={LEAF} />
      <ellipse cx={38} cy={66} rx={6} ry={2.2} transform="rotate(30 38 66)" fill={LEAF} />
      <Petals cx={34} cy={40} r={3.6} n={6} fill="#c43a3a" len={2} />
      <circle cx={34} cy={40} r={1.8} fill="#f2c94c" />
      <Petals cx={19} cy={52} r={2.8} n={6} fill="#c43a3a" len={1.8} />
    </>
  );
}

const FLOWER_ART: Record<number, () => ReactNode> = { 1: PlumSprig, 2: OrchidSprig, 3: BambooSprig, 4: ChrysanthemumSprig };
const SEASON_ART: Record<number, () => ReactNode> = { 1: SpringSprig, 2: SummerSprig, 3: AutumnSprig, 4: WinterSprig };

/** Bonus number: big, haloed and top-left so it survives the 24 px tile. Ink, not background or petals, names the family. */
function BonusNumber({ value, fill }: { value: number; fill: string }) {
  return (
    <text className="art-bonus-number" x={4} y={2} fontSize={26} fill={fill} dominantBaseline="hanging" stroke={INK.ivory} strokeWidth={3} paintOrder="stroke">
      {value}
    </text>
  );
}

/** Bunga (red numeral and glyph) or Musim (blue numeral and glyph), following tiles.pdf p. 2. */
function BonusFace({ face, value }: { face: TileFace; value: number }) {
  const family = face.tone === 'season' ? 'season' : 'flower';
  const Art = (family === 'season' ? SEASON_ART : FLOWER_ART)[value];
  const ink = BONUS_INK[family];
  return (
    <>
      <g className={family === 'season' ? 'art-season' : 'art-blossom'} data-art={`${family}-${value}`}>
        {Art ? <Art /> : null}
      </g>
      <Glyph className="art-detail art-bonus-glyph" x={47} y={13} size={15} fill={ink}>
        {face.main}
      </Glyph>
      <BonusNumber value={value} fill={ink} />
    </>
  );
}

function KimFace() {
  const star = ([[30, 9], [33, 16], [41, 17], [35, 22], [37, 30], [30, 26], [23, 30], [25, 22], [19, 17], [27, 16]] as Pt[]).map((p) => p.join(',')).join(' ');
  return (
    <>
      <rect x={4} y={4} width={52} height={72} rx={6} fill="none" stroke={INK.kim} strokeWidth={2.2} strokeDasharray="5 3" />
      <polygon points={star} fill={INK.kim} />
      <Glyph y={46} size={22} fill={INK.kim}>
        金
      </Glyph>
      <text className="art-kim-word" x={30} y={66} fontSize={14} fill={INK.kim} textAnchor="middle" dominantBaseline="central">
        KIM
      </text>
    </>
  );
}

function FaceArt({ tile, face }: { tile: Tile; face: TileFace }) {
  switch (face.tone) {
    case 'tong':
      return <DotsFace value={tile.value} />;
    case 'sok':
      return <BambooFace value={tile.value} />;
    case 'ban':
      return <BanFace value={tile.value} />;
    case 'wind':
      return <WindFace face={face} value={tile.value} />;
    case 'red':
    case 'green':
    case 'white':
      return <DragonFace value={tile.value} />;
    case 'flower':
    case 'season':
      return <BonusFace face={face} value={tile.value} />;
    case 'kim':
      return <KimFace />;
  }
}

/** Decorative SVG face; the wrapping tile carries the accessible name. */
export function TileArt({ tile, face = getTileFace(tile) }: { tile: Tile; face?: TileFace }) {
  return (
    <svg className={`tile-art art-${face.tone}`} viewBox="0 0 60 80" aria-hidden="true" focusable="false" data-family={face.tone} data-value={tile.value}>
      <FaceArt tile={tile} face={face} />
    </svg>
  );
}
