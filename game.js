import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const canvas = document.querySelector('#game');
const ui = {
  gemCount: document.querySelector('#gem-count'),
  gemTotal: document.querySelector('#gem-total'),
  timer: document.querySelector('#timer'),
  deaths: document.querySelector('#deaths'),
  cameraMode: document.querySelector('#camera-mode'),
  objectiveTitle: document.querySelector('#objective-title'),
  objectiveText: document.querySelector('#objective-text'),
  startPanel: document.querySelector('#start-panel'),
  finishPanel: document.querySelector('#finish-panel'),
  finishStats: document.querySelector('#finish-stats'),
  startButton: document.querySelector('#start-button'),
  playAgain: document.querySelector('#play-again'),
  toast: document.querySelector('#toast'),
  webglError: document.querySelector('#webgl-error')
};

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (error) {
  ui.startPanel.classList.add('hidden');
  ui.webglError.classList.remove('hidden');
  throw error;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x95b9ff);
scene.fog = new THREE.Fog(0x95b9ff, 36, 130);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 240);
scene.add(camera);

const hemi = new THREE.HemisphereLight(0xdcecff, 0x384321, 2.4);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d1, 4.2);
sun.position.set(-28, 42, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -60;
sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60;
sun.shadow.camera.bottom = -60;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 140;
scene.add(sun);

const world = new THREE.Group();
scene.add(world);

const MAT = {
  grass: new THREE.MeshStandardMaterial({ color: 0x69b557, roughness: 0.95 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x78869c, roughness: 0.82 }),
  pale: new THREE.MeshStandardMaterial({ color: 0xd5d9e2, roughness: 0.74 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x27344b, roughness: 0.8 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xffca4c, roughness: 0.3, metalness: 0.2 }),
  teal: new THREE.MeshStandardMaterial({ color: 0x4fe3c4, roughness: 0.42 }),
  purple: new THREE.MeshStandardMaterial({ color: 0x8063ff, roughness: 0.35 }),
  hazard: new THREE.MeshStandardMaterial({ color: 0xff5c68, emissive: 0x6b1018, emissiveIntensity: 1.4, roughness: 0.48 }),
  black: new THREE.MeshStandardMaterial({ color: 0x111522, roughness: 0.65 }),
  white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 }),
  portal: new THREE.MeshStandardMaterial({ color: 0x8d72ff, emissive: 0x4f2dff, emissiveIntensity: 3, roughness: 0.25 })
};

const platforms = [];
const hazards = [];
const gems = [];
const enemies = [];
const decorations = [];

function addBox({ x, y, z, sx, sy, sz, material = MAT.stone, moving = null, hazard = false }) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  world.add(mesh);
  const entry = {
    mesh,
    half: new THREE.Vector3(sx / 2, sy / 2, sz / 2),
    base: new THREE.Vector3(x, y, z),
    moving,
    delta: new THREE.Vector3(),
    oldPos: new THREE.Vector3(x, y, z),
    hazard
  };
  if (hazard) hazards.push(entry);
  else platforms.push(entry);
  return entry;
}

function addGem(x, y, z) {
  const group = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 0), MAT.gold);
  core.castShadow = true;
  group.add(core);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.045, 8, 24), MAT.white);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  group.position.set(x, y, z);
  world.add(group);
  gems.push({ mesh: group, collected: false, baseY: y, phase: Math.random() * Math.PI * 2 });
}

function addEnemy(x, y, z, axis = 'x', distance = 4, speed = 1.6) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 14), new THREE.MeshStandardMaterial({ color: 0xe9756f, roughness: 0.76 }));
  body.scale.y = 0.72;
  body.castShadow = true;
  group.add(body);
  const eyeGeo = new THREE.SphereGeometry(0.09, 12, 8);
  const pupilGeo = new THREE.SphereGeometry(0.045, 10, 8);
  for (const ex of [-0.2, 0.2]) {
    const eye = new THREE.Mesh(eyeGeo, MAT.white);
    eye.position.set(ex, 0.12, -0.5);
    group.add(eye);
    const pupil = new THREE.Mesh(pupilGeo, MAT.black);
    pupil.position.set(ex, 0.12, -0.575);
    group.add(pupil);
  }
  group.position.set(x, y, z);
  world.add(group);
  enemies.push({ mesh: group, start: new THREE.Vector3(x, y, z), axis, distance, speed, phase: Math.random() * 3 });
}

