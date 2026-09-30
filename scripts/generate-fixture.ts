/**
 * Generates tests/fixtures/small_house.litematic with nucleation.
 * Every state is one a survival player can produce by placing blocks, so the
 * same file serves the op and the survival integration tests.
 *
 *   pnpm tsx scripts/generate-fixture.ts
 */
import { writeFileSync } from 'node:fs';
import { Schematic } from 'nucleation';

const W = 9; // x
const L = 9; // z
const s = Schematic.create('small_house');
s.setAuthor('blueprint');
s.setDescription('Blueprint integration test fixture');

const set = (x: number, y: number, z: number, state: string) => s.setBlockFromString(x, y, z, state);

// Floor.
for (let x = 0; x < W; x++) for (let z = 0; z < L; z++) set(x, 0, z, 'minecraft:cobblestone');

// Walls y=1..3: log corners, plank walls, a log ring on top (axis follows the wall).
for (let y = 1; y <= 3; y++) {
  for (let x = 0; x < W; x++) {
    for (let z = 0; z < L; z++) {
      const edgeX = x === 0 || x === W - 1;
      const edgeZ = z === 0 || z === L - 1;
      if (!edgeX && !edgeZ) continue;
      if (edgeX && edgeZ) set(x, y, z, 'minecraft:oak_log[axis=y]');
      else if (y === 3) set(x, y, z, edgeZ ? 'minecraft:oak_log[axis=x]' : 'minecraft:oak_log[axis=z]');
      else set(x, y, z, 'minecraft:oak_planks');
    }
  }
}

// Windows.
for (const [x, z] of [[0, 4], [W - 1, 4], [2, 0], [6, 0]]) set(x, 2, z, 'minecraft:glass');

// Door in the south wall, placed from outside looking north.
set(4, 1, L - 1, 'minecraft:oak_door[facing=north,half=lower,hinge=left,open=false,powered=false]');
set(4, 2, L - 1, 'minecraft:oak_door[facing=north,half=upper,hinge=left,open=false,powered=false]');

// Roof: stairs on the north/south eaves, planks, then a second row of stairs and a slab ridge.
for (let x = 0; x < W; x++) {
  set(x, 4, 0, 'minecraft:stone_brick_stairs[facing=south,half=bottom,shape=straight,waterlogged=false]');
  set(x, 4, L - 1, 'minecraft:stone_brick_stairs[facing=north,half=bottom,shape=straight,waterlogged=false]');
  for (let z = 1; z < L - 1; z++) set(x, 4, z, 'minecraft:spruce_planks');
  set(x, 5, 1, 'minecraft:stone_brick_stairs[facing=south,half=bottom,shape=straight,waterlogged=false]');
  set(x, 5, L - 2, 'minecraft:stone_brick_stairs[facing=north,half=bottom,shape=straight,waterlogged=false]');
  for (let z = 2; z < L - 2; z++) set(x, 5, z, 'minecraft:oak_slab[type=bottom,waterlogged=false]');
}

// Interior.
for (let x = 2; x <= 6; x++) set(x, 3, 1, 'minecraft:oak_slab[type=top,waterlogged=false]'); // shelf
set(1, 2, 2, 'minecraft:wall_torch[facing=east]');
set(W - 2, 2, 6, 'minecraft:wall_torch[facing=west]');
set(6, 1, 6, 'minecraft:torch');
set(5, 2, 1, 'minecraft:stone_button[face=wall,facing=south,powered=false]');
set(2, 1, 6, 'minecraft:oak_button[face=floor,facing=north,powered=false]');
set(2, 1, 2, 'minecraft:crafting_table');
set(6, 1, 2, 'minecraft:chest[facing=south,type=single,waterlogged=false]');
set(2, 1, 4, 'minecraft:sand');
set(2, 2, 4, 'minecraft:gravel');

const out = new URL('../tests/fixtures/small_house.litematic', import.meta.url);
writeFileSync(out, Buffer.from(s.toLitematicB64(), 'base64'));
console.log(`wrote ${out.pathname}: ${s.countBlocksJson()}`);
