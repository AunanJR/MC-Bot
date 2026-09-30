import { Schematic } from 'nucleation';
import { formatState, isAir } from './blockstate.js';
import type { Vec3Like } from './rotate.js';

/** One non-air block of a schematic, at a position relative to the schematic's min corner. */
export interface SchematicBlock {
  x: number;
  y: number;
  z: number;
  /** Block state with sorted properties, as stored in the file (defaults are not filled in). */
  state: string;
}

export interface LoadedSchematic {
  name: string;
  format: SchematicFormat;
  size: Vec3Like;
  blocks: SchematicBlock[];
  /** Block id -> count, non-air blocks only. */
  materials: Record<string, number>;
}

export type SchematicFormat = 'litematic' | 'schem';

interface RawBlock {
  name: string;
  properties: [string, string][];
  x: number;
  y: number;
  z: number;
}

export function detectFormat(bytes: Uint8Array, filename?: string): SchematicFormat {
  const lower = filename?.toLowerCase() ?? '';
  if (lower.endsWith('.litematic')) return 'litematic';
  if (lower.endsWith('.schem') || lower.endsWith('.schematic')) return 'schem';
  // Both are gzipped NBT; litematics have a "Regions" compound, Sponge schematics do not.
  const text = Buffer.from(bytes).toString('latin1');
  return text.includes('Regions') ? 'litematic' : 'schem';
}

function parseWithNucleation(bytes: Uint8Array, format: SchematicFormat): Schematic {
  const data = Array.from(bytes);
  try {
    return format === 'litematic' ? Schematic.fromLitematic(data) : Schematic.fromSchematic(data);
  } catch (first) {
    try {
      return Schematic.fromData(data);
    } catch {
      throw new Error(`could not parse ${format} file: ${(first as Error).message ?? String(first)}`);
    }
  }
}

/** Parses a .litematic or .schem file into a flat list of non-air blocks. */
export function loadSchematic(bytes: Uint8Array, filename?: string): LoadedSchematic {
  const format = detectFormat(bytes, filename);
  const schem = parseWithNucleation(bytes, format);
  try {
    const raw = JSON.parse(schem.getNonAirBlocksJson()) as RawBlock[];
    const blocks = raw
      .map((b) => ({ x: b.x, y: b.y, z: b.z, state: formatState(b.name, Object.fromEntries(b.properties)) }))
      .filter((b) => !isAir(b.state));
    if (blocks.length === 0) throw new Error('schematic contains no blocks');

    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const b of blocks) {
      min.x = Math.min(min.x, b.x); min.y = Math.min(min.y, b.y); min.z = Math.min(min.z, b.z);
      max.x = Math.max(max.x, b.x); max.y = Math.max(max.y, b.y); max.z = Math.max(max.z, b.z);
    }
    const materials: Record<string, number> = {};
    for (const b of blocks) {
      b.x -= min.x; b.y -= min.y; b.z -= min.z;
      const id = b.state.split('[')[0];
      materials[id] = (materials[id] ?? 0) + 1;
    }
    blocks.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
    let name = '';
    try {
      name = schem.name();
    } catch {
      // Unnamed schematic.
    }
    return {
      name: name || filename || 'schematic',
      format,
      size: { x: max.x - min.x + 1, y: max.y - min.y + 1, z: max.z - min.z + 1 },
      blocks,
      materials,
    };
  } finally {
    schem.clearContents();
  }
}