function addTree(x, z, scale = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * scale, 0.25 * scale, 1.8 * scale, 8), new THREE.MeshStandardMaterial({ color: 0x6f4f39, roughness: 1 }));
  trunk.position.y = 0.9 * scale;
  trunk.castShadow = true;
  g.add(trunk);
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85 * scale, 1), new THREE.MeshStandardMaterial({ color: 0x467d46, roughness: 0.9 }));
  crown.position.y = 2.0 * scale;
  crown.castShadow = true;
  g.add(crown);
  g.position.set(x, 0, z);
  world.add(g);
  decorations.push(g);
}

function addCloud(x, y, z, scale = 1) {
  const g = new THREE.Group();
  for (const [ox, oy, oz, s] of [[0,0,0,1],[-0.8,-0.1,0.1,.75],[.8,-.13,0,.8],[.25,.35,.05,.7]]) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.9 * scale * s, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.74, depthWrite: false }));
    puff.position.set(ox * scale, oy * scale, oz * scale);
    g.add(puff);
  }
  g.position.set(x, y, z);
  world.add(g);
}

addBox({ x: 0, y: -0.5, z: 8, sx: 18, sy: 1, sz: 18, material: MAT.grass });
addBox({ x: 0, y: -1.35, z: 8, sx: 16, sy: 0.8, sz: 16, material: MAT.stone });
addBox({ x: 0, y: 0.3, z: -5, sx: 7, sy: 0.8, sz: 5, material: MAT.pale });
addBox({ x: -5, y: 1.2, z: -12, sx: 5, sy: 0.8, sz: 4, material: MAT.stone });
addBox({ x: 3.4, y: 2.1, z: -17, sx: 5.5, sy: 0.75, sz: 4.5, material: MAT.teal });
addBox({ x: 0, y: 3.2, z: -24, sx: 4, sy: 0.7, sz: 4, material: MAT.pale, moving: { axis: 'x', range: 6, speed: 1.1, phase: 0 } });
addBox({ x: -6, y: 4.3, z: -32, sx: 6, sy: 0.8, sz: 5, material: MAT.stone });
addBox({ x: 1.5, y: 5.3, z: -39, sx: 4.5, sy: 0.7, sz: 4.5, material: MAT.purple });
addBox({ x: 7, y: 6.1, z: -46, sx: 5, sy: 0.8, sz: 5, material: MAT.pale, moving: { axis: 'z', range: 4.5, speed: 1.25, phase: 1.4 } });
addBox({ x: 0, y: 6.9, z: -54, sx: 7, sy: 0.8, sz: 5.5, material: MAT.teal });
addBox({ x: -7, y: 8.1, z: -61, sx: 4.5, sy: 0.8, sz: 4.5, material: MAT.stone });
addBox({ x: 0, y: 9.2, z: -68, sx: 4.5, sy: 0.7, sz: 4.5, material: MAT.pale, moving: { axis: 'x', range: 5.5, speed: 1.45, phase: 0.8 } });
addBox({ x: 7, y: 10.2, z: -75, sx: 6, sy: 0.9, sz: 5.5, material: MAT.purple });
addBox({ x: 0, y: 11.1, z: -83, sx: 13, sy: 1.1, sz: 11, material: MAT.grass });

addBox({ x: 0, y: 0.02, z: 2, sx: 5, sy: 0.12, sz: 1.4, material: MAT.hazard, hazard: true });
addBox({ x: -2.5, y: 11.72, z: -82, sx: 1.3, sy: 0.14, sz: 5, material: MAT.hazard, hazard: true });

for (const p of [
  [0,1.2,-5],[-5,2.1,-12],[3.4,3,-17],[0,4.1,-24],[-6,5.25,-32],[1.5,6.15,-39],[7,7,-46],
  [-2,7.85,-54],[2,7.85,-54],[-7,9,-61],[0,10.15,-68],[7,11.2,-75],[0,12.7,-83]
]) addGem(...p);

