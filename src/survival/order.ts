import { parseState } from '../schematic/blockstate.js';
import { BuildPhase, buildPhase } from '../schematic/blockinfo.js';
import type { Placement } from '../schematic/placement.js';

export interface PlacementGroup {
  label: string;
  placements: Placement[];
}

/**
 * Survival build order: bottom-up by layer; inside a layer solid blocks come
 * before gravity blocks (which need what is below them). Attachables (torches,
 * doors, buttons, plants...) come last, again bottom-up, once every block
 * they could hang on exists. Within a group the builder picks the nearest
 * block that has a neighbour to click, so supports get placed first.
 */
export function planSurvivalGroups(placements: Placement[]): PlacementGroup[] {
  const layers = new Map<number, { solid: Placement[]; gravity: Placement[] }>();
  const attach = new Map<number, Placement[]>();
  for (const p of placements) {
    const phase = buildPhase(parseState(p.state).name);
    if (phase === BuildPhase.Attachable) {
      let list = attach.get(p.y);
      if (!list) attach.set(p.y, (list = []));
      list.push(p);
      continue;
    }
    let layer = layers.get(p.y);
    if (!layer) layers.set(p.y, (layer = { solid: [], gravity: [] }));
    (phase === BuildPhase.Gravity ? layer.gravity : layer.solid).push(p);
  }
  const groups: PlacementGroup[] = [];
  for (const y of [...layers.keys()].sort((a, b) => a - b)) {
    const layer = layers.get(y)!;
    if (layer.solid.length) groups.push({ label: `layer ${y}`, placements: layer.solid });
    if (layer.gravity.length) groups.push({ label: `layer ${y} gravity`, placements: layer.gravity });
  }
  for (const y of [...attach.keys()].sort((a, b) => a - b)) {
    groups.push({ label: `attachables ${y}`, placements: attach.get(y)! });
  }
  return groups;
}
