import type { CameraZoneDef } from '../camera/cameraZone';

export type WallTex = 'brick' | 'clapboard' | 'plank' | 'interior' | 'plain';

export interface WallDef {
  a: [number, number];
  b: [number, number];
  h?: number;
  tex?: WallTex;
  /** Collider-only (invisible boundary). */
  invisible?: boolean;
  /** Collider exists only while this GameState flag is FALSE. */
  gated?: string;
}

export interface BoxDef {
  min: [number, number];
  max: [number, number];
  h?: number;
  y?: number;
  color?: number;
  /** Visual-only (no collider). */
  noCollide?: boolean;
  /** Collider-only (a fancier prop mesh stands in visually). */
  hidden?: boolean;
}

export interface FenceDef {
  a: [number, number];
  b: [number, number];
  h?: number;
}

export interface GroundPatch {
  min: [number, number];
  max: [number, number];
  tex: 'asphalt' | 'grass' | 'gravel' | 'interior';
}

export interface TriggerDef {
  id: string;
  polygon: [number, number][];
  once: boolean;
}

/**
 * Interactables are carried through as opaque data for now — the interaction
 * system lands with a later EVEGDD chapter, but the authored placements are
 * worth keeping intact.
 */
export interface InteractableDef {
  id: string;
  x: number;
  z: number;
  prompt: string;
  kind: string;
  floorY?: number;
  radius?: number;
  once?: boolean;
  [extra: string]: unknown;
}

export interface LevelDef {
  playerStart: [number, number];
  playerFacing: number;
  zones: CameraZoneDef[];
  walls: WallDef[];
  boxes: BoxDef[];
  fences: FenceDef[];
  ground: GroundPatch[];
  interactables: InteractableDef[];
  triggers: TriggerDef[];
}
