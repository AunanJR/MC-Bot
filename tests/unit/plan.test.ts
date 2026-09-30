import { describe, expect, it } from 'vitest';
import { planOpCommands, renderCommand, splitBox } from '../../src/builder/plan.js';
import type { Placement } from '../../src/schematic/placement.js';

function cube(n: number, state: string, y0 = 0): Placement[] {
  const out: Placement[] = [];
  for (let y = y0; y < y0 + n; y++) for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) out.push({ x, y, z, state });
  return out;
}

describe('op planning', () => {
  it('merges a uniform cube into one /fill', () => {
    const cmds = planOpCommands(cube(4, 'minecraft:stone'));
    expect(cmds).toHaveLength(1);
    expect(cmds[0].count).toBe(64);
    expect(renderCommand(cmds[0], 'strict')).toBe('/fill 0 0 0 3 3 3 minecraft:stone strict');
  });

  it('covers every placement exactly once', () => {
    const placements = cube(5, 'minecraft:stone').map((p) => ((p.x + p.y * 2 + p.z) % 3 === 0 ? { ...p, state: 'minecraft:dirt' } : p));
    const cmds = planOpCommands(placements);
    const covered = new Map<string, string>();
    for (const c of cmds) {
      for (let y = c.from.y; y <= c.to.y; y++) for (let z = c.from.z; z <= c.to.z; z++) for (let x = c.from.x; x <= c.to.x; x++) {
        const k = `${x},${y},${z}`;
        expect(covered.has(k)).toBe(false);
        covered.set(k, c.state);
      }
    }
    expect(covered.size).toBe(placements.length);
    for (const p of placements) expect(covered.get(`${p.x},${p.y},${p.z}`)).toBe(p.state);
  });

  it('uses single /setblock commands when merging is off', () => {
    const cmds = planOpCommands(cube(2, 'minecraft:stone'), { mergeFills: false });
    expect(cmds).toHaveLength(8);
    expect(renderCommand(cmds[0], 'replace')).toBe('/setblock 0 0 0 minecraft:stone replace');
  });

  it('places attachables and gravity blocks after solid blocks', () => {
    const cmds = planOpCommands([
      { x: 0, y: 1, z: 0, state: 'minecraft:torch' },
      { x: 0, y: 2, z: 1, state: 'minecraft:sand' },
      { x: 0, y: 0, z: 0, state: 'minecraft:stone' },
      { x: 0, y: 1, z: 1, state: 'minecraft:stone' },
    ]);
    expect(cmds.map((c) => c.state)).toEqual(['minecraft:stone', 'minecraft:stone', 'minecraft:sand', 'minecraft:torch']);
  });

  it('respects max fill volume and extent', () => {
    const cmds = planOpCommands(cube(10, 'minecraft:stone'), { maxFillVolume: 100, maxFillExtent: 4 });
    for (const c of cmds) {
      expect(c.count).toBeLessThanOrEqual(100);
      expect(c.to.x - c.from.x + 1).toBeLessThanOrEqual(4);
      expect(c.to.z - c.from.z + 1).toBeLessThanOrEqual(4);
    }
    expect(cmds.reduce((n, c) => n + c.count, 0)).toBe(1000);
  });

  it('splits large boxes under the volume cap', () => {
    const boxes = splitBox({ x: 0, y: 0, z: 0 }, { x: 99, y: 9, z: 99 }, 32768);
    let total = 0;
    for (const b of boxes) {
      const v = (b.to.x - b.from.x + 1) * (b.to.y - b.from.y + 1) * (b.to.z - b.from.z + 1);
      expect(v).toBeLessThanOrEqual(32768);
      total += v;
    }
    expect(total).toBe(100 * 10 * 100);
  });
});
