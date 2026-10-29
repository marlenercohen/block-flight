// All tunable physical constants for Block Flight (units ~ metres; density such that the block mass is `block.mass`).
export const CONFIG = {
  fixedDt: 1 / 120,
  gravity: -9.81,
  // the single block: width x height x depth; the picture is on the +z face, which faces the camera
  block: { size: [1.2, 1.2, 0.9], mass: 1.0, friction: 0.5, restitution: 0.05, start: [0, 0.6, 2.0] },
  // a long runway so even the strongest hit stays on the platform; it extends away from the camera (-z)
  platform: { size: [5, 0.6, 15], center: [0, -0.3, -4.5], friction: 0.5, restitution: 0.0, color: 0xb9bcc2 },
  // The impulse is applied THROUGH THE CENTRE OF MASS in a fixed direction, so how far and how violently the block moves depends only on the impulse strength (not on where the face
  // was clicked, which would otherwise change torque and mix the click position into the physical feedback).
  launch: { impulse: 3.2, elevationDeg: 15, pitchSpin: 0.1 },   // base impulse x hit-strength multiplier; elevation above horizontal; forward tumble: angular velocity = pitchSpin x impulse (rad/s)
  settle: { linSpeed: 0.05, angSpeed: 0.1, seconds: 0.4, maxSeconds: 7 },
  fellBelowY: -4,
  camera: { position: [4.4, 4.4, 10.2], target: [0.2, 0.4, -2.6], fov: 32 },
  background: 0xe9eaec,
};
