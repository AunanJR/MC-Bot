import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { StateCanonicalizer, formatState, parseState } from '../../src/schematic/blockstate.js';
import { loadSchematic } from '../../src/schematic/load.js';
import { buildBounds, toPlacements } from '../../src/schematic/placement.js';
import { rotatePosition, rotateState, rotatedSize } from '../../src/schematic/rotate.js';

const fixture = readFileSync(new URL('../fixtures/small_house.litematic', import.meta.url));

describe('block states', () => {
  it('parses and formats with sorted properties', () => {
    const p = parseState('oak_stairs[half=top,facing=east]');
    expect(p).toEqual({ name: 'minecraft:oak_stairs', props: { half: 'top', facing: 'east' } });
    expect(formatState(p.name, p.props)).toBe('minecraft:oak_stairs[facing=east,half=top]');
  });

  it('fills default properties for the canonical form', () => {
    const canon = new StateCanonicalizer('26.1');
    expect(canon.canonical('minecraft:oak_stairs[facing=east]')).toBe(
      'minecraft:oak_stairs[facing=east,half=bottom,shape=straight,waterlogged=false]',
    );
    expect(canon.canonical('minecraft:stone')).toBe('minecraft:stone');
    expect(canon.canonical('oak_log')).toBe('minecraft:oak_log[axis=y]');
  });
});

describe('rotation', () => {
  it('rotates directional properties clockwise', () => {
    expect(rotateState('minecraft:oak_stairs[facing=north,half=top]', 90)).toBe('minecraft:oak_stairs[facing=east,half=top]');
    expect(rotateState('minecraft:oak_stairs[facing=north]', 180)).toBe('minecraft:oak_stairs[facing=south]');
    expect(rotateState('minecraft:oak_stairs[facing=north]', 270)).toBe('minecraft:oak_stairs[facing=west]');
    expect(rotateState('minecraft:oak_log[axis=x]', 90)).toBe('minecraft:oak_log[axis=z]');
    expect(rotateState('minecraft:oak_log[axis=y]', 90)).toBe('minecraft:oak_log[axis=y]');
    expect(rotateState('minecraft:oak_sign[rotation=15]', 90)).toBe('minecraft:oak_sign[rotation=3]');
    expect(rotateState('minecraft:rail[shape=north_east]', 90)).toBe('minecraft:rail[shape=south_east]');
    expect(rotateState('minecraft:rail[shape=ascending_north]', 90)).toBe('minecraft:rail[shape=ascending_east]');
    expect(rotateState('minecraft:oak_fence[east=false,north=true,south=false,west=true]', 90)).toBe(
      'minecraft:oak_fence[east=true,north=true,south=false,west=false]',
    );
  });

  it('maps positions so the rotated box starts at the origin', () => {
    const size = { x: 3, y: 1, z: 2 };
    expect(rotatedSize(size, 90)).toEqual({ x: 2, y: 1, z: 3 });
    // North-west corner goes to the north-east corner when turning clockwise.
    expect(rotatePosition({ x: 0, y: 0, z: 0 }, size, 90)).toEqual({ x: 1, y: 0, z: 0 });
    expect(rotatePosition({ x: 2, y: 0, z: 1 }, size, 180)).toEqual({ x: 0, y: 0, z: 0 });
    expect(rotatePosition({ x: 0, y: 0, z: 0 }, size, 270)).toEqual({ x: 0, y: 0, z: 2 });
  });

  it('four quarter turns are the identity', () => {
    const schem = loadSchematic(fixture, 'small_house.litematic');
    const start = new Map(schem.blocks.map((b) => [`${b.x},${b.y},${b.z}`, b.state]));
    let blocks = schem.blocks.map((b) => ({ ...b }));
    let size = schem.size;
    for (let i = 0; i < 4; i++) {
      blocks = blocks.map((b) => ({ ...rotatePosition(b, size, 90), state: rotateState(b.state, 90) }));
      size = rotatedSize(size, 90);
    }
    for (const b of blocks) expect(start.get(`${b.x},${b.y},${b.z}`)).toBe(b.state);
  });
});

describe('loading', () => {
  it('reads the fixture with size and materials', () => {
    const schem = loadSchematic(fixture, 'small_house.litematic');
    expect(schem.format).toBe('litematic');
    expect(schem.size).toEqual({ x: 9, y: 6, z: 9 });
    expect(schem.blocks.length).toBe(335);
    expect(schem.materials['minecraft:cobblestone']).toBe(81);
    expect(schem.materials['minecraft:oak_door']).toBe(2);
  });

  it('transforms to world placements with origin and rotation', () => {
    const schem = loadSchematic(fixture, 'small_house.litematic');
    const t = { origin: { x: 100, y: -60, z: 200 }, rotation: 90 as const };
    const placements = toPlacements(schem, t);
    const bounds = buildBounds(schem, t);
    expect(bounds).toEqual({ min: { x: 100, y: -60, z: 200 }, max: { x: 108, y: -55, z: 208 } });
    for (const p of placements) {
      expect(p.x).toBeGreaterThanOrEqual(bounds.min.x);
      expect(p.x).toBeLessThanOrEqual(bounds.max.x);
      expect(p.z).toBeGreaterThanOrEqual(bounds.min.z);
      expect(p.z).toBeLessThanOrEqual(bounds.max.z);
    }
    // The door faced north in the file; after a clockwise turn it faces east.
    const door = placements.find((p) => p.state.startsWith('minecraft:oak_door') && p.state.includes('half=lower'))!;
    expect(door.state).toContain('facing=east');
  });
});
