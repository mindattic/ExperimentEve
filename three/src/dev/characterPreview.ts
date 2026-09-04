import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Full-fidelity character preview: standalone from the PS1 game pipeline.
// Michelle (Mixamo) rendered with standard PBR materials, IBL from
// RoomEnvironment, and real locomotion (Idle/Walk/Run) borrowed from
// Soldier.glb — another Mixamo rig sharing the same `mixamorig:` bone
// names. The two rigs' bind poses aren't identical, so clips are retargeted
// through a rest-pose delta (see retargetClip) rather than applied as-is.

const canvas = document.getElementById('preview') as HTMLCanvasElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1d22);
scene.fog = new THREE.Fog(0x1a1d22, 12, 40);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(2.2, 1.6, 3.2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.0, 0);
controls.enableDamping = true;
controls.minDistance = 1.2;
controls.maxDistance = 12;
controls.maxPolarAngle = Math.PI * 0.49;
controls.update();

// Lighting: hemisphere fill + a key sun casting soft shadows.
scene.add(new THREE.HemisphereLight(0x8fb3ff, 0x2a1f1a, 0.6));
const sun = new THREE.DirectionalLight(0xfff3e0, 2.4);
sun.position.set(4, 6, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 20;
sun.shadow.camera.left = -4;
sun.shadow.camera.right = 4;
sun.shadow.camera.top = 4;
sun.shadow.camera.bottom = -4;
sun.shadow.bias = -0.0005;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(20, 48),
  new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.9, metalness: 0.0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Player: a movable group holding Michelle's scene once loaded.
const player = new THREE.Group();
scene.add(player);

let mixer: THREE.AnimationMixer | null = null;
let idleAction: THREE.AnimationAction | null = null;
let walkAction: THREE.AnimationAction | null = null;
let runAction: THREE.AnimationAction | null = null;

function findClip(clips: THREE.AnimationClip[], name: string): THREE.AnimationClip {
  const clip = clips.find((c) => c.name === name);
  if (!clip) throw new Error(`missing animation clip "${name}"`);
  return clip;
}

function captureRestPose(root: THREE.Object3D): Map<string, THREE.Quaternion> {
  const rest = new Map<string, THREE.Quaternion>();
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) rest.set(o.name, o.quaternion.clone());
  });
  return rest;
}

/**
 * Soldier.glb and Michelle.glb are both Mixamo rigs with matching bone
 * names, but their BIND poses aren't identical (Michelle's "Character"
 * ancestor also carries a baked 0.01 scale, an FBX cm->m leftover). Applying
 * Soldier's absolute local quaternions straight onto Michelle's bones
 * ignores that mismatch and folds/flips her skeleton. Re-express each
 * keyframe as a delta from Soldier's rest pose, then reapply that delta on
 * top of Michelle's own rest pose. Root motion (position tracks) is dropped
 * entirely — our own locomotion code drives world translation.
 */
function retargetClip(
  clip: THREE.AnimationClip,
  sourceRest: Map<string, THREE.Quaternion>,
  targetRest: Map<string, THREE.Quaternion>,
): THREE.AnimationClip {
  const retargeted = clip.clone();
  const kept: THREE.KeyframeTrack[] = [];
  const anim = new THREE.Quaternion();
  const result = new THREE.Quaternion();
  for (const track of retargeted.tracks) {
    if (track.name.endsWith('.position')) continue;
    if (track instanceof THREE.QuaternionKeyframeTrack) {
      const dot = track.name.lastIndexOf('.');
      const boneName = track.name.slice(0, dot);
      const srcRest = sourceRest.get(boneName);
      const dstRest = targetRest.get(boneName);
      if (srcRest && dstRest) {
        const srcRestInv = srcRest.clone().invert();
        for (let i = 0; i < track.values.length; i += 4) {
          anim.set(track.values[i] ?? 0, track.values[i + 1] ?? 0, track.values[i + 2] ?? 0, track.values[i + 3] ?? 1);
          result.copy(anim).multiply(srcRestInv).multiply(dstRest);
          track.values[i] = result.x;
          track.values[i + 1] = result.y;
          track.values[i + 2] = result.z;
          track.values[i + 3] = result.w;
        }
      }
    }
    kept.push(track);
  }
  retargeted.tracks = kept;
  return retargeted;
}

