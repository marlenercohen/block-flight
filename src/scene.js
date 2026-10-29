// Rendering layer (Three.js): one block on a long platform, fixed camera, picking of the picture face. No physics logic.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { IMAGES } from './experiment.js';

export class SceneView {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(CONFIG.background);
    const c = CONFIG.camera; this.camera = new THREE.PerspectiveCamera(c.fov, 1, 0.1, 100); this.camera.position.set(...c.position); this.camera.lookAt(...c.target);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9da4, 1.0));
    const sun = new THREE.DirectionalLight(0xffffff, 2.1); sun.position.set(-3, 12, 8); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 12, bottom: -18, near: 1, far: 40 }); sun.shadow.radius = 4; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; this.scene.add(sun);
    this._buildPlatform();
    this.mesh = null; this._texCache = new Map(); this.raycaster = new THREE.Raycaster();
    this.resize(); window.addEventListener('resize', () => this.resize());
  }
  _buildPlatform() {
    const [w, h, d] = CONFIG.platform.size, [cx, cy, cz] = CONFIG.platform.center, geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: CONFIG.platform.color, roughness: 0.9 })); mesh.position.set(cx, cy, cz); mesh.receiveShadow = true;
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x6f737c })));
    // faint cross lines every metre away from the block's starting position: they only help the eye judge distance; they carry no information about the click
    const tickMat = new THREE.MeshBasicMaterial({ color: 0xa4a8b0 }), z0 = CONFIG.block.start[2];
    for (let k = 0; ; k++) { const z = z0 - k; if (z < cz - d / 2 + 0.2) break; const tick = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, 0.004, k % 5 === 0 ? 0.07 : 0.035), tickMat); tick.position.set(0, h / 2 + 0.002, z - cz); mesh.add(tick); }
    this.platform = mesh; this.scene.add(mesh);
  }
  _faceTexture(img, colorHex, aspect) {
    const key = `${img.src}|${colorHex}|${aspect}`; if (this._texCache.has(key)) return this._texCache.get(key);
    const H = 256, W = Math.round(H * aspect), c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.fillStyle = '#' + colorHex.toString(16).padStart(6, '0'); g.fillRect(0, 0, W, H);
    const s = Math.round(H * IMAGES.faceFraction); g.drawImage(img, (W - s) / 2, (H - s) / 2, s, s);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; this._texCache.set(key, tex); return tex;
  }
  /** Show the block of a new trial (colour cue + picture on the +z face; the other faces are plain colour). */
  setBlock(img, colorHex) {
    this.clearBlock(); const [sx, sy, sz] = CONFIG.block.size, geo = new THREE.BoxGeometry(sx, sy, sz), color = new THREE.Color(colorHex);
    const plain = () => new THREE.MeshStandardMaterial({ color, roughness: 0.55 }), front = new THREE.MeshStandardMaterial({ map: this._faceTexture(img, colorHex, sx / sy), roughness: 0.55 });
    const mesh = new THREE.Mesh(geo, [plain(), plain(), plain(), plain(), front, plain()]); mesh.castShadow = mesh.receiveShadow = true;
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: color.clone().multiplyScalar(0.28) })));
    mesh.position.set(...CONFIG.block.start); this.mesh = mesh; this.scene.add(mesh);
  }
  clearBlock() { if (!this.mesh) return; this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.forEach(m => m.dispose()); this.mesh.children.forEach(c => { c.geometry.dispose(); c.material.dispose(); }); this.mesh = null; }
  setBlockVisible(on) { if (this.mesh) this.mesh.visible = on; }
  sync(body) { if (!this.mesh) return; const t = body.translation(), q = body.rotation(); this.mesh.position.set(t.x, t.y, t.z); this.mesh.quaternion.set(q.x, q.y, q.z, q.w); }
  /** Ray cast at a client position. Returns null (nothing), or { face: '+z' | other face name, local: {x,y,z} in the block frame, u, v } with u/v the normalised coordinates on the +z picture face (0..1). */
  pick(clientX, clientY) {
    if (!this.mesh || !this.mesh.visible) return null;
    const r = this.renderer.domElement.getBoundingClientRect(); this.raycaster.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera);
    const hit = this.raycaster.intersectObject(this.mesh, false)[0]; if (!hit) return null;
    const n = hit.face.normal, axis = Math.abs(n.x) > 0.5 ? 'x' : Math.abs(n.y) > 0.5 ? 'y' : 'z', sign = Math.sign(n[axis]), face = (sign > 0 ? '+' : '-') + axis;
    const p = this.mesh.worldToLocal(hit.point.clone()), [w, h] = CONFIG.block.size;
    return { face, local: { x: p.x, y: p.y, z: p.z }, u: Math.min(1, Math.max(0, p.x / w + 0.5)), v: Math.min(1, Math.max(0, p.y / h + 0.5)) };
  }
  /** Client-pixel position of the point (u, v) on the block's +z face (for tests). */
  screenPointOfFace(u, v) {
    const [w, h, d] = CONFIG.block.size, p = new THREE.Vector3((u - 0.5) * w, (v - 0.5) * h, d / 2); this.mesh.updateMatrixWorld(true); this.mesh.localToWorld(p);
    const q = p.project(this.camera), r = this.renderer.domElement.getBoundingClientRect(); return { x: r.left + (q.x + 1) / 2 * r.width, y: r.top + (1 - q.y) / 2 * r.height };
  }
  render() { this.renderer.render(this.scene, this.camera); }
  resize() {
    const w = innerWidth, h = innerHeight; this.renderer.setSize(w, h, false); const aspect = w / h; this.camera.aspect = aspect;
    // keep the whole runway in view on narrow screens by widening the vertical field of view
    this.camera.fov = CONFIG.camera.fov * Math.max(1, 1.45 / aspect); this.camera.updateProjectionMatrix();
  }
}
