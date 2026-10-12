/* Build catalog. Every build is generated from code into a voxel list, so the
 * 3D guide, the material list and the .schem export all read the same data.
 * Axes: x east, y up, z south. Fronts face +z (toward the default camera). */
(function () {
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  function builder() {
    const m = new Map();
    const key = (x, y, z) => x + ',' + y + ',' + z;
    const range = (a, b) => { const r = []; for (let i = Math.min(a, b); i <= Math.max(a, b); i++) r.push(i); return r; };
    const inDisk = (dx, dz, r) => dx * dx + dz * dz <= r * r + r;
    const api = {
      set(x, y, z, b) { if (b) m.set(key(x, y, z), b); else m.delete(key(x, y, z)); return api; },
      get(x, y, z) { return m.get(key(x, y, z)); },
      fill(x1, y1, z1, x2, y2, z2, b) {
        for (const x of range(x1, x2)) for (const y of range(y1, y2)) for (const z of range(z1, z2)) api.set(x, y, z, b);
        return api;
      },
      walls(x1, y1, z1, x2, y2, z2, b) {
        for (const x of range(x1, x2)) for (const y of range(y1, y2)) for (const z of range(z1, z2))
          if (x === x1 || x === x2 || z === z1 || z === z2) api.set(x, y, z, b);
        return api;
      },
      corners(x1, z1, x2, z2, y1, y2, b) {
        for (const y of range(y1, y2)) { api.set(x1, y, z1, b); api.set(x2, y, z1, b); api.set(x1, y, z2, b); api.set(x2, y, z2, b); }
        return api;
      },
      disk(cx, y, cz, r, b) {
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (inDisk(dx, dz, r)) api.set(cx + dx, y, cz + dz, b);
        return api;
      },
      ring(cx, y, cz, r, b) {
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
          if (!inDisk(dx, dz, r)) continue;
          if (!inDisk(dx + 1, dz, r) || !inDisk(dx - 1, dz, r) || !inDisk(dx, dz + 1, r) || !inDisk(dx, dz - 1, r)) api.set(cx + dx, y, cz + dz, b);
        }
        return api;
      },
      ball(cx, cy, cz, r, b, keep = 1, rand = Math.random, onlyEmpty = true) {
        for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
          if (dx * dx + dy * dy + dz * dz > r * r + r * 0.6) continue;
          if (onlyEmpty && api.get(cx + dx, cy + dy, cz + dz)) continue;
          if (rand() <= keep) api.set(cx + dx, cy + dy, cz + dz, b);
        }
        return api;
      },
      /* Gable roof running along x, sloping toward z1 and z2 */
      gable(x1, x2, z1, z2, y, roof, gableFill, cap, overhang = 1) {
        const depth = z2 - z1;
        const steps = Math.floor(depth / 2);
        for (let i = 0; i <= steps; i++) {
          const yy = y + i;
          const za = z1 - overhang + i, zb = z2 + overhang - i;
          if (za > zb) break;
          for (let x = x1 - overhang; x <= x2 + overhang; x++) {
            api.set(x, yy, za, roof); api.set(x, yy, zb, roof);
          }
          if (gableFill) for (let z = z1 + i; z <= z2 - i; z++) {
            if (z === za || z === zb) continue;
            api.set(x1, yy, z, gableFill); api.set(x2, yy, z, gableFill);
          }
        }
        if (cap && depth % 2 === 0) {
          const zc = z1 + depth / 2;
          const yy = y + steps + (overhang ? 0 : 0);
          for (let x = x1 - overhang; x <= x2 + overhang; x++) if (!api.get(x, yy, zc) || api.get(x, yy, zc) === gableFill) api.set(x, yy + 1, zc, cap);
        }
        return api;
      },
      done() {
        let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
        const list = [];
        for (const [k, b] of m) {
          const [x, y, z] = k.split(',').map(Number);
          list.push([x, y, z, b]);
          mnx = Math.min(mnx, x); mny = Math.min(mny, y); mnz = Math.min(mnz, z);
          mxx = Math.max(mxx, x); mxy = Math.max(mxy, y); mxz = Math.max(mxz, z);
        }
        for (const v of list) { v[0] -= mnx; v[1] -= mny; v[2] -= mnz; }
        list.sort((a, b) => a[1] - b[1] || a[2] - b[2] || a[0] - b[0]);
        return { size: { x: mxx - mnx + 1, y: mxy - mny + 1, z: mxz - mnz + 1 }, blocks: list };
      },
    };
    return api;
  }

  /* ---------- generators ---------- */

  function starterCabin() {
    const b = builder();
    b.fill(0, 0, 0, 6, 0, 6, 'cobblestone');
    b.fill(1, 0, 1, 5, 0, 5, 'oak_planks');
    b.walls(0, 1, 0, 6, 3, 6, 'oak_planks');
    b.corners(0, 0, 6, 6, 1, 3, 'oak_log');
    b.set(3, 1, 6, 'oak_door_lower').set(3, 2, 6, 'oak_door_upper');
    b.set(1, 2, 6, 'glass_pane').set(5, 2, 6, 'glass_pane');
    b.set(0, 2, 3, 'glass_pane').set(6, 2, 3, 'glass_pane').set(3, 2, 0, 'glass_pane');
    b.gable(0, 6, 0, 6, 4, 'spruce_planks', 'oak_planks', 'spruce_slab');
    b.set(1, 1, 1, 'crafting_table').set(2, 1, 1, 'furnace').set(4, 1, 1, 'chest');
    b.set(5, 1, 1, 'red_bed_head').set(5, 1, 2, 'red_bed_foot');
    b.set(1, 1, 5, 'torch').set(5, 1, 5, 'torch');
    b.set(2, 1, 7, 'poppy').set(4, 1, 7, 'dandelion');
    b.fill(-1, 0, 7, 7, 0, 8, 'grass_block');
    b.set(3, 0, 7, 'coarse_dirt').set(3, 0, 8, 'coarse_dirt');
    return b.done();
  }

  function survivalHouse() {
    const b = builder();
    const r = rng(7);
    b.fill(0, 0, 0, 10, 0, 8, 'cobblestone');
    b.walls(0, 1, 0, 10, 3, 8, 'cobblestone');
    for (let x = 0; x <= 10; x++) for (let y = 1; y <= 3; y++) for (const z of [0, 8]) if (r() < 0.25) b.set(x, y, z, 'mossy_cobblestone');
    b.corners(0, 0, 10, 8, 1, 7, 'oak_log');
    b.fill(1, 4, 1, 9, 4, 7, 'oak_planks');
    b.walls(0, 4, 0, 10, 4, 8, 'stripped_oak_log');
    b.walls(0, 5, 0, 10, 7, 8, 'oak_planks');
    b.corners(0, 0, 10, 8, 4, 7, 'spruce_log');
    for (const x of [2, 3, 7, 8]) { b.set(x, 2, 8, 'glass_pane'); b.set(x, 6, 8, 'glass_pane'); b.set(x, 6, 0, 'glass_pane'); }
    for (const z of [3, 5]) { b.set(0, 2, z, 'glass_pane'); b.set(10, 2, z, 'glass_pane'); b.set(0, 6, z, 'glass_pane'); b.set(10, 6, z, 'glass_pane'); }
    b.set(5, 1, 8, 'spruce_door_lower').set(5, 2, 8, 'spruce_door_upper');
    b.gable(0, 10, 0, 8, 8, 'spruce_planks', 'oak_planks', 'spruce_slab');
    b.fill(8, 8, 2, 8, 12, 2, 'bricks');
    b.set(8, 13, 2, 'cobblestone_wall');
    for (let y = 1; y <= 4; y++) b.set(9, y, 1, 'ladder');
    b.set(9, 4, 1, 'ladder');
    b.fill(1, 1, 1, 3, 1, 1, 'bookshelf');
    b.set(4, 1, 1, 'crafting_table').set(5, 1, 1, 'furnace').set(6, 1, 1, 'furnace');
    b.set(1, 1, 6, 'chest').set(1, 1, 7, 'chest');
    b.set(8, 1, 7, 'barrel').set(9, 1, 7, 'barrel');
    b.set(2, 5, 2, 'red_bed_head').set(2, 5, 3, 'red_bed_foot');
    b.set(4, 5, 2, 'red_bed_head').set(4, 5, 3, 'red_bed_foot');
    b.fill(6, 5, 5, 8, 5, 6, 'red_carpet');
    b.set(5, 3, 4, 'hanging_lantern').set(5, 7, 4, 'hanging_lantern');
    b.fill(-1, 0, 9, 11, 0, 11, 'grass_block');
    b.fill(5, 0, 9, 5, 0, 11, 'coarse_dirt');
    b.set(1, 1, 9, 'poppy').set(3, 1, 10, 'cornflower').set(8, 1, 9, 'dandelion').set(10, 1, 10, 'poppy');
    b.set(3, 1, 9, 'oak_leaves').set(7, 1, 9, 'oak_leaves').set(9, 1, 9, 'oak_leaves');
    return b.done();
  }

  function modernVilla() {
    const b = builder();
    b.fill(-2, 0, -2, 23, 0, 19, 'grass_block');
    b.fill(0, 0, 0, 17, 0, 9, 'smooth_stone');
    b.walls(0, 1, 0, 17, 4, 9, 'white_concrete');
    for (let x = 2; x <= 15; x++) for (let y = 1; y <= 3; y++) b.set(x, y, 9, x % 5 === 0 ? 'white_concrete' : 'glass');
    for (let z = 2; z <= 7; z++) for (let y = 2; y <= 3; y++) b.set(17, y, z, 'glass');
    for (let x = 3; x <= 6; x++) b.set(x, 2, 0, 'glass').set(x, 3, 0, 'glass');
    b.fill(0, 5, 0, 17, 5, 9, 'gray_concrete');
    b.fill(1, 5, 1, 16, 5, 8, 'white_concrete');
    b.fill(-1, 5, 10, 18, 5, 10, 'gray_concrete');
    b.walls(5, 6, 1, 16, 9, 8, 'white_concrete');
    for (let x = 6; x <= 15; x++) for (let y = 7; y <= 8; y++) b.set(x, y, 8, 'glass');
    for (let z = 2; z <= 7; z++) for (let y = 7; y <= 8; y++) b.set(16, y, z, 'glass');
    b.fill(4, 10, 0, 17, 10, 9, 'gray_concrete');
    b.fill(5, 10, 1, 16, 10, 8, 'black_concrete');
    for (let x = 0; x <= 4; x++) b.set(x, 6, 9, 'glass_pane');
    for (let z = 1; z <= 9; z++) b.set(0, 6, z, 'glass_pane');
    b.set(1, 6, 2, 'lantern').set(3, 6, 7, 'lantern');
    b.set(9, 1, 9, 'white_concrete').set(10, 1, 9, 'spruce_door_lower').set(10, 2, 9, 'spruce_door_upper').set(11, 1, 9, 'white_concrete');
    b.fill(2, 0, 12, 13, 0, 17, 'quartz_block');
    b.fill(3, 0, 13, 12, 0, 16, 'water');
    b.fill(3, -1, 13, 12, -1, 16, 'sea_lantern');
    b.fill(14, 0, 11, 21, 0, 17, 'smooth_stone');
    b.set(15, 1, 15, 'quartz_slab').set(16, 1, 15, 'quartz_slab').set(18, 1, 15, 'quartz_slab').set(19, 1, 15, 'quartz_slab');
    b.set(20, 1, 12, 'lantern').set(14, 1, 12, 'lantern');
    for (const [x, z] of [[19, 3], [21, 7], [-1, 14], [22, 18]]) {
      b.fill(x, 1, z, x, 3, z, 'birch_log');
      b.ball(x, 5, z, 2, 'azalea_leaves', 0.9, rng(x * 31 + z));
    }
    b.fill(1, 1, 1, 3, 1, 1, 'gray_concrete');
    b.set(14, 1, 2, 'bookshelf').set(15, 1, 2, 'bookshelf').set(8, 1, 4, 'quartz_slab').set(9, 1, 4, 'quartz_slab');
    b.set(8, 6, 4, 'red_bed_head').set(8, 6, 5, 'red_bed_foot');
    return b.done();
  }

  function mushroomCottage() {
    const b = builder();
    const r = rng(42);
    b.disk(0, 0, 0, 7, 'grass_block');
    b.disk(0, 0, 0, 3, 'oak_planks');
    for (let y = 1; y <= 5; y++) b.ring(0, y, 0, 3, 'mushroom_stem');
    b.set(0, 1, 3, 'oak_door_lower').set(0, 2, 3, 'oak_door_upper');
    b.set(3, 3, 0, 'glass_pane').set(-3, 3, 0, 'glass_pane').set(0, 3, -3, 'glass_pane');
    for (let y = 6; y <= 9; y++) {
      const rad = [6, 6, 5, 3][y - 6];
      b.disk(0, y, 0, rad, 'red_mushroom_block');
      if (y < 9) b.disk(0, y, 0, rad - 2, null);
    }
    b.disk(0, 6, 0, 2, 'mushroom_stem');
    b.disk(0, 10, 0, 1, 'red_mushroom_block');
    b.set(0, 5, 0, 'hanging_lantern');
    b.set(-1, 1, -2, 'crafting_table').set(1, 1, -2, 'bookshelf').set(2, 1, -1, 'cauldron');
    for (let i = 0; i < 18; i++) {
      const a = r() * Math.PI * 2, d = 4.4 + r() * 2.4;
      const x = Math.round(Math.cos(a) * d), z = Math.round(Math.sin(a) * d);
      if (x === 0 && z > 2) continue;
      if (!b.get(x, 1, z)) b.set(x, 1, z, ['poppy', 'dandelion', 'cornflower', 'short_grass'][i % 4]);
    }
    b.set(0, 0, 4, 'coarse_dirt').set(0, 0, 5, 'coarse_dirt').set(0, 0, 6, 'coarse_dirt').set(0, 0, 7, 'coarse_dirt');
    b.set(2, 1, 5, 'lantern').set(-2, 1, 5, 'lantern');
    return b.done();
  }

  function medievalWatchtower() {
    const b = builder();
    const r = rng(11);
    b.fill(-1, 0, -1, 7, 0, 7, 'cobblestone');
    for (let y = 1; y <= 13; y++) {
      b.walls(0, y, 0, 6, y, 6, 'stone_bricks');
      for (let x = 0; x <= 6; x++) for (const z of [0, 6]) { const p = r(); if (p < 0.15) b.set(x, y, z, 'mossy_stone_bricks'); else if (p < 0.22) b.set(x, y, z, 'cracked_stone_bricks'); }
      b.corners(0, 0, 6, 6, y, y, y < 4 ? 'cobblestone' : 'stone_bricks');
    }
    b.set(3, 1, 6, 'spruce_door_lower').set(3, 2, 6, 'spruce_door_upper');
    for (const y of [5, 9]) { b.set(3, y, 0, null).set(3, y, 6, null).set(0, y, 3, null).set(6, y, 3, null); b.set(3, y + 1, 0, null).set(3, y + 1, 6, null); }
    for (let y = 1; y <= 14; y++) b.set(1, y, 1, 'ladder');
    b.fill(1, 7, 2, 5, 7, 5, 'spruce_planks');
    b.fill(-1, 14, -1, 7, 14, 7, 'spruce_planks');
    b.set(1, 14, 1, 'spruce_trapdoor');
    for (let x = -1; x <= 7; x++) for (const z of [-1, 7]) { b.set(x, 15, z, x % 2 === 0 ? 'stone_bricks' : 'stone_brick_slab'); b.set(z, 15, x, x % 2 === 0 ? 'stone_bricks' : 'stone_brick_slab'); }
    b.corners(-1, -1, 7, 7, 15, 17, 'spruce_log');
    for (let i = 0; i <= 4; i++) b.walls(-2 + i, 18 + i, -2 + i, 8 - i, 18 + i, 8 - i, 'spruce_planks');
    b.set(3, 23, 3, 'spruce_fence').set(3, 24, 3, 'red_wool');
    b.set(3, 17, 3, 'hanging_lantern').set(1, 15, 5, 'barrel').set(5, 15, 5, 'barrel');
    b.set(3, 3, 3, 'hanging_lantern');
    b.fill(-3, 0, -3, 9, 0, 9, 'grass_block');
    b.fill(-1, 0, -1, 7, 0, 7, 'cobblestone');
    b.fill(3, 0, 8, 3, 0, 9, 'coarse_dirt');
    return b.done();
  }

  function lighthouse() {
    const b = builder();
    const r = rng(5);
    b.disk(0, 0, 0, 7, 'stone');
    for (let dx = -7; dx <= 7; dx++) for (let dz = -7; dz <= 7; dz++) if (b.get(dx, 0, dz) && r() < 0.35) b.set(dx, 0, dz, 'cobblestone');
    b.disk(0, 0, 0, 4, 'stone_bricks');
    for (let y = 1; y <= 18; y++) {
      const rad = y < 7 ? 4 : y < 13 ? 3 : 3;
      b.ring(0, y, 0, rad, Math.floor((y - 1) / 3) % 2 === 0 ? 'white_concrete' : 'red_concrete');
    }
    b.set(0, 1, 4, 'spruce_door_lower').set(0, 2, 4, 'spruce_door_upper');
    for (const y of [5, 10, 15]) b.set(0, y, y < 7 ? 4 : 3, 'glass_pane').set(0, y, y < 7 ? -4 : -3, 'glass_pane');
    for (let y = 1; y <= 19; y++) b.set(0, y, -1, 'ladder');
    b.disk(0, 19, 0, 4, 'polished_andesite');
    b.ring(0, 20, 0, 4, 'iron_bars');
    b.set(0, 19, -1, 'ladder');
    for (let y = 20; y <= 22; y++) b.ring(0, y, 0, 2, 'glass');
    b.fill(0, 20, 0, 0, 21, 0, 'sea_lantern');
    b.set(0, 22, 0, 'glowstone');
    b.disk(0, 23, 0, 3, 'black_concrete');
    b.disk(0, 24, 0, 2, 'black_concrete');
    b.disk(0, 25, 0, 1, 'black_concrete');
    b.set(0, 26, 0, 'iron_bars').set(0, 27, 0, 'lightning_rod' in window.BLOCKS ? 'lightning_rod' : 'iron_bars');
    for (let i = 0; i < 9; i++) { const a = r() * Math.PI * 2; const x = Math.round(Math.cos(a) * 6), z = Math.round(Math.sin(a) * 6); b.set(x, 1, z, r() < 0.5 ? 'cobblestone' : 'mossy_cobblestone'); }
    b.set(3, 1, 5, 'barrel').set(-3, 1, 5, 'lantern');
    return b.done();
  }

  function undergroundBunker() {
    const b = builder();
    b.fill(0, 0, 0, 12, 0, 9, 'deepslate_tiles');
    b.walls(0, 1, 0, 12, 4, 9, 'deepslate_bricks');
    b.fill(0, 5, 0, 12, 5, 9, 'polished_deepslate');
    b.fill(1, 0, 1, 11, 0, 8, 'polished_deepslate');
    for (const x of [3, 6, 9]) b.set(x, 5, 4, 'sea_lantern').set(x, 5, 5, 'sea_lantern');
    b.fill(1, 1, 1, 4, 1, 1, 'chest');
    b.fill(1, 2, 1, 4, 2, 1, 'barrel');
    b.set(6, 1, 1, 'furnace').set(7, 1, 1, 'furnace').set(8, 1, 1, 'crafting_table').set(9, 1, 1, 'anvil');
    b.fill(11, 1, 2, 11, 3, 5, 'bookshelf');
    b.set(1, 1, 7, 'red_bed_foot').set(1, 1, 8, 'red_bed_head');
    b.set(3, 1, 7, 'red_bed_foot').set(3, 1, 8, 'red_bed_head');
    b.fill(5, 1, 4, 7, 1, 5, 'red_carpet');
    b.set(10, 1, 8, 'cauldron').set(9, 1, 8, 'composter');
    for (let y = 1; y <= 10; y++) b.set(11, y, 7, 'ladder');
    b.walls(10, 6, 6, 12, 10, 8, 'stone_bricks');
    b.set(11, 6, 7, 'ladder');
    for (let y = 6; y <= 10; y++) b.set(11, y, 7, 'ladder');
    b.fill(-1, 6, -1, 13, 9, 10, 'stone');
    b.fill(10, 6, 6, 12, 9, 8, 'stone_bricks');
    for (let y = 6; y <= 9; y++) b.set(11, y, 7, 'ladder');
    b.fill(-1, 10, -1, 13, 10, 10, 'dirt');
    b.fill(-1, 11, -1, 13, 11, 10, 'grass_block');
    b.set(11, 10, 7, 'ladder').set(11, 11, 7, 'spruce_trapdoor');
    // cut the earth away in front so the bunker roof shows; the layer view reveals the rooms
    b.fill(-1, 6, 5, 8, 11, 10, null);
    b.set(10, 12, 7, 'mossy_cobblestone').set(12, 12, 7, 'mossy_cobblestone').set(11, 12, 8, 'short_grass').set(12, 12, 2, 'poppy').set(2, 12, 2, 'short_grass').set(5, 12, 1, 'dandelion');
    return b.done();
  }

  function stoneWell() {
    const b = builder();
    const r = rng(3);
    b.fill(-1, 0, -1, 5, 0, 5, 'grass_block');
    b.fill(0, 0, 0, 4, 0, 4, 'cobblestone');
    b.walls(0, 1, 0, 4, 1, 4, 'cobblestone');
    for (let x = 0; x <= 4; x++) for (let z = 0; z <= 4; z++) if (b.get(x, 1, z) && r() < 0.35) b.set(x, 1, z, 'mossy_cobblestone');
    b.fill(1, 1, 1, 3, 1, 3, 'water');
    b.fill(1, 0, 1, 3, 0, 3, 'water');
    b.fill(0, 2, 2, 0, 3, 2, 'oak_fence').fill(4, 2, 2, 4, 3, 2, 'oak_fence');
    b.fill(0, 4, 1, 4, 4, 3, 'spruce_slab');
    b.fill(0, 4, 2, 4, 4, 2, 'spruce_planks');
    b.set(2, 3, 2, 'hanging_lantern');
    b.set(-1, 1, 5, 'poppy').set(5, 1, 0, 'dandelion');
    return b.done();
  }

  function streetLamp() {
    const b = builder();
    b.fill(0, 0, 0, 6, 0, 2, 'smooth_stone');
    b.set(1, 1, 1, 'stone_bricks').set(1, 2, 1, 'stone_brick_slab');
    b.fill(1, 2, 1, 1, 6, 1, 'dark_oak_fence');
    b.set(1, 1, 1, 'stone_bricks');
    b.set(2, 6, 1, 'dark_oak_fence').set(2, 5, 1, 'hanging_lantern');
    b.set(1, 7, 1, 'dark_oak_slab');
    b.set(3, 1, 1, 'spruce_fence').set(5, 1, 1, 'spruce_fence');
    b.fill(3, 2, 1, 5, 2, 1, 'spruce_slab');
    b.fill(3, 2, 2, 5, 2, 2, 'spruce_slab');
    b.fill(3, 3, 2, 5, 3, 2, 'spruce_fence');
    b.set(6, 1, 0, 'barrel').set(0, 1, 2, 'poppy').set(6, 1, 2, 'cornflower');
    return b.done();
  }

  function gardenFountain() {
    const b = builder();
    const r = rng(9);
    b.fill(-1, 0, -1, 9, 0, 9, 'grass_block');
    b.fill(0, 0, 0, 8, 0, 8, 'stone_bricks');
    b.walls(0, 1, 0, 8, 1, 8, 'stone_brick_slab');
    b.corners(0, 0, 8, 8, 1, 1, 'stone_bricks');
    b.fill(1, 1, 1, 7, 1, 7, 'water');
    b.fill(3, 1, 3, 5, 1, 5, 'stone_bricks');
    b.fill(4, 2, 4, 4, 3, 4, 'quartz_block');
    b.walls(3, 4, 3, 5, 4, 5, 'quartz_slab');
    b.set(4, 4, 4, 'sea_lantern').set(4, 5, 4, 'water');
    for (const [x, z] of [[3, 4], [5, 4], [4, 3], [4, 5]]) b.set(x, 3, z, 'water');
    for (let i = 0; i < 16; i++) {
      const x = Math.floor(r() * 11) - 1, z = Math.floor(r() * 11) - 1;
      if (x >= 0 && x <= 8 && z >= 0 && z <= 8) continue;
      b.set(x, 1, z, ['poppy', 'dandelion', 'cornflower', 'short_grass'][i % 4]);
    }
    for (const [x, z] of [[-1, -1], [9, -1], [-1, 9], [9, 9]]) b.set(x, 1, z, 'lantern');
    return b.done();
  }

  function bigOakTree() {
    const b = builder();
    const r = rng(77);
    b.disk(0, 0, 0, 5, 'grass_block');
    b.fill(0, 1, 0, 0, 8, 0, 'oak_log');
    b.set(1, 1, 0, 'oak_log').set(-1, 1, 0, 'oak_log').set(0, 1, 1, 'oak_log').set(0, 1, -1, 'oak_log');
    const branches = [[1, 0, 5], [-1, 0, 6], [0, 1, 6], [0, -1, 7]];
    for (const [dx, dz, y] of branches) { b.set(dx, y, dz, 'oak_log'); b.set(dx * 2, y + 1, dz * 2, 'oak_log'); }
    b.ball(0, 9, 0, 3, 'oak_leaves', 0.92, r);
    for (const [dx, dz, y] of branches) b.ball(dx * 3, y + 2, dz * 3, 2, 'oak_leaves', 0.85, r);
    for (let i = 0; i < 8; i++) { const a = r() * 6.28, d = 2 + r() * 3; b.set(Math.round(Math.cos(a) * d), 1, Math.round(Math.sin(a) * d), i % 3 ? 'short_grass' : 'poppy'); }
    return b.done();
  }

  function marketStall() {
    const b = builder();
    b.fill(0, 0, 0, 6, 0, 4, 'cobblestone');
    b.fill(1, 0, 1, 5, 0, 3, 'spruce_planks');
    b.corners(0, 0, 6, 4, 1, 3, 'spruce_fence');
    for (let x = 0; x <= 6; x++) for (let z = 0; z <= 4; z++) b.set(x, 4, z, x % 2 === 0 ? 'red_wool' : 'white_wool');
    for (let x = 0; x <= 6; x++) b.set(x, 3, 4, x % 2 === 0 ? 'red_carpet' : null);
    b.fill(1, 1, 3, 5, 1, 3, 'spruce_slab');
    b.set(1, 1, 3, 'barrel').set(5, 1, 3, 'barrel');
    b.set(2, 1, 1, 'hay_block').set(4, 1, 1, 'hay_block').set(3, 1, 1, 'chest').set(2, 2, 1, 'hay_block');
    b.set(3, 3, 2, 'hanging_lantern');
    b.set(0, 1, 5, 'composter').set(6, 1, 5, 'barrel');
    return b.done();
  }

  function wheatFarm() {
    const b = builder();
    b.fill(0, 0, 0, 10, 0, 10, 'oak_log');
    b.fill(1, 0, 1, 9, 0, 9, 'farmland');
    b.set(5, 0, 5, 'water');
    for (let x = 1; x <= 9; x++) for (let z = 1; z <= 9; z++) if (!(x === 5 && z === 5)) b.set(x, 1, z, 'wheat');
    b.set(5, 1, 5, 'oak_slab');
    b.walls(-1, 0, -1, 11, 0, 11, 'grass_block');
    b.walls(-1, 1, -1, 11, 1, 11, 'oak_fence');
    b.set(5, 1, 11, null);
    b.corners(-1, -1, 11, 11, 2, 2, 'lantern');
    b.set(5, 0, 12, 'coarse_dirt').set(5, 0, 13, 'coarse_dirt');
    b.set(3, 1, 12, 'composter').set(7, 1, 12, 'chest').set(8, 1, 12, 'barrel');
    b.fill(1, 0, 12, 9, 0, 13, 'grass_block');
    b.set(5, 0, 12, 'coarse_dirt').set(5, 0, 13, 'coarse_dirt');
    return b.done();
  }

  function ironFarm() {
    const b = builder();
    b.set(4, 0, 4, 'chest');
    b.set(5, 0, 4, 'chest');
    b.fill(3, 1, 3, 6, 1, 6, 'hopper');
    b.walls(2, 1, 2, 7, 1, 7, 'stone_bricks');
    b.fill(3, 2, 3, 6, 3, 6, null);
    b.walls(2, 2, 2, 7, 3, 7, 'glass');
    b.fill(3, 3, 3, 6, 3, 6, 'stone_brick_slab');
    b.set(4, 3, 4, 'lava').set(5, 3, 5, 'lava');
    b.fill(3, 3, 3, 6, 3, 6, null);
    b.fill(3, 3, 3, 6, 3, 3, 'lava');
    b.walls(2, 4, 2, 7, 6, 7, 'glass');
    b.fill(0, 7, 0, 9, 7, 9, 'stone_bricks');
    b.fill(3, 7, 3, 6, 7, 6, null);
    b.fill(1, 8, 1, 8, 8, 8, 'water');
    b.walls(0, 8, 0, 9, 8, 9, 'stone_bricks');
    b.fill(3, 8, 3, 6, 8, 6, null);
    b.walls(0, 9, 0, 9, 9, 9, 'glass');
    b.fill(2, 10, 2, 7, 10, 7, 'smooth_stone');
    b.walls(1, 11, 1, 8, 13, 8, 'glass');
    b.corners(1, 1, 8, 8, 11, 13, 'stone_bricks');
    b.set(3, 11, 3, 'red_bed_foot').set(3, 11, 2, 'red_bed_head');
    b.set(6, 11, 3, 'red_bed_foot').set(6, 11, 2, 'red_bed_head');
    b.set(3, 11, 6, 'composter').set(6, 11, 6, 'composter').set(4, 11, 7, 'red_bed_foot').set(5, 11, 7, 'red_bed_foot');
    b.fill(1, 14, 1, 8, 14, 8, 'smooth_stone_slab');
    b.set(4, 13, 4, 'hanging_lantern');
    b.corners(0, 0, 9, 9, 0, 6, 'stone_bricks');
    b.fill(3, 0, 3, 6, 0, 6, 'stone_bricks');
    b.set(4, 0, 4, 'chest').set(5, 0, 4, 'chest');
    return b.done();
  }

  function pistonDoor() {
    const b = builder();
    b.fill(0, 0, 0, 7, 0, 4, 'smooth_stone');
    b.fill(0, 1, 2, 7, 5, 2, 'stone_bricks');
    b.fill(3, 1, 2, 4, 2, 2, 'polished_andesite');
    b.set(2, 1, 2, 'sticky_piston').set(2, 2, 2, 'sticky_piston').set(5, 1, 2, 'sticky_piston').set(5, 2, 2, 'sticky_piston');
    b.fill(1, 1, 3, 6, 1, 3, 'redstone_wire');
    b.set(3, 1, 3, 'repeater').set(4, 1, 3, 'repeater');
    b.set(1, 2, 3, 'redstone_wire').set(6, 2, 3, 'redstone_wire');
    b.set(1, 1, 3, 'stone_bricks').set(6, 1, 3, 'stone_bricks');
    b.fill(1, 1, 4, 6, 1, 4, 'stone_bricks');
    b.set(0, 1, 3, 'redstone_torch').set(7, 1, 3, 'redstone_torch');
    b.set(1, 2, 1, 'stone_button').set(6, 2, 1, 'stone_button');
    b.set(1, 1, 1, 'stone_bricks').set(6, 1, 1, 'stone_bricks');
    b.fill(0, 6, 2, 7, 6, 2, 'stone_brick_slab');
    b.set(0, 6, 2, 'stone_bricks').set(7, 6, 2, 'stone_bricks');
    return b.done();
  }

  function wizardTower() {
    const b = builder();
    const r = rng(13);
    b.disk(0, 0, 0, 8, 'grass_block');
    for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) if (b.get(dx, 0, dz) && r() < 0.2) b.set(dx, 0, dz, 'moss_block');
    b.disk(0, 0, 0, 5, 'deepslate_tiles');
    for (let y = 1; y <= 20; y++) {
      b.ring(0, y, 0, 4, y < 4 ? 'mossy_stone_bricks' : 'deepslate_bricks');
      if (y % 7 === 0) b.disk(0, y, 0, 3, 'dark_oak_planks');
    }
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let y = 4; y <= 20; y++) {
      const v = b.get(dx, y, dz); if (v === 'deepslate_bricks' && r() < 0.18) b.set(dx, y, dz, 'stone_bricks');
    }
    b.set(0, 1, 4, 'spruce_door_lower').set(0, 2, 4, 'spruce_door_upper');
    for (const y of [5, 10, 16]) for (const [x, z] of [[0, -4], [4, 0], [-4, 0]]) { b.set(x, y, z, 'purple_stained_glass'); b.set(x, y + 1, z, 'purple_stained_glass'); }
    b.disk(0, 21, 0, 6, 'dark_oak_planks');
    b.ring(0, 22, 0, 6, 'dark_oak_fence');
    for (let i = 0; i < 10; i++) {
      const rad = Math.max(0, 5 - Math.floor(i / 2));
      if (rad > 0) b.ring(0, 23 + i, 0, rad, 'purpur_block'); else b.set(0, 23 + i, 0, 'amethyst_block');
    }
    b.set(0, 33, 0, 'amethyst_block').set(0, 34, 0, 'glowstone');
    b.set(0, 6, 0, 'bookshelf').set(1, 8, 2, 'bookshelf').set(-2, 8, 1, 'bookshelf').set(0, 8, -2, 'cauldron');
    for (const [x, y, z] of [[7, 14, 2], [-6, 18, -4], [3, 25, -8]]) { b.set(x, y, z, 'amethyst_block'); b.set(x, y + 1, z, 'amethyst_block'); b.set(x, y - 1, z, 'purple_stained_glass'); }
    b.set(0, 20, 0, 'hanging_lantern').set(0, 13, 0, 'hanging_lantern');
    for (let i = 0; i < 12; i++) { const a = r() * 6.28; const d = 6 + r() * 2; b.set(Math.round(Math.cos(a) * d), 1, Math.round(Math.sin(a) * d), ['cornflower', 'short_grass', 'poppy'][i % 3]); }
    return b.done();
  }

  /* ---------- catalog ---------- */

  window.CATALOG = [
    { id: 'starter-cabin', name: 'Starter Cabin', category: 'buildings', style: 'starter', size: 'small', difficulty: 'easy', rating: 4.8, votes: 312, popularity: 9800, added: '2026-09-28', free: true, gen: starterCabin,
      desc: { en: 'A cosy first-night shelter with bed, storage and a crafting corner. The perfect build to learn the 3D guide.', no: 'En koselig første-natt-hytte med seng, lager og et lite arbeidshjørne. Perfekt for å lære 3D-guiden.' } },
    { id: 'survival-house', name: 'Survival Family House', category: 'buildings', style: 'survival', size: 'medium', difficulty: 'medium', rating: 4.9, votes: 541, popularity: 15400, added: '2026-09-02', weekly: true, gen: survivalHouse,
      desc: { en: 'Two floors of cobblestone and oak with a brick chimney, bedrooms upstairs and a full workshop below.', no: 'To etasjer i brostein og eik med murpipe, soverom oppe og fullt verksted nede.' } },
    { id: 'modern-villa', name: 'Modern Pool Villa', category: 'buildings', style: 'modern', size: 'large', difficulty: 'hard', rating: 4.7, votes: 288, popularity: 12100, added: '2026-10-08', gen: modernVilla,
      desc: { en: 'Clean white concrete, floor-to-ceiling glass, a cantilevered upper floor and a lit infinity pool.', no: 'Rent hvitt betong, glassvegger fra gulv til tak, utkraget overetasje og opplyst basseng.' } },
    { id: 'mushroom-cottage', name: 'Mushroom Cottage', category: 'buildings', style: 'fantasy', size: 'medium', difficulty: 'medium', rating: 4.9, votes: 403, popularity: 13700, added: '2026-09-21', weekly: true, gen: mushroomCottage,
      desc: { en: 'A round stem house under a giant red cap, surrounded by a flower meadow.', no: 'Et rundt stilkhus under en gigantisk rød hatt, omgitt av en blomstereng.' } },
    { id: 'medieval-watchtower', name: 'Medieval Watchtower', category: 'buildings', style: 'medieval', size: 'medium', difficulty: 'medium', rating: 4.6, votes: 197, popularity: 7600, added: '2026-08-30', gen: medievalWatchtower,
      desc: { en: 'Weathered stone bricks, a lookout platform with battlements and a steep spruce roof.', no: 'Forvitrede steinmurstein, utkikksplattform med brystvern og bratt grantak.' } },
    { id: 'coastal-lighthouse', name: 'Coastal Lighthouse', category: 'buildings', style: 'survival', size: 'large', difficulty: 'medium', rating: 4.7, votes: 230, popularity: 8900, added: '2026-10-01', gen: lighthouse,
      desc: { en: 'A striped lighthouse with an internal ladder, iron-railed balcony and a glowing lantern room.', no: 'Et stripete fyrtårn med innvendig stige, balkong med rekkverk og et lysende lanternerom.' } },
    { id: 'underground-bunker', name: 'Underground Bunker', category: 'buildings', style: 'underground', size: 'medium', difficulty: 'hard', rating: 4.5, votes: 164, popularity: 6400, added: '2026-09-14', gen: undergroundBunker,
      desc: { en: 'A hidden deepslate base beneath the grass: storage wall, beds, library and a ladder shaft to a trapdoor.', no: 'En skjult dypskiferbase under gresset: lagervegg, senger, bibliotek og stigesjakt opp til en fallem.' } },
    { id: 'wizard-tower', name: 'Wizard Tower', category: 'buildings', style: 'fantasy', size: 'large', difficulty: 'hard', rating: 4.9, votes: 377, popularity: 14900, added: '2026-10-10', weekly: true, gen: wizardTower,
      desc: { en: 'A towering mage spire with purpur roof, floating amethyst crystals and three interior floors.', no: 'Et ruvende trollmannstårn med purpurtak, svevende ametystkrystaller og tre etasjer inni.' } },
    { id: 'stone-well', name: 'Village Well', category: 'decorations', style: 'medieval', size: 'small', difficulty: 'easy', rating: 4.6, votes: 150, popularity: 5200, added: '2026-08-12', free: true, gen: stoneWell,
      desc: { en: 'A mossy cobblestone well with a spruce roof and a hanging lantern. Done in five minutes.', no: 'En mosegrodd brosteinsbrønn med grantak og hengende lykt. Ferdig på fem minutter.' } },
    { id: 'street-lamp', name: 'Street Lamp & Bench', category: 'decorations', style: 'modern', size: 'small', difficulty: 'easy', rating: 4.4, votes: 98, popularity: 3100, added: '2026-09-05', gen: streetLamp,
      desc: { en: 'A dark oak street lamp with a park bench. Line your roads with it.', no: 'En gatelykt i mørk eik med parkbenk. Sett dem langs veiene dine.' } },
    { id: 'garden-fountain', name: 'Garden Fountain', category: 'decorations', style: 'natural', size: 'small', difficulty: 'easy', rating: 4.7, votes: 176, popularity: 6100, added: '2026-09-25', gen: gardenFountain,
      desc: { en: 'A stone basin with a quartz centrepiece, cascading water and flower beds.', no: 'Et steinbasseng med kvartsfontene, rennende vann og blomsterbed.' } },
    { id: 'big-oak-tree', name: 'Custom Oak Tree', category: 'decorations', style: 'natural', size: 'medium', difficulty: 'easy', rating: 4.5, votes: 133, popularity: 4700, added: '2026-08-21', gen: bigOakTree,
      desc: { en: 'A hand-shaped oak with branching limbs and a full canopy, much nicer than vanilla trees.', no: 'En håndformet eik med forgrenede grener og tett krone, mye finere enn vanlige trær.' } },
    { id: 'market-stall', name: 'Market Stall', category: 'decorations', style: 'medieval', size: 'small', difficulty: 'easy', rating: 4.5, votes: 112, popularity: 3900, added: '2026-10-05', gen: marketStall,
      desc: { en: 'A striped wool canopy over a spruce counter with barrels and hay. Build a whole market.', no: 'Et stripete ulltak over en disk i gran med tønner og høy. Bygg et helt marked.' } },
    { id: 'wheat-farm', name: 'Starter Wheat Farm', category: 'redstone', style: 'farms', size: 'small', difficulty: 'easy', rating: 4.6, votes: 205, popularity: 8200, added: '2026-08-08', free: true, gen: wheatFarm,
      desc: { en: 'A 9×9 hydrated field with one water source, fenced and lit so mobs stay out.', no: 'En 9×9 vannet åker med én vannkilde, inngjerdet og opplyst så mobs holder seg unna.' } },
    { id: 'iron-farm', name: 'Compact Iron Farm', category: 'redstone', style: 'farms', size: 'medium', difficulty: 'hard', rating: 4.8, votes: 266, popularity: 11300, added: '2026-09-18', gen: ironFarm,
      desc: { en: 'Villager pod on top, water drop to a lava blade and hoppers into double chests.', no: 'Landsbyboer-rom på toppen, vannfall ned til lavablad og trakter inn i doble kister.' } },
    { id: 'piston-door', name: '2×2 Piston Door', category: 'redstone', style: 'underground', size: 'small', difficulty: 'medium', rating: 4.4, votes: 121, popularity: 4300, added: '2026-10-03', gen: pistonDoor,
      desc: { en: 'A flush 2×2 sticky piston door with buttons on both sides. Wiring shown layer by layer.', no: 'En flat 2×2-dør med klebrige stempler og knapper på begge sider. Kablingen vises lag for lag.' } },
  ];

  const cache = new Map();
  window.getVoxels = (build) => {
    if (!cache.has(build.id)) cache.set(build.id, build.gen());
    return cache.get(build.id);
  };

  /* Materials. Upper door/bed halves are not counted (one item places both). */
  window.materialList = (vox, maxLayer = Infinity, onlyLayer = null) => {
    const counts = new Map();
    for (const [, y, , id] of vox.blocks) {
      if (onlyLayer !== null ? y !== onlyLayer : y > maxLayer) continue;
      const def = window.BLOCKS[id];
      if (!def || def.count === false) continue;
      counts.set(def.name, (counts.get(def.name) || 0) + 1);
    }
    return [...counts].map(([name, count]) => ({ name, count, id: Object.keys(window.BLOCKS).find((k) => window.BLOCKS[k].name === name) }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  };
})();