addEnemy(-1.8, 0.58, 7, 'x', 4, 1.5);
addEnemy(-6, 5.15, -32, 'z', 2.8, 1.9);
addEnemy(7, 11.15, -75, 'x', 2.2, 2.2);

for (const t of [[-6,3,1.1],[6,5,.9],[-7,11,.85],[6,12,1.05],[-4,-84,1.1],[4,-81,.85]]) addTree(...t);
for (const c of [[-18,18,-18,2.2],[19,21,-42,1.9],[-15,25,-72,2.5],[18,18,-96,2.1]]) addCloud(...c);

const voidSea = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ color: 0x5f79d8, emissive: 0x1e245c, emissiveIntensity: 0.5, roughness: 0.36, metalness: 0.18 }));
voidSea.rotation.x = -Math.PI / 2;
voidSea.position.y = -4;
voidSea.receiveShadow = true;
scene.add(voidSea);

const portal = new THREE.Group();
const portalRing = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.19, 12, 48), MAT.portal);
portalRing.position.y = 13.25;
portalRing.position.z = -86;
portalRing.rotation.x = 0;
portal.add(portalRing);
const portalDisc = new THREE.Mesh(new THREE.CircleGeometry(1.78, 48), new THREE.MeshBasicMaterial({ color: 0x7d69ff, transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false }));
portalDisc.position.copy(portalRing.position);
portal.add(portalDisc);
world.add(portal);

const player = new THREE.Group();
const playerBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.43, 0.78, 6, 12), new THREE.MeshStandardMaterial({ color: 0x24324f, roughness: 0.58 }));
playerBody.position.y = 0.85;
playerBody.castShadow = true;
player.add(playerBody);
const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.09, 8, 20), MAT.teal);
scarf.rotation.x = Math.PI / 2;
scarf.position.y = 1.25;
player.add(scarf);
const face = new THREE.Mesh(new THREE.SphereGeometry(0.31, 16, 12), new THREE.MeshStandardMaterial({ color: 0xe9c9ab, roughness: 0.78 }));
face.position.set(0, 1.38, -0.05);
face.castShadow = true;
player.add(face);
for (const ex of [-0.105, 0.105]) {
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), MAT.black);
  eye.position.set(ex, 1.43, -0.34);
  player.add(eye);
}
scene.add(player);

const PLAYER = { radius: 0.42, height: 1.72 };
const state = {
  position: new THREE.Vector3(0, 0.05, 10),
  velocity: new THREE.Vector3(),
  spawn: new THREE.Vector3(0, 0.05, 10),
  grounded: false,
  groundPlatform: null,
  started: false,
  finished: false,
  firstPerson: false,
  yaw: 0,
  pitch: -0.12,
  gems: 0,
  deaths: 0,
  elapsed: 0,
  coyote: 0,
  jumpBuffer: 0,
  toastTimer: 0,
  invulnerable: 0
};

ui.gemTotal.textContent = String(gems.length);
const keys = new Set();

const gamepadInput = {
  index: null,
  id: '',
  moveX: 0,
  moveZ: 0,
  lookX: 0,
  lookY: 0,
  sprint: false,
  jumpHeld: false,
  prevButtons: []
};
const GAMEPAD_DEADZONE = 0.18;

function applyDeadzone(value, deadzone = GAMEPAD_DEADZONE) {
  const magnitude = Math.abs(value);
  if (magnitude <= deadzone) return 0;
  return Math.sign(value) * ((magnitude - deadzone) / (1 - deadzone));
}

function gamepadButton(gamepad, index) {
  const button = gamepad?.buttons?.[index];
  return button ? { pressed: button.pressed || button.value > 0.5, value: button.value } : { pressed: false, value: 0 };
}

