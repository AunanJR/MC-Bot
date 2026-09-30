import { parseState, shortName } from '../schematic/blockstate.js';
import type { Vec3Like } from '../schematic/rotate.js';
import { itemForState } from './items.js';

export type Dir = 'down' | 'up' | 'north' | 'south' | 'west' | 'east';

export const DIR_VEC: Record<Dir, Vec3Like> = {
  down: { x: 0, y: -1, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  north: { x: 0, y: 0, z: -1 },
  south: { x: 0, y: 0, z: 1 },
  west: { x: -1, y: 0, z: 0 },
  east: { x: 1, y: 0, z: 0 },
};

export const OPPOSITE: Record<Dir, Dir> = { down: 'up', up: 'down', north: 'south', south: 'north', west: 'east', east: 'west' };
const SIDES: Dir[] = ['north', 'south', 'west', 'east'];
const ALL: Dir[] = ['up', 'north', 'south', 'west', 'east', 'down'];

/** mineflayer yaw for looking toward a horizontal direction (0 = north, counter-clockwise). */
export const YAW: Record<string, number> = { north: 0, west: Math.PI / 2, south: Math.PI, east: -Math.PI / 2 };
export const LOOK_DOWN = -Math.PI / 2 + 0.01;
export const LOOK_UP = Math.PI / 2 - 0.01;

/**
 * One way to place a block: click `face` of the neighbour at `target - face`,
 * at `cursor` (0..1, relative to that neighbour).
 */
export interface FaceOption {
  face: Dir;
  cursor: Vec3Like;
}

export interface PlacementSpec {
  /** Item to hold, or null when the block appears on its own (upper door half). */
  item: string | null;
  faces: FaceOption[];
  /** Fixed look direction; null means look at the click point. */
  look: { yaw: number; pitch: number } | null;
  /** Door hinge wanted; the cursor is adjusted at placement time. */
  hinge?: 'left' | 'right';
  /** Clicking the target block itself (turning a slab into a double slab). */
  mergeSlab?: boolean;
}

/** Point on the `face` of the neighbour block, with the in-face coordinates set by `u`,`v` defaults. */
export function faceCursor(face: Dir, yOnSide = 0.5): Vec3Like {
  switch (face) {
    case 'up': return { x: 0.5, y: 1, z: 0.5 };
    case 'down': return { x: 0.5, y: 0, z: 0.5 };
    case 'north': return { x: 0.5, y: yOnSide, z: 0 };
    case 'south': return { x: 0.5, y: yOnSide, z: 1 };
    case 'west': return { x: 0, y: yOnSide, z: 0.5 };
    case 'east': return { x: 1, y: yOnSide, z: 0.5 };
  }
}

function options(faces: Dir[], yOnSide = 0.5): FaceOption[] {
  return faces.map((face) => ({ face, cursor: faceCursor(face, yOnSide) }));
}

/** Faces for blocks with a top/bottom half chosen by where the player clicks (stairs, slabs, trapdoors). */
function halfFaces(top: boolean): FaceOption[] {
  return top ? [...options(['down']), ...options(SIDES, 0.75)] : [...options(['up']), ...options(SIDES, 0.25)];
}

const FACES_PLAYER = /^(chest|trapped_chest|ender_chest|furnace|blast_furnace|smoker|carved_pumpkin|jack_o_lantern|lectern|loom|beehive|bee_nest|stonecutter|cartography_table|smithing_table)$/;
const FACING_AWAY = /(_stairs|_door|_fence_gate|^repeater|^comparator|_bed)$/;

/**
 * How a survival player produces `state`: which neighbour face to click,
 * where on it, and which way to look. Follows vanilla's placement rules:
 * stairs/doors take the player's yaw, torches and buttons the look direction,
 * logs the clicked face, slabs and stair halves the click height.
 */
export function placementSpec(state: string): PlacementSpec {
  const { name: full, props } = parseState(state);
  const name = shortName(full);
  const need = itemForState(state);
  const item = need?.item ?? null;
  const facing = props.facing;

  if (name.endsWith('_door')) {
    if (props.half === 'upper') return { item: null, faces: [], look: null };
    return { item, faces: options(['up']), look: { yaw: YAW[facing], pitch: 0 }, hinge: props.hinge as 'left' | 'right' };
  }
  if (name.endsWith('_stairs')) {
    return { item, faces: halfFaces(props.half === 'top'), look: { yaw: YAW[facing], pitch: 0 } };
  }
  if (name.endsWith('_slab')) {
    if (props.type === 'double') return { item, faces: halfFaces(false), look: null, mergeSlab: true };
    return { item, faces: halfFaces(props.type === 'top'), look: null };
  }
  if (name.endsWith('_trapdoor')) {
    // Clicking a side face makes the trapdoor face away from that neighbour.
    return {
      item,
      faces: [{ face: facing as Dir, cursor: faceCursor(facing as Dir, props.half === 'top' ? 0.75 : 0.25) }],
      look: { yaw: YAW[OPPOSITE[facing as Dir]], pitch: 0 },
    };
  }
  if (/^(torch|soul_torch|redstone_torch|copper_torch)$/.test(name)) {
    return { item, faces: options(['up']), look: { yaw: 0, pitch: LOOK_DOWN } };
  }
  if (/wall_torch$/.test(name)) {
    // Looking at the wall makes the torch face away from it.
    return { item, faces: options([facing as Dir]), look: { yaw: YAW[OPPOSITE[facing as Dir]], pitch: 0 } };
  }
  if (name.endsWith('_button') || name === 'lever') {
    if (props.face === 'floor') return { item, faces: options(['up']), look: { yaw: YAW[facing], pitch: LOOK_DOWN } };
    if (props.face === 'ceiling') return { item, faces: options(['down']), look: { yaw: YAW[facing], pitch: LOOK_UP } };
    return { item, faces: options([facing as Dir]), look: { yaw: YAW[OPPOSITE[facing as Dir]], pitch: 0 } };
  }
  if (props.axis && !facing) {
    const byAxis: Record<string, Dir[]> = { y: ['up', 'down'], x: ['east', 'west'], z: ['south', 'north'] };
    return { item, faces: options(byAxis[props.axis] ?? ALL), look: null };
  }
  if (facing && SIDES.includes(facing as Dir) && FACES_PLAYER.test(name)) {
    return { item, faces: options(ALL), look: { yaw: YAW[OPPOSITE[facing as Dir]], pitch: 0 } };
  }
  if (facing && SIDES.includes(facing as Dir) && FACING_AWAY.test(name)) {
    return { item, faces: options(ALL), look: { yaw: YAW[facing], pitch: 0 } };
  }
  return { item, faces: options(ALL), look: null };
}

/** Vanilla DoorBlock hinge rule for a click at (cx, cz) inside the door's cell when neighbours tie. */
export function hingeFromClick(facing: Dir, cx: number, cz: number): 'left' | 'right' {
  const dx = DIR_VEC[facing].x;
  const dz = DIR_VEC[facing].z;
  const left = (dx >= 0 || !(cz < 0.5)) && (dx <= 0 || !(cz > 0.5)) && (dz >= 0 || !(cx > 0.5)) && (dz <= 0 || !(cx < 0.5));
  return left ? 'left' : 'right';
}

/** A click point on the top face of the block below a door that yields `hinge` (when neighbours tie). */
export function doorCursor(facing: Dir, hinge: 'left' | 'right'): Vec3Like {
  for (const cx of [0.25, 0.75]) {
    for (const cz of [0.25, 0.75]) {
      if (hingeFromClick(facing, cx, cz) === hinge) return { x: cx, y: 1, z: cz };
    }
  }
  return { x: 0.5, y: 1, z: 0.5 };
}
