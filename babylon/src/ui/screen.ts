import { Matrix, Vector3, type Scene } from '@babylonjs/core';

// World -> screen, in viewport FRACTIONS with y measured down from the top.
//
// One helper, used by everything that needs it: the damage floaters, the
// Precision Aim hit test, and the headless harness. Babylon's Vector3.Project
// already lands in viewport pixels with y down, so this is a divide and
// nothing more — no NDC flip, unlike the equivalent path in Three.

export interface ScreenPoint {
  x: number;
  y: number;
  /** False when the point is behind the camera, where projection is garbage. */
  onScreen: boolean;
}

export function projectToScreen(scene: Scene, world: Vector3): ScreenPoint {
  const camera = scene.activeCamera;
  const engine = scene.getEngine();
  const width = engine.getRenderWidth();
  const height = engine.getRenderHeight();
  if (!camera) return { x: 0.5, y: 0.5, onScreen: false };

  const toPoint = world.subtract(camera.globalPosition);
  const facing = Vector3.Dot(toPoint, camera.getForwardRay().direction) > 0;

  const projected = Vector3.Project(
    world,
    Matrix.IdentityReadOnly,
    scene.getTransformMatrix(),
    camera.viewport.toGlobal(width, height),
  );
  const x = projected.x / width;
  const y = projected.y / height;
  return {
    x,
    y,
    onScreen: facing && x >= 0 && x <= 1 && y >= 0 && y <= 1,
  };
}