function pollGamepad(dt) {
  if (!navigator.getGamepads) return;
  const pads = navigator.getGamepads();
  let gamepad = gamepadInput.index !== null ? pads[gamepadInput.index] : null;
  if (!gamepad) gamepad = Array.from(pads).find(Boolean) || null;

  if (!gamepad) {
    gamepadInput.moveX = 0;
    gamepadInput.moveZ = 0;
    gamepadInput.lookX = 0;
    gamepadInput.lookY = 0;
    gamepadInput.sprint = false;
    gamepadInput.jumpHeld = false;
    gamepadInput.prevButtons = [];
    return;
  }

  gamepadInput.index = gamepad.index;
  gamepadInput.id = gamepad.id || 'Controller';

  const dpadX = (gamepadButton(gamepad, 15).pressed ? 1 : 0) - (gamepadButton(gamepad, 14).pressed ? 1 : 0);
  const dpadZ = (gamepadButton(gamepad, 12).pressed ? 1 : 0) - (gamepadButton(gamepad, 13).pressed ? 1 : 0);
  const stickX = applyDeadzone(gamepad.axes?.[0] ?? 0);
  const stickY = applyDeadzone(gamepad.axes?.[1] ?? 0);
  gamepadInput.moveX = Math.abs(dpadX) > Math.abs(stickX) ? dpadX : stickX;
  gamepadInput.moveZ = Math.abs(dpadZ) > Math.abs(stickY) ? dpadZ : -stickY;

  gamepadInput.lookX = applyDeadzone(gamepad.axes?.[2] ?? 0, 0.14);
  gamepadInput.lookY = applyDeadzone(gamepad.axes?.[3] ?? 0, 0.14);
  state.yaw -= gamepadInput.lookX * 2.55 * dt;
  state.pitch -= gamepadInput.lookY * 2.1 * dt;
  state.pitch = THREE.MathUtils.clamp(state.pitch, -1.18, 1.05);

  const jump = gamepadButton(gamepad, 0);
  const cameraToggle = gamepadButton(gamepad, 3);
  const reset = gamepadButton(gamepad, 8);
  const menu = gamepadButton(gamepad, 9);
  const previous = gamepadInput.prevButtons;

  gamepadInput.jumpHeld = jump.pressed;
  gamepadInput.sprint =
    gamepadButton(gamepad, 4).pressed ||
    gamepadButton(gamepad, 5).pressed ||
    gamepadButton(gamepad, 6).value > 0.28 ||
    gamepadButton(gamepad, 7).value > 0.28 ||
    gamepadButton(gamepad, 10).pressed;

  if (!state.started && (jump.pressed || menu.pressed) && !previous[0] && !previous[9]) {
    beginGame(false);
  } else if (state.finished && (jump.pressed || menu.pressed) && !previous[0] && !previous[9]) {
    resetRun();
    state.started = true;
    showToast('Reach the Rift Gate');
  }

  if (state.started && !state.finished && jump.pressed && !previous[0]) state.jumpBuffer = 0.14;

  if (cameraToggle.pressed && !previous[3]) {
    state.firstPerson = !state.firstPerson;
    updateCameraMode();
  }

  if (state.started && !state.finished && reset.pressed && !previous[8]) resetPlayer(true);

  gamepadInput.prevButtons = gamepad.buttons.map(button => button.pressed || button.value > 0.5);
}

window.addEventListener('gamepadconnected', event => {
  gamepadInput.index = event.gamepad.index;
  gamepadInput.id = event.gamepad.id || 'Controller';
  gamepadInput.prevButtons = [];
  showToast('Controller connected');
});

window.addEventListener('gamepaddisconnected', event => {
  if (gamepadInput.index === event.gamepad.index) {
    gamepadInput.index = null;
    gamepadInput.id = '';
    gamepadInput.prevButtons = [];
    gamepadInput.moveX = 0;
    gamepadInput.moveZ = 0;
    gamepadInput.lookX = 0;
    gamepadInput.lookY = 0;
    gamepadInput.sprint = false;
    gamepadInput.jumpHeld = false;
    showToast('Controller disconnected');
  }
});

function overlapsPlatform(pos, p) {
  const minX = pos.x - PLAYER.radius;
  const maxX = pos.x + PLAYER.radius;
  const minY = pos.y;
  const maxY = pos.y + PLAYER.height;
  const minZ = pos.z - PLAYER.radius;
  const maxZ = pos.z + PLAYER.radius;
  const q = p.mesh.position;
  return maxX > q.x - p.half.x && minX < q.x + p.half.x &&
    maxY > q.y - p.half.y && minY < q.y + p.half.y &&
    maxZ > q.z - p.half.z && minZ < q.z + p.half.z;
}

