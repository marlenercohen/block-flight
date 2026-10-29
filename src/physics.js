// Physics layer (Rapier): one block on a long platform. No rendering / DOM, so it runs headless in the tests.
import RAPIER from '@dimforge/rapier3d-compat';
import { CONFIG } from './config.js';

export async function initPhysics() { await RAPIER.init(); }

export class FlightSim {
  constructor() {
    const C = CONFIG;
    this.world = new RAPIER.World({ x: 0, y: C.gravity, z: 0 }); this.world.timestep = C.fixedDt; this.world.numSolverIterations = 8;
    this.world.integrationParameters.contact_natural_frequency = 60;
    const [pw, ph, pd] = C.platform.size, [cx, cy, cz] = C.platform.center;
    const pb = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy, cz));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(pw / 2, ph / 2, pd / 2).setFriction(C.platform.friction).setRestitution(C.platform.restitution), pb);
    const [sx, sy, sz] = C.block.size;
    this.body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...C.block.start).setCanSleep(true).setCcdEnabled(true));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2).setMass(C.block.mass).setFriction(C.block.friction).setRestitution(C.block.restitution), this.body);
    for (let i = 0; i < 120 * 3 && !this.body.isSleeping(); i++) this.world.step();   // hidden settle onto the platform: every trial starts from the same resting pose
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, false); this.body.setAngvel({ x: 0, y: 0, z: 0 }, false); this.body.sleep();
    this.start = { ...this.body.translation() }; this.q0 = { ...this.body.rotation() };
    this.t = 0; this.launched = false; this.rest = 0; this.track = null;
  }
  /** Launch: impulse magnitude J (N s) through the centre of mass, direction away from the camera raised by the launch elevation, plus a forward-tumble angular velocity proportional to J. */
  launch(J) {
    const L = CONFIG.launch, el = L.elevationDeg * Math.PI / 180, m = CONFIG.block.mass;
    this.body.applyImpulse({ x: 0, y: J * Math.sin(el), z: -J * Math.cos(el) }, true);
    this.body.setAngvel({ x: -L.pitchSpin * J, y: 0, z: 0 }, true);    // forward tumble about the horizontal axis perpendicular to the flight direction
    this.launched = true; this.v0 = J / m;
    this.track = { maxY: this.start.y, pathLength: 0, rotPath: 0, last: { ...this.start }, firstContactT: null, airborneT: 0 };
  }
  step() {
    this.world.step(); this.t += CONFIG.fixedDt;
    if (this.track) { const p = this.body.translation(), w = this.body.angvel(), tk = this.track;
      tk.maxY = Math.max(tk.maxY, p.y); tk.pathLength += Math.hypot(p.x - tk.last.x, p.y - tk.last.y, p.z - tk.last.z); tk.rotPath += Math.hypot(w.x, w.y, w.z) * CONFIG.fixedDt; tk.last = { x: p.x, y: p.y, z: p.z };
      if (p.y > this.start.y + 0.03) tk.airborneT += CONFIG.fixedDt;
      const v = this.body.linvel(); if (Math.hypot(v.x, v.y, v.z) < CONFIG.settle.linSpeed && Math.hypot(w.x, w.y, w.z) < CONFIG.settle.angSpeed) this.rest += CONFIG.fixedDt; else this.rest = 0; }
  }
  get atRest() { return this.launched && this.rest >= CONFIG.settle.seconds; }
  get fell() { return this.body.translation().y < CONFIG.fellBelowY; }
  /** Summary of what the block did (displacement, rotation, ...). */
  outcome() {
    const p = this.body.translation(), q = this.body.rotation(), s = this.start, tk = this.track ?? {};
    const dot = Math.abs(q.x * this.q0.x + q.y * this.q0.y + q.z * this.q0.z + q.w * this.q0.w), rotDeg = 2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI;
    const dx = p.x - s.x, dy = p.y - s.y, dz = p.z - s.z;
    return { dx, dy, dz, displacement: Math.hypot(dx, dy, dz), distanceAway: -dz, horizontalDistance: Math.hypot(dx, dz), finalPosition: { x: p.x, y: p.y, z: p.z }, finalQuaternion: { x: q.x, y: q.y, z: q.z, w: q.w },
      netRotationDeg: rotDeg, rotationPathDeg: (tk.rotPath ?? 0) * 180 / Math.PI, peakHeight: (tk.maxY ?? s.y) - s.y, pathLength: tk.pathLength ?? 0, airborneS: tk.airborneT ?? 0,
      timeToRestS: this.t, leftPlatform: p.y < -0.6 || Math.abs(p.x) > CONFIG.platform.size[0] / 2 || p.z < CONFIG.platform.center[2] - CONFIG.platform.size[2] / 2, fell: this.fell };
  }
  /** Run the launched block until it is at rest (or fell, or the time limit), without rendering. Used by tests. */
  runToRest() { for (let i = 0; i < CONFIG.settle.maxSeconds * 120 && !this.atRest && !this.fell; i++) this.step(); return this.outcome(); }
}
