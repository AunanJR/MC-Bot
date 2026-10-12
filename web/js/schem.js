/* Sponge Schematic v2 (.schem) export. Opens in Litematica, WorldEdit and the
 * Blueprint builder bot (POST /schematics). */
(function () {
  const DATA_VERSION = 3955; // Minecraft 1.21.1; newer versions upgrade it on load

  class NbtWriter {
    constructor() { this.buf = new Uint8Array(1 << 16); this.len = 0; }
    ensure(n) { if (this.len + n <= this.buf.length) return; let s = this.buf.length; while (s < this.len + n) s *= 2; const b = new Uint8Array(s); b.set(this.buf); this.buf = b; }
    u8(v) { this.ensure(1); this.buf[this.len++] = v & 255; }
    i16(v) { this.u8(v >> 8); this.u8(v); }
    i32(v) { this.u8(v >>> 24); this.u8(v >>> 16); this.u8(v >>> 8); this.u8(v); }
    str(s) { const b = new TextEncoder().encode(s); this.i16(b.length); this.ensure(b.length); this.buf.set(b, this.len); this.len += b.length; }
    tag(type, name) { this.u8(type); this.str(name); }
    int(name, v) { this.tag(3, name); this.i32(v); }
    short(name, v) { this.tag(2, name); this.i16(v); }
    bytes(name, arr) { this.tag(7, name); this.i32(arr.length); this.ensure(arr.length); this.buf.set(arr, this.len); this.len += arr.length; }
    ints(name, arr) { this.tag(11, name); this.i32(arr.length); for (const v of arr) this.i32(v); }
    begin(name) { this.tag(10, name); }
    end() { this.u8(0); }
    emptyList(name) { this.tag(9, name); this.u8(0); this.i32(0); }
    result() { return this.buf.slice(0, this.len); }
  }

  function encode(vox) {
    const { x: W, y: H, z: L } = vox.size;
    const palette = new Map([['minecraft:air', 0]]);
    const grid = new Int32Array(W * H * L);
    for (const [x, y, z, id] of vox.blocks) {
      const state = (window.BLOCKS[id] && window.BLOCKS[id].mc) || 'minecraft:stone';
      if (!palette.has(state)) palette.set(state, palette.size);
      grid[x + z * W + y * W * L] = palette.get(state);
    }
    const data = [];
    for (let v of grid) { while (v & ~0x7f) { data.push((v & 0x7f) | 0x80); v >>>= 7; } data.push(v); }

    const w = new NbtWriter();
    w.begin('Schematic');
    w.int('Version', 2);
    w.int('DataVersion', DATA_VERSION);
    w.short('Width', W); w.short('Height', H); w.short('Length', L);
    w.ints('Offset', [0, 0, 0]);
    w.int('PaletteMax', palette.size);
    w.begin('Palette');
    for (const [state, idx] of palette) w.int(state, idx);
    w.end();
    w.bytes('BlockData', Uint8Array.from(data));
    w.emptyList('BlockEntities');
    w.end();
    return w.result();
  }

  async function gzip(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function download(build) {
    const bytes = await gzip(encode(window.getVoxels(build)));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url; a.download = build.id + '.schem';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  window.Schem = { encode, gzip, download };
})();