function resolveAxis(axis, amount) {
  state.position[axis] += amount;
  for (const p of platforms) {
    if (!overlapsPlatform(state.position, p)) continue;
    const q = p.mesh.position;
    if (axis === 'x') {
      state.position.x = amount > 0 ? q.x - p.half.x - PLAYER.radius : q.x + p.half.x + PLAYER.radius;
      state.velocity.x = 0;
    } else if (axis === 'z') {
      state.position.z = amount > 0 ? q.z - p.half.z - PLAYER.radius : q.z + p.half.z + PLAYER.radius;
      state.velocity.z = 0;
    } else if (axis === 'y') {
      if (amount <= 0) {
        state.position.y = q.y + p.half.y;
        state.velocity.y = 0;
        state.grounded = true;
        state.groundPlatform = p;
      } else {
        state.position.y = q.y - p.half.y - PLAYER.height;
        state.velocity.y = Math.min(0, state.velocity.y);
      }
    }
  }
}

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add('show');
  state.toastTimer = 1.7;
}

function updateCameraMode() {
  document.body.classList.toggle('first-person', state.firstPerson);
  ui.cameraMode.textContent = state.firstPerson ? 'FIRST PERSON' : 'THIRD PERSON';
  player.visible = !state.firstPerson;
  showToast(state.firstPerson ? 'First-person camera' : 'Third-person camera');
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds - mins * 60;
  return `${mins}:${secs.toFixed(1).padStart(4, '0')}`;
}

function resetPlayer(countDeath = true) {
  if (countDeath) state.deaths += 1;
  state.position.copy(state.spawn);
  state.velocity.set(0, 0, 0);
  state.grounded = false;
  state.groundPlatform = null;
  state.invulnerable = 1.0;
  ui.deaths.textContent = String(state.deaths);
  if (countDeath) showToast('Back to the last checkpoint');
}

function resetRun() {
  state.gems = 0;
  state.deaths = 0;
  state.elapsed = 0;
  state.finished = false;
  state.spawn.set(0, 0.05, 10);
  for (const gem of gems) {
    gem.collected = false;
    gem.mesh.visible = true;
  }
  ui.gemCount.textContent = '0';
  ui.deaths.textContent = '0';
  ui.finishPanel.classList.add('hidden');
  ui.objectiveTitle.textContent = 'Reach the Rift Gate';
  ui.objectiveText.textContent = 'Collect the sky shards along the way.';
  resetPlayer(false);
}

function hitHazard() {
  if (state.invulnerable > 0 || state.finished) return;
  resetPlayer(true);
}

function beginGame(captureMouse = true) {
  state.started = true;
  state.finished = false;
  ui.startPanel.classList.add('hidden');
  ui.finishPanel.classList.add('hidden');
  canvas.focus();
  if (captureMouse && canvas.requestPointerLock) canvas.requestPointerLock();
  showToast('Reach the Rift Gate');
}

ui.startButton.addEventListener('click', () => beginGame(true));
ui.playAgain.addEventListener('click', () => {
  resetRun();
  state.started = true;
  if (canvas.requestPointerLock) canvas.requestPointerLock();
});
canvas.addEventListener('click', () => {
  if (state.started && !state.finished && document.pointerLockElement !== canvas && canvas.requestPointerLock) canvas.requestPointerLock();
});

window.addEventListener('keydown', event => {
  if (['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft','ShiftRight','KeyV','KeyR'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.code === 'Space' && !event.repeat) state.jumpBuffer = 0.14;
  if (event.code === 'KeyV' && !event.repeat) {
    state.firstPerson = !state.firstPerson;
    updateCameraMode();
  }
  if (event.code === 'KeyR' && !event.repeat) resetPlayer(true);
});
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());
document.addEventListener('mousemove', event => {
  if (document.pointerLockElement !== canvas) return;
  const sensitivity = 0.0021;
  state.yaw -= event.movementX * sensitivity;
  state.pitch -= event.movementY * sensitivity;
  state.pitch = THREE.MathUtils.clamp(state.pitch, -1.18, 1.05);
});

