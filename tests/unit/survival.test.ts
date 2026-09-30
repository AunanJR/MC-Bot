import { describe, expect, it } from 'vitest';
import { itemForState, itemTotals } from '../../src/survival/items.js';
import { planSurvivalGroups } from '../../src/survival/order.js';
import { doorCursor, hingeFromClick, placementSpec, YAW } from '../../src/survival/specs.js';

describe('placement specs', () => {
  it('stairs take the yaw and the click height', () => {
    const top = placementSpec('minecraft:oak_stairs[facing=east,half=top,shape=straight,waterlogged=false]');
    expect(top.look).toEqual({ yaw: YAW.east, pitch: 0 });
    expect(top.faces.map((f) => f.face)).toContain('down');
    expect(top.faces.every((f) => f.face === 'down' || f.cursor.y > 0.5)).toBe(true);
    const bottom = placementSpec('minecraft:oak_stairs[facing=east,half=bottom]');
    expect(bottom.faces.every((f) => f.face === 'up' || f.cursor.y < 0.5)).toBe(true);
  });

  it('slabs pick top or bottom by face and height', () => {
    expect(placementSpec('minecraft:oak_slab[type=top]').faces.every((f) => f.face === 'down' || f.cursor.y > 0.5)).toBe(true);
    expect(placementSpec('minecraft:oak_slab[type=bottom]').faces.every((f) => f.face === 'up' || f.cursor.y < 0.5)).toBe(true);
  });

  it('logs click a face on their axis', () => {
    expect(placementSpec('minecraft:oak_log[axis=x]').faces.map((f) => f.face).sort()).toEqual(['east', 'west']);
    expect(placementSpec('minecraft:oak_log[axis=y]').faces.map((f) => f.face).sort()).toEqual(['down', 'up']);
  });

  it('torches and buttons use the look direction', () => {
    const wall = placementSpec('minecraft:wall_torch[facing=east]');
    expect(wall.faces.map((f) => f.face)).toEqual(['east']);
    expect(wall.look!.yaw).toBe(YAW.west); // looking at the wall behind it
    expect(placementSpec('minecraft:torch').look!.pitch).toBeLessThan(-1.5);
    const floorButton = placementSpec('minecraft:oak_button[face=floor,facing=north,powered=false]');
    expect(floorButton.faces.map((f) => f.face)).toEqual(['up']);
    expect(floorButton.look).toMatchObject({ yaw: YAW.north });
    const wallButton = placementSpec('minecraft:stone_button[face=wall,facing=south,powered=false]');
    expect(wallButton.faces.map((f) => f.face)).toEqual(['south']);
  });

  it('doors place the lower half only, with a hinge-picking click', () => {
    expect(placementSpec('minecraft:oak_door[facing=north,half=upper,hinge=left]').item).toBeNull();
    const lower = placementSpec('minecraft:oak_door[facing=north,half=lower,hinge=left]');
    expect(lower.item).toBe('minecraft:oak_door');
    expect(lower.hinge).toBe('left');
    for (const facing of ['north', 'south', 'east', 'west'] as const) {
      for (const hinge of ['left', 'right'] as const) {
        const c = doorCursor(facing, hinge);
        expect(hingeFromClick(facing, c.x, c.z)).toBe(hinge);
      }
    }
  });

  it('chests face the player', () => {
    expect(placementSpec('minecraft:chest[facing=south,type=single]').look).toEqual({ yaw: YAW.north, pitch: 0 });
  });
});

describe('items', () => {
  it('maps blocks to the items that place them', () => {
    expect(itemForState('minecraft:wall_torch[facing=east]')).toEqual({ item: 'minecraft:torch', count: 1 });
    expect(itemForState('minecraft:oak_door[half=upper]')).toBeNull();
    expect(itemForState('minecraft:oak_slab[type=double]')).toEqual({ item: 'minecraft:oak_slab', count: 2 });
    expect(itemForState('minecraft:redstone_wire[power=0]')).toEqual({ item: 'minecraft:redstone', count: 1 });
    expect(itemTotals(['minecraft:stone', 'minecraft:stone', 'minecraft:oak_door[half=lower]', 'minecraft:oak_door[half=upper]'], '26.1').items).toEqual({
      'minecraft:stone': 2,
      'minecraft:oak_door': 1,
    });
  });
});

describe('survival order', () => {
  it('goes bottom-up with gravity blocks after solids and attachables last', () => {
    const groups = planSurvivalGroups([
      { x: 0, y: 1, z: 0, state: 'minecraft:torch' },
      { x: 1, y: 1, z: 0, state: 'minecraft:sand' },
      { x: 0, y: 0, z: 0, state: 'minecraft:stone' },
      { x: 1, y: 0, z: 0, state: 'minecraft:stone' },
      { x: 2, y: 1, z: 0, state: 'minecraft:stone' },
      { x: 2, y: 2, z: 0, state: 'minecraft:wall_torch[facing=north]' },
    ]);
    expect(groups.map((g) => [g.label, g.placements.map((p) => p.state.replace('minecraft:', ''))])).toEqual([
      ['layer 0', ['stone', 'stone']],
      ['layer 1', ['stone']],
      ['layer 1 gravity', ['sand']],
      ['attachables 1', ['torch']],
      ['attachables 2', ['wall_torch[facing=north]']],
    ]);
  });
});
