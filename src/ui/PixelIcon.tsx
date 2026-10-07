/**
 * Small pixel-art icons, drawn from text grids ('X' = filled pixel) as SVG
 * squares with crisp edges, so they match the game's 16-bit look. They take
 * the button's text colour.
 */

const ICONS = {
  undo: [
    '...X......',
    '..XX......',
    '.XXXXXXX..',
    'XXXXXXXXX.',
    '.XXXXXXXXX',
    '..XX....XX',
    '...X....XX',
    '........XX',
    '......XXX.',
    '..XXXXXX..',
  ],
  play: [
    'XX......',
    'XXXX....',
    'XXXXXX..',
    'XXXXXXXX',
    'XXXXXXXX',
    'XXXXXX..',
    'XXXX....',
    'XX......',
  ],
  stop: [
    'XXXXXXXX',
    'XXXXXXXX',
    'XXXXXXXX',
    'XXXXXXXX',
    'XXXXXXXX',
    'XXXXXXXX',
    'XXXXXXXX',
    'XXXXXXXX',
  ],
} as const;

export type IconName = keyof typeof ICONS | 'redo';

/** CSS pixels per icon pixel. */
const SCALE = 2;

interface PixelIconProps {
  name: IconName;
}

export function PixelIcon({ name }: PixelIconProps) {
  // Redo is undo mirrored.
  const rows = name === 'redo' ? ICONS.undo.map(mirror) : ICONS[name];
  const width = rows[0]?.length ?? 0;
  const height = rows.length;
  return (
    <svg
      className="pixel-icon"
      width={width * SCALE}
      height={height * SCALE}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {rows.flatMap((row, y) =>
        [...row].map((cell, x) =>
          cell === 'X' ? <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} /> : null,
        ),
      )}
    </svg>
  );
}

function mirror(row: string): string {
  return [...row].reverse().join('');
}