function updateMovingPlatforms(t) {
  for (const p of platforms) {
    p.oldPos.copy(p.mesh.position);
    if (!p.moving) {
      p.delta.set(0, 0, 0);
      continue;
    }
    const m = p.moving;
    const value = Math.sin(t * m.speed + m.phase) * m.range;
    p.mesh.position.copy(p.base);
    p.mesh.position[m.axis] += value;
    p.delta.copy(p.mesh.position).sub(p.oldPos);
  }
  if (state.grounded && state.groundPlatform) state.position.add(state.groundPlatform.delta);
}

const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const wish = new THREE.Vector3();
function updatePlayer(dt) {
  if (!state.started || state.finished) return;
  state.invulnerable = Math.max(0, state.invulnerable - dt);
  state.jumpBuffer = Math.max(0, state.jumpBuffer - dt);
  state.coyote = state.grounded ? 0.11 : Math.max(0, state.coyote - dt);

  const keyboardX = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const keyboardZ = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  const inputX = THREE.MathUtils.clamp(keyboardX + gamepadInput.moveX, -1, 1);
  const inputZ = THREE.MathUtils.clamp(keyboardZ + gamepadInput.moveZ, -1, 1);
  forward.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
  right.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
  wish.set(0, 0, 0).addScaledVector(forward, inputZ).addScaledVector(right, inputX);
  if (wish.lengthSq() > 1) wish.normalize();

  const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight') || gamepadInput.sprint;
  const maxSpeed = sprinting ? 10.2 : 7.3;
  const accel = state.grounded ? 38 : 15;
  const targetX = wish.x * maxSpeed;
  const targetZ = wish.z * maxSpeed;
  state.velocity.x = THREE.MathUtils.damp(state.velocity.x, targetX, accel / Math.max(maxSpeed, 1), dt);
  state.velocity.z = THREE.MathUtils.damp(state.velocity.z, targetZ, accel / Math.max(maxSpeed, 1), dt);

  if (wish.lengthSq() < 0.01 && state.grounded) {
    state.velocity.x = THREE.MathUtils.damp(state.velocity.x, 0, 10, dt);
    state.velocity.z = THREE.MathUtils.damp(state.velocity.z, 0, 10, dt);
  }

  if (state.jumpBuffer > 0 && state.coyote > 0) {
    state.velocity.y = 10.6;
    state.grounded = false;
    state.groundPlatform = null;
    state.coyote = 0;
    state.jumpBuffer = 0;
  }
  if (!keys.has('Space') && !gamepadInput.jumpHeld && state.velocity.y > 4.2) state.velocity.y *= Math.pow(0.72, dt * 60);

  state.velocity.y -= 27 * dt;
  state.velocity.y = Math.max(state.velocity.y, -24);

  const steps = Math.max(1, Math.ceil(dt / 0.012));
  const step = dt / steps;
  for (let i = 0; i < steps; i++) {
    state.grounded = false;
    state.groundPlatform = null;
    resolveAxis('x', state.velocity.x * step);
    resolveAxis('z', state.velocity.z * step);
    resolveAxis('y', state.velocity.y * step);
  }

  player.position.copy(state.position);
  if (wish.lengthSq() > 0.02 && !state.firstPerson) {
    const desired = Math.atan2(-wish.x, -wish.z);
    let delta = desired - player.rotation.y;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    player.rotation.y += delta * Math.min(1, dt * 12);
  }

  if (state.position.y < -7) hitHazard();
  for (const h of hazards) if (overlapsPlatform(state.position, h)) hitHazard();

  for (const gem of gems) {
    if (gem.collected) continue;
    const playerCenter = new THREE.Vector3(state.position.x, state.position.y + 0.85, state.position.z);
    if (playerCenter.distanceTo(gem.mesh.position) < 1.15) {
      gem.collected = true;
      gem.mesh.visible = false;
      state.gems += 1;
      ui.gemCount.textContent = String(state.gems);
      showToast(state.gems === gems.length ? 'All sky shards collected!' : `Sky shard ${state.gems}/${gems.length}`);
    }
  }

  const playerCenter = new THREE.Vector3(state.position.x, state.position.y + 0.8, state.position.z);
  for (const enemy of enemies) {
    if (playerCenter.distanceTo(enemy.mesh.position) < 1.05) {
      if (state.velocity.y < -3 && state.position.y > enemy.mesh.position.y + 0.3) {
        state.velocity.y = 8.2;
        enemy.mesh.visible = false;
        enemy.disabled = 4;
        showToast('Bounce bot stomped');
      } else hitHazard();
    }
  }

  const dx = state.position.x - portalRing.position.x;
  const dy = state.position.y + 0.85 - portalRing.position.y;
  const dz = state.position.z - portalRing.position.z;
  if (dx * dx + dy * dy + dz * dz < 5.1 && !state.finished) finishRun();
}

