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
  bonusBlue: '#1b2f5c',
  kim: '#5b3a8c',
  ivory: '#fffdf6',
} as const;

const CN_NUMERAL = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const FLOWER_GLYPH = ['', '梅', '蘭', '菊', '竹'];
const SEASON_GLYPH = ['', '春', '夏', '秋', '冬'];

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

function Blossom() {
  const petals = [0, 72, 144, 216, 288];
  return (
    <g className="art-blossom">
      <path d="M30 76 C30 66 33 60 36 54" stroke={INK.green} strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <ellipse cx={25} cy={68} rx={6} ry={2.6} transform="rotate(-30 25 68)" fill={INK.green} />
      {petals.map((deg) => (
        <ellipse key={deg} cx={36} cy={37} rx={5.6} ry={8.6} transform={`rotate(${deg} 36 46)`} fill="#4a73b5" />
      ))}
      <circle cx={36} cy={46} r={4.6} fill={INK.bonusBlue} />
      <circle cx={36} cy={46} r={1.8} fill="#f2c94c" />
    </g>
  );
}

function SeasonSprig() {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <g className="art-season">
      {rays.map((deg) => (
        <line key={deg} x1={36} y1={30} x2={36} y2={26} transform={`rotate(${deg} 36 42)`} stroke={INK.red} strokeWidth={2.4} strokeLinecap="round" />
      ))}
      <circle cx={36} cy={42} r={8.5} fill={INK.red} />
      <circle cx={36} cy={42} r={4} fill={INK.ivory} />
      <path d="M18 74 Q30 64 44 66" stroke="#7a4b24" strokeWidth={2.2} fill="none" strokeLinecap="round" />
      <ellipse cx={27} cy={64} rx={6} ry={2.6} transform="rotate(-35 27 64)" fill={INK.green} />
      <ellipse cx={39} cy={62} rx={5} ry={2.3} transform="rotate(25 39 62)" fill={INK.green} />
    </g>
  );
}

/** Bonus number: big, haloed and top-left so it survives the 24 px tile. Ink, not background, names the family. */
function BonusNumber({ value, fill }: { value: number; fill: string }) {
  return (
    <text className="art-bonus-number" x={4} y={2} fontSize={26} fill={fill} dominantBaseline="hanging" stroke={INK.ivory} strokeWidth={3} paintOrder="stroke">
      {value}
    </text>
  );
}

function FlowerFace({ value }: { value: number }) {
  return (
    <>
      <Blossom />
      <Glyph className="art-detail" x={50} y={10} size={11} fill={INK.bonusBlue}>
        {FLOWER_GLYPH[value]}
      </Glyph>
      <BonusNumber value={value} fill={INK.bonusBlue} />
    </>
  );
}

function SeasonFace({ value }: { value: number }) {
  return (
    <>
      <SeasonSprig />
      <Glyph className="art-detail" x={50} y={10} size={11} fill={INK.red}>
        {SEASON_GLYPH[value]}
      </Glyph>
      <BonusNumber value={value} fill={INK.red} />
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
      return <FlowerFace value={tile.value} />;
    case 'season':
      return <SeasonFace value={tile.value} />;
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
