import { formatState, parseState } from './blockstate.js';

/** Clockwise rotation around the Y axis, seen from above. */
export type Rotation = 0 | 90 | 180 | 270;

export function isRotation(value: unknown): value is Rotation {
  return value === 0 || value === 90 || value === 180 || value === 270;
}

const HORIZONTAL = ['north', 'east', 'south', 'west'] as const;
type Horizontal = (typeof HORIZONTAL)[number];

function isHorizontal(value: string): value is Horizontal {
  return (HORIZONTAL as readonly string[]).includes(value);
}

function turn(dir: string, quarterTurns: number): string {
  if (!isHorizontal(dir)) return dir;
  return HORIZONTAL[(HORIZONTAL.indexOf(dir) + quarterTurns) % 4];
}

const RAIL_SHAPES = new Set([
  'north_south', 'east_west', 'ascending_east', 'ascending_west', 'ascending_north', 'ascending_south',
  'south_east', 'south_west', 'north_west', 'north_east',
]);

function rotateRailShape(shape: string, q: number): string {
  if (shape.startsWith('ascending_')) return `ascending_${turn(shape.slice('ascending_'.length), q)}`;
  const [a, b] = shape.split('_');
  const ra = turn(a, q);
  const rb = turn(b, q);
  const joined = `${ra}_${rb}`;
  return RAIL_SHAPES.has(joined) ? joined : `${rb}_${ra}`;
}

/** Rotates a single block state clockwise by `rotation` degrees (props that encode direction). */
export function rotateState(state: string, rotation: Rotation): string {
  const q = rotation / 90;
  if (q === 0) return state;
  const { name, props } = parseState(state);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(props)) {
    if (isHorizontal(key)) {
      // Connection props (fences, walls, panes, redstone wire, vines): the value moves to the rotated side.
      out[turn(key, q)] = value;
      continue;
    }
    switch (key) {
      case 'facing':
      case 'horizontal_facing':
        out[key] = turn(value, q);
        break;
      case 'axis':
        out[key] = q % 2 === 1 && (value === 'x' || value === 'z') ? (value === 'x' ? 'z' : 'x') : value;
        break;
      case 'rotation':
        out[key] = String((Number(value) + 4 * q) % 16);
        break;
      case 'shape':
        out[key] = RAIL_SHAPES.has(value) ? rotateRailShape(value, q) : value;
        break;
      case 'orientation': {
        // Jigsaw/crafter: "<front>_<top>", each part a direction.
        const [front, top] = value.split('_');
        out[key] = `${turn(front, q)}_${turn(top, q)}`;
        break;
      }
      default:
        out[key] = value;
    }
  }
  return formatState(name, out);
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Rotates a schematic-local position inside a box of `size` so that the
 * rotated box again starts at 0,0,0.
 */
export function rotatePosition(pos: Vec3Like, size: Vec3Like, rotation: Rotation): Vec3Like {
  switch (rotation) {
    case 0:
      return { x: pos.x, y: pos.y, z: pos.z };
    case 90:
      return { x: size.z - 1 - pos.z, y: pos.y, z: pos.x };
    case 180:
      return { x: size.x - 1 - pos.x, y: pos.y, z: size.z - 1 - pos.z };
    case 270:
      return { x: pos.z, y: pos.y, z: size.x - 1 - pos.x };
  }
}

export function rotatedSize(size: Vec3Like, rotation: Rotation): Vec3Like {
  return rotation === 90 || rotation === 270 ? { x: size.z, y: size.y, z: size.x } : { ...size };
}
