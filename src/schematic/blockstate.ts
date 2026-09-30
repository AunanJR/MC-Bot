import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** A block state split into its id and its properties. */
export interface ParsedState {
  name: string;
  props: Record<string, string>;
}

/** Adds the `minecraft:` namespace when a block id has none. */
export function withNamespace(name: string): string {
  return name.includes(':') ? name : `minecraft:${name}`;
}

/** Strips the `minecraft:` namespace (other namespaces are kept). */
export function shortName(name: string): string {
  return name.startsWith('minecraft:') ? name.slice('minecraft:'.length) : name;
}

/** Parses `minecraft:oak_stairs[facing=east,half=top]`. */
export function parseState(state: string): ParsedState {
  const open = state.indexOf('[');
  if (open === -1) return { name: withNamespace(state.trim()), props: {} };
  const name = withNamespace(state.slice(0, open).trim());
  const body = state.slice(open + 1, state.lastIndexOf(']'));
  const props: Record<string, string> = {};
  for (const part of body.split(',')) {
    if (!part.trim()) continue;
    const eq = part.indexOf('=');
    props[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return { name, props };
}

/** Formats a state with its properties sorted by key, so equal states compare equal as strings. */
export function formatState(name: string, props: Record<string, string>): string {
  const keys = Object.keys(props).sort();
  if (keys.length === 0) return withNamespace(name);
  return `${withNamespace(name)}[${keys.map((k) => `${k}=${props[k]}`).join(',')}]`;
}

export function isAir(state: string): boolean {
  const name = parseState(state).name;
  return name === 'minecraft:air' || name === 'minecraft:cave_air' || name === 'minecraft:void_air';
}

interface McBlock {
  name: string;
  defaultState: number;
}

/**
 * Turns block states into their canonical form for one Minecraft version:
 * namespaced id plus every property, with defaults filled in for the ones
 * the source left out. Two canonical strings are equal iff the states are.
 */
export class StateCanonicalizer {
  private readonly blocksByName: Record<string, McBlock>;
  private readonly BlockClass: { fromStateId(id: number, biome: number): { getProperties(): Record<string, unknown> } };
  private readonly defaults = new Map<string, Record<string, string>>();
  private readonly cache = new Map<string, string>();

  constructor(readonly version: string) {
    const mcData = require('minecraft-data')(version);
    if (!mcData) throw new Error(`minecraft-data has no data for version ${version}`);
    this.blocksByName = mcData.blocksByName;
    this.BlockClass = require('prismarine-block')(mcData);
  }

  /** True when the version knows this block id. */
  knows(name: string): boolean {
    return Boolean(this.blocksByName[shortName(withNamespace(name))]);
  }

  defaultProps(name: string): Record<string, string> {
    const short = shortName(withNamespace(name));
    let props = this.defaults.get(short);
    if (!props) {
      const block = this.blocksByName[short];
      props = {};
      if (block) {
        const raw = this.BlockClass.fromStateId(block.defaultState, 0).getProperties();
        for (const [k, v] of Object.entries(raw)) props[k] = String(v);
      }
      this.defaults.set(short, props);
    }
    return props;
  }

  canonical(state: string): string {
    let out = this.cache.get(state);
    if (out === undefined) {
      const { name, props } = parseState(state);
      out = formatState(name, { ...this.defaultProps(name), ...props });
      this.cache.set(state, out);
    }
    return out;
  }

  /** Canonical state of a block read from the world by mineflayer. */
  fromWorldBlock(block: { name: string; getProperties(): Record<string, unknown> }): string {
    const props: Record<string, string> = {};
    for (const [k, v] of Object.entries(block.getProperties())) props[k] = String(v);
    return formatState(block.name, props);
  }
}
