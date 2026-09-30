import type { LoadedSchematic } from './load.js';
import { rotatePosition, rotateState, rotatedSize, type Rotation, type Vec3Like } from './rotate.js';

/** A block to place at an absolute world position. */
export interface Placement {
  x: number;
  y: number;
  z: number;
  state: string;
}

export interface BuildTransform {
  /** World position of the rotated build's min corner. */
  origin: Vec3Like;
  rotation: Rotation;
}

/** Maps every schematic block to its world position and rotated state. */
export function toPlacements(schematic: LoadedSchematic, transform: BuildTransform): Placement[] {
  const { origin, rotation } = transform;
  return schematic.blocks.map((b) => {
    const p = rotatePosition(b, schematic.size, rotation);
    return { x: origin.x + p.x, y: origin.y + p.y, z: origin.z + p.z, state: rotateState(b.state, rotation) };
  });
}

/** World-space bounding box of a transformed build (inclusive). */
export function buildBounds(schematic: LoadedSchematic, transform: BuildTransform): { min: Vec3Like; max: Vec3Like } {
  const size = rotatedSize(schematic.size, transform.rotation);
  const { origin } = transform;
  return {
    min: { ...origin },
    max: { x: origin.x + size.x - 1, y: origin.y + size.y - 1, z: origin.z + size.z - 1 },
  };
}

export function posKey(p: Vec3Like): string {
  return `${p.x},${p.y},${p.z}`;
}