function finishRun() {
  state.finished = true;
  if (document.exitPointerLock) document.exitPointerLock();
  ui.finishStats.textContent = `${state.gems}/${gems.length} sky shards · ${formatTime(state.elapsed)} · ${state.deaths} falls`;
  ui.finishPanel.classList.remove('hidden');
  ui.objectiveTitle.textContent = 'Course Complete';
  ui.objectiveText.textContent = 'The first Ender platforming route is cleared.';
}

function updateWorldAnimation(t, dt) {
  voidSea.position.y = -4 + Math.sin(t * 0.45) * 0.08;
  portalRing.rotation.z = t * 0.55;
  portalDisc.material.opacity = 0.21 + Math.sin(t * 2.1) * 0.07;
  for (const gem of gems) {
    if (gem.collected) continue;
    gem.mesh.rotation.y = t * 1.8 + gem.phase;
    gem.mesh.position.y = gem.baseY + Math.sin(t * 2.4 + gem.phase) * 0.16;
  }
  for (const enemy of enemies) {
    if (enemy.disabled > 0) {
      enemy.disabled -= dt;
      if (enemy.disabled <= 0) enemy.mesh.visible = true;
      continue;
    }
    const s = Math.sin(t * enemy.speed + enemy.phase);
    enemy.mesh.position.copy(enemy.start);
    enemy.mesh.position[enemy.axis] += s * enemy.distance;
    enemy.mesh.rotation.y = enemy.axis === 'x' ? (Math.cos(t * enemy.speed + enemy.phase) > 0 ? -Math.PI / 2 : Math.PI / 2) : (Math.cos(t * enemy.speed + enemy.phase) > 0 ? Math.PI : 0);
  }
  for (let i = 0; i < decorations.length; i++) decorations[i].rotation.z = Math.sin(t * 0.8 + i) * 0.012;
}

const camTarget = new THREE.Vector3();
const camDesired = new THREE.Vector3();
const lookDir = new THREE.Vector3();
function updateCamera(dt) {
  if (state.firstPerson) {
    camera.position.set(state.position.x, state.position.y + 1.48, state.position.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = state.yaw;
    camera.rotation.x = state.pitch;
    camera.rotation.z = 0;
    return;
  }
  camTarget.set(state.position.x, state.position.y + 1.0, state.position.z);
  lookDir.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
  const distance = 7.2;
  const height = 3.0 + state.pitch * 3.0;
  camDesired.copy(camTarget).addScaledVector(lookDir, -distance);
  camDesired.y += height;
  const smooth = 1 - Math.exp(-dt * 10);
  camera.position.lerp(camDesired, smooth);
  camera.lookAt(camTarget);
}

let last = performance.now();
function animate(now) {
  const rawDt = Math.min((now - last) / 1000, 0.05);
  last = now;
  const t = now / 1000;
  if (state.started && !state.finished) {
    state.elapsed += rawDt;
    ui.timer.textContent = formatTime(state.elapsed);
  }
  pollGamepad(rawDt);
  updateMovingPlatforms(t);
  updateWorldAnimation(t, rawDt);
  updatePlayer(rawDt);
  updateCamera(rawDt);
  if (state.toastTimer > 0) {
    state.toastTimer -= rawDt;
    if (state.toastTimer <= 0) ui.toast.classList.remove('show');
  }
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

player.position.copy(state.position);
camera.position.set(0, 5, 17);
camera.lookAt(0, 1, 8);
updateCameraMode();
ui.toast.classList.remove('show');
requestAnimationFrame(animate);
