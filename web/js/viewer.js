/* Interactive 3D guide: renders a voxel build with three.js, layer by layer.
 * Drag to rotate, scroll or pinch to zoom, right-drag or two fingers to pan. */
(function () {
  const T = window.THREE;

  /* ---------- procedural 16x16 textures ---------- */

  function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function seeded(seed) { let s = seed >>> 0 || 7; return () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296); }
  function hash(str) { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

  function paint(pattern, colorHex, face, id) {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const g = c.getContext('2d');
    const img = g.createImageData(16, 16);
    const base = rgb(colorHex);
    const R = seeded(hash(id + face));
    const px = (x, y, col, a = 255) => {
      if (x < 0 || y < 0 || x > 15 || y > 15) return;
      const i = (y * 16 + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, col[0])); img.data[i + 1] = Math.max(0, Math.min(255, col[1])); img.data[i + 2] = Math.max(0, Math.min(255, col[2])); img.data[i + 3] = a;
    };
    const sh = (col, f) => col.map((v) => v * f);
    const mix = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t);
    const fillNoise = (col, amt) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, sh(col, 1 - amt + R() * amt * 2)); };
    const voronoi = (col, cells, crack) => {
      const pts = Array.from({ length: cells }, () => [R() * 16, R() * 16, 0.85 + R() * 0.3]);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        let d1 = 99, d2 = 99, k = 0;
        for (let i = 0; i < pts.length; i++) for (const [ox, oy] of [[0, 0], [16, 0], [-16, 0], [0, 16], [0, -16]]) {
          const d = Math.hypot(x - pts[i][0] - ox, y - pts[i][1] - oy);
          if (d < d1) { d2 = d1; d1 = d; k = i; } else if (d < d2) d2 = d;
        }
        px(x, y, sh(col, d2 - d1 < 1.1 ? crack : pts[k][2] - R() * 0.08));
      }
    };
    const top = face === 'top', bottom = face === 'bottom';
    switch (pattern) {
      case 'grass':
        if (top) { fillNoise(base, 0.12); break; }
        fillNoise(base, 0.12);
        if (!bottom) { const gr = rgb('#6aa84f'); for (let x = 0; x < 16; x++) { const h = 2 + Math.floor(R() * 3); for (let y = 0; y < h; y++) px(x, y, sh(gr, 0.9 + R() * 0.2)); } }
        break;
      case 'farmland':
        fillNoise(base, 0.12);
        if (top) for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x++) px(x, y, sh(base, 0.65));
        break;
      case 'cobble': voronoi(base, 7, 0.55); break;
      case 'mossy': voronoi(base, 7, 0.55); for (let i = 0; i < 70; i++) px(Math.floor(R() * 16), Math.floor(R() * 16), sh(rgb('#5d7a2e'), 0.8 + R() * 0.3)); break;
      case 'bricks': case 'mossybricks': case 'smallbricks': {
        const small = pattern === 'smallbricks';
        const h = small ? 4 : 8, w = small ? 8 : 16;
        const mortar = small ? rgb('#b8ad9f') : sh(base, 0.62);
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
          const row = Math.floor(y / h), off = row % 2 ? w / 2 : 0;
          const edge = y % h === h - 1 || (x + off) % w === w - 1;
          px(x, y, edge ? mortar : sh(base, 0.92 + R() * 0.16));
        }
        if (pattern === 'mossybricks') for (let i = 0; i < 45; i++) px(Math.floor(R() * 16), Math.floor(R() * 16), sh(rgb('#5d7a2e'), 0.8 + R() * 0.3));
        break;
      }
      case 'tiles':
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, x % 8 === 7 || y % 8 === 7 ? sh(base, 0.6) : sh(base, 0.95 + R() * 0.1));
        break;
      case 'planks': case 'door': {
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
          const board = Math.floor(y / 4);
          const seam = y % 4 === 3 || (x === (board * 7 + 3) % 16);
          px(x, y, seam ? sh(base, 0.68) : sh(base, 0.9 + R() * 0.12 + (x % 5 === 0 ? -0.05 : 0)));
        }
        if (pattern === 'door' && !top && !bottom) for (let y = 2; y < 7; y++) for (let x = 3; x < 13; x++) if (x !== 8) px(x, y, rgb('#2c2116'));
        break;
      }
      case 'log':
        if (top || bottom) {
          for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
            const r = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
            const col = r > 6.5 ? rgb(colorHex) : sh(rgb(window.BLOCKS[id].top || colorHex), Math.floor(r) % 2 ? 0.85 : 1);
            px(x, y, sh(col, 0.95 + R() * 0.1));
          }
        } else for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, sh(base, (x % 4 === 0 ? 0.75 : 1) * (0.9 + R() * 0.15)));
        break;
      case 'birch':
        if (top || bottom) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, sh(rgb('#c4b27b'), 0.9 + R() * 0.15)); }
        else { fillNoise(base, 0.05); for (let i = 0; i < 6; i++) { const y = Math.floor(R() * 16), x = Math.floor(R() * 12); for (let k = 0; k < 2 + R() * 3; k++) px(x + k, y, rgb('#2a2a2a')); } }
        break;
      case 'leaves': case 'flowering':
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const r = R(); px(x, y, sh(base, 0.7 + r * 0.5), r < 0.12 ? 0 : 255); }
        if (pattern === 'flowering') for (let i = 0; i < 14; i++) px(Math.floor(R() * 16), Math.floor(R() * 16), rgb('#d58fd0'));
        break;
      case 'glass':
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
          const edge = x === 0 || y === 0 || x === 15 || y === 15;
          const streak = (x + y === 5 || x + y === 6 || x + y === 11);
          px(x, y, edge ? sh(base, 0.95) : mix(base, [255, 255, 255], 0.4), edge ? 230 : streak ? 120 : 45);
        }
        break;
      case 'bars':
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, sh(base, 0.9 + R() * 0.2), (x % 5 === 1 || y === 0 || y === 15) ? 255 : 0);
        break;
      case 'water': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, sh(base, 0.85 + 0.15 * Math.sin((x + y * 2) * 0.8) + R() * 0.08), 200); break;
      case 'lava': for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, mix(base, rgb('#ffd34a'), Math.max(0, Math.sin(x * 0.9 + y * 0.6) * 0.6 + R() * 0.3))); break;
      case 'wool': fillNoise(base, 0.06); for (let i = 0; i < 20; i++) px(Math.floor(R() * 16), Math.floor(R() * 16), sh(base, 0.85)); break;
      case 'mushroom':
        fillNoise(base, 0.08);
        for (const [cx, cy, r] of [[4, 4, 2], [11, 6, 2], [6, 12, 1.6], [13, 13, 1.2]]) for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (Math.hypot(x - cx, y - cy) <= r) px(x, y, rgb('#f0eadc'));
        break;
      case 'crystal':
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, sh(base, 0.8 + ((x * 3 + y * 5) % 7) / 14 + R() * 0.08));
        break;
      case 'glow':
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, mix(base, [255, 250, 230], R() * 0.45));
        break;
      case 'books': {
        const cols = ['#7a2d2d', '#2d4f7a', '#2d6a3a', '#7a6a2d', '#5a2d7a', '#2a2a2a'].map(rgb);
        if (top || bottom) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, sh(base, y % 4 === 3 ? 0.7 : 0.95 + R() * 0.1)); break; }
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
          if (y < 1 || y > 14 || y === 7 || y === 8) { px(x, y, sh(base, 0.85)); continue; }
          px(x, y, sh(cols[(Math.floor(x / 2) + (y > 7 ? 3 : 0)) % cols.length], 0.9 + R() * 0.15));
        }
        break;
      }
      case 'crafting':
        if (top) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, (x % 5 === 0 || y % 5 === 0) ? rgb('#4a3520') : sh(rgb('#a2834f'), 0.9 + R() * 0.15)); break; }
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, y < 3 ? rgb('#a2834f') : sh(base, 0.9 + R() * 0.15));
        for (let x = 3; x < 7; x++) px(x, 7, rgb('#9a9a9a')); for (let y = 5; y < 12; y++) px(11, y, rgb('#6b4b2a'));
        break;
      case 'furnace':
        fillNoise(base, 0.1);
        if (face === 'front' || face === 'side') for (let y = 9; y < 14; y++) for (let x = 4; x < 12; x++) px(x, y, y > 11 ? rgb('#e08a2c') : rgb('#1d1d1d'));
        break;
      case 'chest':
        fillNoise(base, 0.08);
        for (let x = 0; x < 16; x++) { px(x, 0, sh(base, 0.6)); px(x, 15, sh(base, 0.6)); px(x, 6, rgb('#3b2a14')); }
        if (!top && !bottom) for (let y = 5; y < 9; y++) for (let x = 7; x < 9; x++) px(x, y, rgb('#c9c9c9'));
        break;
      case 'barrel':
        if (top || bottom) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, (x === 0 || y === 0 || x === 15 || y === 15) ? sh(base, 0.6) : sh(rgb(window.BLOCKS[id].top || colorHex), 0.9 + R() * 0.1)); for (let x = 6; x < 10; x++) for (let y = 6; y < 10; y++) px(x, y, rgb('#2a1f12')); break; }
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, (y === 2 || y === 13) ? rgb('#4a4a4a') : sh(base, x % 4 === 0 ? 0.75 : 0.95 + R() * 0.1));
        break;
      case 'hay':
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, (!top && !bottom && (y === 4 || y === 11)) ? rgb('#7a2a1a') : sh(base, (x % 3 === 0 ? 0.85 : 1) * (0.9 + R() * 0.15)));
        break;
      case 'ladder':
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const rail = x === 2 || x === 3 || x === 12 || x === 13; const rung = y % 4 === 1 && x > 2 && x < 13; px(x, y, sh(base, 0.9 + R() * 0.1), rail || rung ? 255 : 0); }
        break;
      case 'crop':
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const stalk = (x % 4 === 1) && R() > 0.15; const head = y < 5 && x % 4 === 1; px(x, y, head ? rgb('#d9c25a') : sh(base, 0.8 + R() * 0.3), stalk || head ? 255 : 0); }
        break;
      case 'flower':
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
          const stem = x === 7 && y > 7; const leaf = (y === 11 && (x === 6 || x === 5)) || (y === 12 && (x === 8 || x === 9));
          const head = Math.hypot(x - 7, y - 5) < 2.6;
          px(x, y, head ? (Math.hypot(x - 7, y - 5) < 1 ? rgb('#3a2a10') : base) : rgb('#3f7a2a'), stem || leaf || head ? 255 : 0);
        }
        break;
      case 'piston':
        if (top) { fillNoise(rgb(window.BLOCKS[id].top), 0.1); for (let x = 0; x < 16; x++) { px(x, 0, rgb('#a2834f')); px(0, x, rgb('#a2834f')); px(15, x, rgb('#a2834f')); px(x, 15, rgb('#a2834f')); } break; }
        fillNoise(base, 0.1); for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) px(x, y, sh(rgb('#a2834f'), 0.9 + R() * 0.1));
        break;
      case 'smooth': fillNoise(base, 0.04); for (let i = 0; i < 16; i++) { px(i, 0, sh(base, 0.85)); px(i, 15, sh(base, 0.85)); px(0, i, sh(base, 0.85)); px(15, i, sh(base, 0.85)); } break;
      case 'flat': fillNoise(base, 0.025); break;
      default: fillNoise(base, 0.1);
    }
    g.putImageData(img, 0, 0);
    const tex = new T.CanvasTexture(c);
    tex.magFilter = T.NearestFilter;
    tex.minFilter = T.NearestFilter;
    tex.generateMipmaps = false;
    if ('colorSpace' in tex) tex.colorSpace = T.SRGBColorSpace;
    return tex;
  }

  /* ---------- geometry per shape ---------- */

  function crossGeometry(h = 1, w = 0.9) {
    const g = new T.BufferGeometry();
    const s = w / 2 / Math.SQRT2 * Math.SQRT2, y0 = -0.5, y1 = -0.5 + h;
    const quads = [[[-s, -s], [s, s]], [[-s, s], [s, -s]]];
    const pos = [], uv = [], nor = [];
    for (const [[ax, az], [bx, bz]] of quads) {
      pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az);
      uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
      for (let i = 0; i < 6; i++) nor.push(0, 1, 0);
    }
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    return g;
  }
  function box(w, h, d, dy = 0) { const g = new T.BoxGeometry(w, h, d); if (dy) g.translate(0, dy, 0); return g; }
  const GEOMS = {};
  function geom(shape) {
    if (GEOMS[shape]) return GEOMS[shape];
    const s = {
      cube: () => box(1, 1, 1),
      slab: () => box(1, 0.5, 1, -0.25),
      carpet: () => box(1, 0.0625, 1, -0.46875),
      farmland: () => box(1, 0.9375, 1, -0.03125),
      water: () => box(1, 0.875, 1, -0.0625),
      post: () => box(0.25, 1, 0.25),
      wall: () => box(0.5, 1, 0.5),
      pane: () => box(1, 1, 0.125),
      door: () => box(1, 1, 0.1875),
      ladder: () => box(1, 1, 0.0625),
      small: () => box(0.375, 0.4375, 0.375, -0.28125),
      hanging: () => box(0.375, 0.4375, 0.375, -0.05),
      torch: () => box(0.125, 0.625, 0.125, -0.1875),
      chest: () => box(0.875, 0.875, 0.875, -0.0625),
      bed: () => box(1, 0.5625, 1, -0.21875),
      repeater: () => box(1, 0.125, 1, -0.4375),
      button: () => box(0.375, 0.125, 0.25, -0.4375),
      crop: () => crossGeometry(1, 0.95),
      flower: () => crossGeometry(0.8, 0.8),
    }[shape] || (() => box(1, 1, 1));
    return (GEOMS[shape] = s());
  }

  /* ---------- materials ---------- */

  const MATS = {};
  function materials(id, variant) {
    const k = id + ':' + variant;
    if (MATS[k]) return MATS[k];
    const def = window.BLOCKS[id] || { color: '#ff00ff', pattern: 'noise' };
    const cross = def.shape === 'crop' || def.shape === 'flower';
    const make = (face) => {
      const map = paint(def.pattern, face === 'top' && def.top && def.pattern !== 'log' && def.pattern !== 'barrel' && def.pattern !== 'piston' ? def.top : def.color, face, id);
      const m = new T.MeshLambertMaterial({ map });
      if (def.transparent || cross || def.pattern === 'leaves' || def.pattern === 'flowering') {
        if (def.pattern === 'glass' || def.shape === 'water') { m.transparent = true; m.depthWrite = false; m.opacity = def.opacity ?? 1; }
        else m.alphaTest = 0.4;
      }
      if (cross || def.shape === 'ladder') m.side = T.DoubleSide;
      if (def.emissive) { m.emissive = new T.Color(0xffffff); m.emissiveMap = map; m.emissiveIntensity = 0.55; }
      if (variant === 'below') m.color = new T.Color(0x9a9aa2);
      return m;
    };
    let mats;
    if (cross) mats = make('side');
    else {
      const side = make('side'), topM = make('top'), bot = def.pattern === 'grass' ? make('bottom') : (def.top ? topM : make('bottom'));
      mats = [side, side, topM, bot, side, side];
    }
    return (MATS[k] = mats);
  }
  const GHOST = new T.MeshBasicMaterial({ color: 0x8fb3ff, transparent: true, opacity: 0.09, depthWrite: false });
  const LOCKED = new T.MeshBasicMaterial({ color: 0xb48cff, transparent: true, opacity: 0.16, depthWrite: false });

  /* ---------- voxel preparation (positions + orientation) ---------- */

  function prepare(vox) {
    const occ = new Set(vox.blocks.map(([x, y, z, id]) => { const s = window.BLOCKS[id]?.shape; return (!s || s === 'cube' || s === 'slab' || s === 'pane' || s === 'door' || s === 'farmland') ? x + ',' + y + ',' + z : null; }).filter(Boolean));
    const solid = (x, y, z) => occ.has(x + ',' + y + ',' + z);
    const ox = vox.size.x / 2, oz = vox.size.z / 2;
    const tmp = new T.Object3D();
    return vox.blocks.map(([x, y, z, id], index) => {
      const def = window.BLOCKS[id] || {};
      const shape = def.shape || 'cube';
      tmp.position.set(x - ox + 0.5, y + 0.5, z - oz + 0.5);
      tmp.rotation.set(0, 0, 0);
      if (shape === 'pane' || shape === 'door') {
        const alongX = solid(x - 1, y, z) || solid(x + 1, y, z);
        const alongZ = solid(x, y, z - 1) || solid(x, y, z + 1);
        if (!alongX && alongZ) tmp.rotation.y = Math.PI / 2;
      } else if (shape === 'ladder') {
        const dirs = [[0, -1, 0], [0, 1, 0], [-1, 0, Math.PI / 2], [1, 0, Math.PI / 2]];
        const d = dirs.find(([dx, dz]) => solid(x + dx, y, z + dz)) || dirs[0];
        tmp.rotation.y = d[2];
        tmp.position.x += d[0] * 0.46; tmp.position.z += d[1] * 0.46;
      }
      tmp.updateMatrix();
      return { x, y, z, id, shape, index, matrix: tmp.matrix.clone() };
    });
  }

  /* ---------- viewer ---------- */

  class Viewer {
    constructor(container, vox, opts = {}) {
      this.el = container;
      this.vox = vox;
      this.opts = Object.assign({ unlocked: Infinity, autoRotate: false, onHover: null, onChange: null, background: null }, opts);
      this.items = prepare(vox);
      this.height = vox.size.y;
      this.layer = this.height - 1;
      this.mode = 'stack';
      this.ghost = true;
      this.full = true;

      this.renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      if ('outputColorSpace' in this.renderer) this.renderer.outputColorSpace = T.SRGBColorSpace;
      this.canvas = this.renderer.domElement;
      this.canvas.className = 'viewer-canvas';
      container.appendChild(this.canvas);

      this.scene = new T.Scene();
      this.scene.add(new T.HemisphereLight(0xffffff, 0x6a6a7a, 1.9));
      const sun = new T.DirectionalLight(0xffffff, 1.9); sun.position.set(0.6, 1, 0.35); this.scene.add(sun);
      const fill = new T.DirectionalLight(0xbfd4ff, 0.6); fill.position.set(-0.7, 0.4, -0.6); this.scene.add(fill);

      this.camera = new T.PerspectiveCamera(40, 1, 0.1, 2000);
      const { x: w, y: h, z: l } = vox.size;
      this.radius = Math.sqrt(w * w + h * h + l * l) / 2;
      this.target = new T.Vector3(0, h / 2, 0);
      this.theta = Math.PI / 4; this.phi = 1.05; this.dist = this.radius / Math.sin((40 * Math.PI) / 360) * 1.05;
      this.minDist = 2; this.maxDist = this.dist * 3;

      const grid = new T.GridHelper(Math.max(w, l) + 6, Math.max(w, l) + 6, 0x6c7bd1, 0x3a3f5c);
      grid.material.transparent = true; grid.material.opacity = 0.35;
      grid.position.y = -0.002;
      if ((w + l) % 2) grid.position.x = grid.position.z = 0.5;
      this.scene.add(grid);

      this.layerPlane = new T.Mesh(new T.PlaneGeometry(w + 0.6, l + 0.6), new T.MeshBasicMaterial({ color: 0x7c9cff, transparent: true, opacity: 0.12, depthWrite: false, side: T.DoubleSide }));
      this.layerPlane.rotation.x = -Math.PI / 2;
      this.scene.add(this.layerPlane);

      this.hoverBox = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(1.02, 1.02, 1.02)), new T.LineBasicMaterial({ color: 0xffffff }));
      this.hoverBox.visible = false;
      this.scene.add(this.hoverBox);

      this.group = new T.Group();
      this.scene.add(this.group);
      this.raycaster = new T.Raycaster();
      this.pointer = new T.Vector2();

      this.bindControls();
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(container);
      this.resize();
      this.rebuild();
      this.loop = this.loop.bind(this);
      this.raf = requestAnimationFrame(this.loop);
    }

    setUnlocked(n) { this.opts.unlocked = n; this.rebuild(); }
    setLayer(n) { this.layer = Math.max(0, Math.min(this.height - 1, n)); this.full = false; this.rebuild(); }
    showFull() { this.full = true; this.layer = this.height - 1; this.rebuild(); }
    setMode(m) { this.mode = m; this.rebuild(); }
    setGhost(on) { this.ghost = on; this.rebuild(); }

    rebuild() {
      for (const c of [...this.group.children]) { this.group.remove(c); c.dispose?.(); }
      const groups = new Map();
      const add = (key, item, mat) => { if (!groups.has(key)) groups.set(key, { mat, shape: item.shape, items: [] }); groups.get(key).items.push(item); };
      const unlocked = this.opts.unlocked;
      for (const it of this.items) {
        const locked = it.y >= unlocked;
        if (this.full) { add(it.id + ':cur', it, materials(it.id, 'cur')); continue; }
        if (it.y === this.layer) {
          if (locked) add('locked:' + it.shape, it, LOCKED); else add(it.id + ':cur', it, materials(it.id, 'cur'));
        } else if (it.y < this.layer) {
          if (this.mode === 'single') { if (it.y === this.layer - 1 && this.ghost) add('ghost:' + it.shape, it, GHOST); }
          else if (locked) add('locked:' + it.shape, it, LOCKED);
          else add(it.id + ':below', it, materials(it.id, 'below'));
        } else if (this.ghost && this.mode !== 'single') add('ghost:' + it.shape, it, GHOST);
      }
      for (const [key, g] of groups) {
        const mesh = new T.InstancedMesh(geom(g.shape), g.mat, g.items.length);
        g.items.forEach((it, i) => mesh.setMatrixAt(i, it.matrix));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.userData.items = g.items;
        mesh.userData.pick = !key.startsWith('ghost') && !key.startsWith('locked');
        if (key.startsWith('ghost') || key.startsWith('locked')) mesh.renderOrder = 2;
        else if (g.mat.transparent || (Array.isArray(g.mat) && g.mat[0].transparent)) mesh.renderOrder = 1;
        this.group.add(mesh);
      }
      this.layerPlane.visible = !this.full;
      this.layerPlane.position.y = this.layer + 0.004;
      this.hoverBox.visible = false;
      this.dirty = true;
      this.opts.onChange?.(this);
    }

    bindControls() {
      const c = this.canvas;
      const pts = new Map();
      let last = null, button = 0, moved = 0, pinch = 0;
      c.addEventListener('contextmenu', (e) => e.preventDefault());
      c.addEventListener('pointerdown', (e) => {
        c.setPointerCapture(e.pointerId);
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        last = { x: e.clientX, y: e.clientY }; button = e.button; moved = 0;
        this.opts.autoRotate = false;
        if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
      });
      c.addEventListener('pointermove', (e) => {
        if (!pts.has(e.pointerId)) { this.hover(e); return; }
        const prev = pts.get(e.pointerId);
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinch) this.zoom(pinch / d);
          pinch = d;
          this.pan((e.clientX - prev.x) / 2, (e.clientY - prev.y) / 2);
          return;
        }
        const dx = e.clientX - last.x, dy = e.clientY - last.y;
        last = { x: e.clientX, y: e.clientY };
        moved += Math.abs(dx) + Math.abs(dy);
        if (button === 2 || e.shiftKey) this.pan(dx, dy);
        else { this.theta -= dx * 0.008; this.phi = Math.max(0.12, Math.min(Math.PI / 2 - 0.02, this.phi - dy * 0.008)); }
        this.dirty = true;
        this.hoverBox.visible = false;
        this.opts.onHover?.(null);
      });
      const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; if (moved < 4 && e.pointerType !== 'mouse') this.hover(e); };
      c.addEventListener('pointerup', up);
      c.addEventListener('pointercancel', up);
      c.addEventListener('pointerleave', () => { if (!pts.size) { this.hoverBox.visible = false; this.dirty = true; this.opts.onHover?.(null); } });
      c.addEventListener('wheel', (e) => { e.preventDefault(); this.opts.autoRotate = false; this.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
    }
    zoom(f) { this.dist = Math.max(this.minDist, Math.min(this.maxDist, this.dist * f)); this.dirty = true; }
    pan(dx, dy) {
      const s = this.dist * 0.0016;
      const right = new T.Vector3(Math.cos(this.theta), 0, -Math.sin(this.theta));
      this.target.addScaledVector(right, -dx * s);
      this.target.y += dy * s;
      this.dirty = true;
    }
    resetView() { this.theta = Math.PI / 4; this.phi = 1.05; this.dist = this.radius / Math.sin((40 * Math.PI) / 360) * 1.05; this.target.set(0, this.height / 2, 0); this.dirty = true; }
    hover(e) {
      if (!this.opts.onHover) return;
      const r = this.canvas.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.group.children.filter((m) => m.userData.pick), false);
      const hit = hits.find((h) => h.instanceId !== undefined);
      if (!hit) { this.hoverBox.visible = false; this.dirty = true; this.opts.onHover(null); return; }
      const it = hit.object.userData.items[hit.instanceId];
      this.hoverBox.position.set(it.x - this.vox.size.x / 2 + 0.5, it.y + 0.5, it.z - this.vox.size.z / 2 + 0.5);
      this.hoverBox.visible = true; this.dirty = true;
      this.opts.onHover(it, e.clientX - r.left, e.clientY - r.top);
    }
    resize() {
      const w = this.el.clientWidth || 300, h = this.el.clientHeight || 300;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
      this.dirty = true;
    }
    loop() {
      this.raf = requestAnimationFrame(this.loop);
      if (this.opts.autoRotate) { this.theta += 0.004; this.dirty = true; }
      if (!this.dirty) return;
      this.dirty = false;
      const sp = Math.sin(this.phi);
      this.camera.position.set(this.target.x + this.dist * sp * Math.sin(this.theta), this.target.y + this.dist * Math.cos(this.phi), this.target.z + this.dist * sp * Math.cos(this.theta));
      this.camera.lookAt(this.target);
      this.renderer.render(this.scene, this.camera);
    }
    destroy() {
      cancelAnimationFrame(this.raf);
      this.ro.disconnect();
      for (const c of [...this.group.children]) c.dispose?.();
      this.renderer.dispose();
      this.renderer.forceContextLoss?.();
      this.canvas.remove();
    }
  }

  /* ---------- thumbnails (one shared renderer, rendered to data URLs) ---------- */

  let thumbRenderer = null;
  const thumbs = new Map();
  function thumbnail(build) {
    if (thumbs.has(build.id)) return thumbs.get(build.id);
    if (!thumbRenderer) {
      thumbRenderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      thumbRenderer.setPixelRatio(1);
      thumbRenderer.setSize(480, 360, false);
      if ('outputColorSpace' in thumbRenderer) thumbRenderer.outputColorSpace = T.SRGBColorSpace;
    }
    const vox = window.getVoxels(build);
    const scene = new T.Scene();
    scene.add(new T.HemisphereLight(0xffffff, 0x6a6a7a, 1.9));
    const fill = new T.DirectionalLight(0xbfd4ff, 0.6); fill.position.set(-0.7, 0.4, -0.6); scene.add(fill);
    const sun = new T.DirectionalLight(0xffffff, 1.9); sun.position.set(0.6, 1, 0.35); scene.add(sun);
    const groups = new Map();
    for (const it of prepare(vox)) { if (!groups.has(it.id)) groups.set(it.id, []); groups.get(it.id).push(it); }
    const meshes = [];
    for (const [id, items] of groups) {
      const mesh = new T.InstancedMesh(geom(items[0].shape), materials(id, 'cur'), items.length);
      items.forEach((it, i) => mesh.setMatrixAt(i, it.matrix));
      const m = window.BLOCKS[id]; if (m?.transparent) mesh.renderOrder = 1;
      scene.add(mesh); meshes.push(mesh);
    }
    const { x: w, y: h, z: l } = vox.size;
    const radius = Math.sqrt(w * w + h * h + l * l) / 2;
    const cam = new T.PerspectiveCamera(35, 4 / 3, 0.1, 2000);
    const dist = radius / Math.sin((35 * Math.PI) / 360) * 0.95;
    cam.position.set(dist * Math.sin(1.0) * Math.sin(0.75), h / 2 + dist * Math.cos(1.0), dist * Math.sin(1.0) * Math.cos(0.75));
    cam.lookAt(0, h / 2 - 0.5, 0);
    thumbRenderer.render(scene, cam);
    const url = thumbRenderer.domElement.toDataURL('image/png');
    meshes.forEach((m) => m.dispose());
    thumbs.set(build.id, url);
    return url;
  }

  /* Top-down 2D plan of one layer, used next to the 3D view. */
  function drawLayerPlan(canvas, vox, layer, opts = {}) {
    const { x: w, z: l } = vox.size;
    const cell = Math.max(6, Math.floor(Math.min((opts.max || 320) / w, (opts.max || 320) / l)));
    canvas.width = w * cell + 1; canvas.height = l * cell + 1;
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    const css = getComputedStyle(document.documentElement);
    g.fillStyle = css.getPropertyValue('--plan-bg').trim() || '#1b1e2e';
    g.fillRect(0, 0, canvas.width, canvas.height);
    const cells = [];
    for (const [x, y, z, id] of vox.blocks) {
      if (y === layer - 1 && opts.below !== false) { g.fillStyle = 'rgba(140,150,190,0.18)'; g.fillRect(x * cell, z * cell, cell, cell); }
    }
    for (const [x, y, z, id] of vox.blocks) {
      if (y !== layer) continue;
      const def = window.BLOCKS[id] || { color: '#f0f' };
      g.fillStyle = opts.locked ? 'rgba(180,140,255,0.35)' : (def.top || def.color);
      const small = def.shape && !['cube', 'slab', 'farmland', 'water', 'carpet', 'bed', 'chest'].includes(def.shape);
      const pad = small ? cell * 0.28 : 0;
      g.fillRect(x * cell + pad, z * cell + pad, cell - pad * 2, cell - pad * 2);
      cells.push({ x, z, id });
    }
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.lineWidth = 1;
    for (let i = 0; i <= w; i++) { g.beginPath(); g.moveTo(i * cell + 0.5, 0); g.lineTo(i * cell + 0.5, l * cell); g.stroke(); }
    for (let i = 0; i <= l; i++) { g.beginPath(); g.moveTo(0, i * cell + 0.5); g.lineTo(w * cell, i * cell + 0.5); g.stroke(); }
    return { cell, cells };
  }

  function swatch(id) {
    const key = 'sw:' + id;
    if (thumbs.has(key)) return thumbs.get(key);
    const def = window.BLOCKS[id] || { color: '#888', pattern: 'noise' };
    const tex = paint(def.pattern, def.top && def.pattern === 'grass' ? def.top : def.color, def.pattern === 'grass' ? 'top' : 'side', id);
    const url = tex.image.toDataURL();
    thumbs.set(key, url);
    return url;
  }

  window.Voxel = { Viewer, thumbnail, drawLayerPlan, swatch };
})();