async function load(): Promise<void> {
  const loader = new GLTFLoader();
  const [michelle, soldier] = await Promise.all([
    loader.loadAsync('/models/michelle/Michelle.glb'),
    loader.loadAsync('/models/soldier/Soldier.glb'),
  ]);

  const model = michelle.scene;
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  const box = new THREE.Box3().setFromObject(model);
  const height = box.max.y - box.min.y;
  if (height > 1e-4 && (height < 0.5 || height > 3)) model.scale.multiplyScalar(1.7 / height);

  player.add(model);

  const michelleRest = captureRestPose(model);
  const soldierRest = captureRestPose(soldier.scene);
  const retarget = (name: string): THREE.AnimationClip =>
    retargetClip(findClip(soldier.animations, name), soldierRest, michelleRest);

  mixer = new THREE.AnimationMixer(model);
  idleAction = mixer.clipAction(retarget('Idle'));
  walkAction = mixer.clipAction(retarget('Walk'));
  runAction = mixer.clipAction(retarget('Run'));
  for (const action of [idleAction, walkAction, runAction]) {
    action.play();
    action.enabled = true;
    action.setEffectiveWeight(0);
  }
  idleAction.setEffectiveWeight(1);
}

void load();

// Locomotion: WASD/arrows move in camera-relative ground plane, facing
// eases toward the move direction, and idle/walk/run blend by speed.
const keys = new Set<string>();
window.addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

const moveDir = new THREE.Vector3();
const camForward = new THREE.Vector3();
const camRight = new THREE.Vector3();
let facing = 0;
let speed01 = 0; // 0 idle, 1 walk, 2 run (blend domain)

const WALK_SPEED = 1.6;
const RUN_SPEED = 4.2;

function updateLocomotion(dt: number): void {
  const forward = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
  const strafe = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  const running = keys.has('shift');

  camera.getWorldDirection(camForward);
  camForward.y = 0;
  camForward.normalize();
  camRight.crossVectors(camForward, THREE.Object3D.DEFAULT_UP).normalize();

  moveDir.set(0, 0, 0);
  moveDir.addScaledVector(camForward, forward);
  moveDir.addScaledVector(camRight, strafe);
  const moving = moveDir.lengthSq() > 1e-6;
  if (moving) moveDir.normalize();

  const targetSpeed = moving ? (running ? RUN_SPEED : WALK_SPEED) : 0;
  const currentSpeed = THREE.MathUtils.lerp(
    speed01 <= 1 ? speed01 * WALK_SPEED : WALK_SPEED + (speed01 - 1) * (RUN_SPEED - WALK_SPEED),
    targetSpeed,
    Math.min(1, dt * 6),
  );
  speed01 = currentSpeed <= WALK_SPEED ? currentSpeed / WALK_SPEED : 1 + (currentSpeed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED);

  if (moving) {
    player.position.addScaledVector(moveDir, currentSpeed * dt);
    const targetFacing = Math.atan2(moveDir.x, moveDir.z);
    let diff = targetFacing - facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    facing += diff * Math.min(1, dt * 10);
    player.rotation.y = facing;
  }
  controls.target.lerp(new THREE.Vector3(player.position.x, player.position.y + 1.0, player.position.z), dt * 5);

  if (idleAction && walkAction && runAction) {
    const idleW = THREE.MathUtils.clamp(1 - speed01, 0, 1);
    const walkW = speed01 <= 1 ? THREE.MathUtils.clamp(speed01, 0, 1) : THREE.MathUtils.clamp(2 - speed01, 0, 1);
    const runW = THREE.MathUtils.clamp(speed01 - 1, 0, 1);
    idleAction.setEffectiveWeight(idleW);
    walkAction.setEffectiveWeight(walkW);
    runAction.setEffectiveWeight(runW);
  }
}

function onResize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta());
  updateLocomotion(dt);
  mixer?.update(dt);
  controls.update();
  renderer.render(scene, camera);
});
