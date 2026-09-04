import * as THREE from 'three';
import { prepTexture } from '../../render/ps1/ps1Material';

// The duel: SOAK (father) and REN (son) argue across the city in paint.
// One wall, three stages — each story flag lets the other answer back.

export type GraffitiStage = 0 | 1 | 2;

function draw(stage: GraffitiStage): HTMLCanvasElement {
  const cnv = document.createElement('canvas');
  cnv.width = 128;
  cnv.height = 64;
  const ctx = cnv.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 64);

  // Stage 0 — REN's piece, hopeful, green bubble letters.
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.strokeStyle = '#0a2a12';
  ctx.lineWidth = 4;
  ctx.strokeText('PROVIDENCE', 64, 26);
  ctx.fillStyle = '#4ac04a';
  ctx.fillText('PROVIDENCE', 64, 26);
  ctx.strokeText('IS REAL', 64, 48);
  ctx.fillStyle = '#4ac04a';
  ctx.fillText('IS REAL', 64, 48);
  ctx.font = 'bold 9px sans-serif';
  ctx.fillStyle = '#7ae07a';
  ctx.fillText('-REN', 112, 60);

  if (stage >= 1) {
    // Stage 1 — SOAK strikes through and answers in white stencil caps.
    ctx.strokeStyle = '#e8e8e0';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(8, 20);
    ctx.lineTo(120, 34);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(8, 44);
    ctx.lineTo(120, 52);
    ctx.stroke();
    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = '#e8e8e0';
    ctx.fillText('A LIE', 64, 14);
    ctx.font = 'bold 8px monospace';
    ctx.fillText('SOAK', 16, 60);
  }

  if (stage >= 2) {
    // Stage 2 — REN, in red, under everything: the question that ends it.
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#e04040';
    ctx.fillText('THEN WHY DO THE', 64, 40);
    ctx.fillText('BOATS GO NORTH?', 64, 52);
  }
  return cnv;
}

export class GraffitiWall {
  readonly mesh: THREE.Mesh;
  private stage: GraffitiStage = 0;
  private readonly mat: THREE.MeshLambertMaterial;

  constructor(x: number, y: number, z: number, rotY: number) {
    this.mat = new THREE.MeshLambertMaterial({
      map: prepTexture(new THREE.CanvasTexture(draw(0))),
      transparent: true,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), this.mat);
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.y = rotY;
  }

  setStage(stage: GraffitiStage): void {
    if (stage === this.stage) return;
    this.stage = stage;
    this.mat.map?.dispose();
    this.mat.map = prepTexture(new THREE.CanvasTexture(draw(stage))) as THREE.CanvasTexture;
    this.mat.needsUpdate = true;
  }
}
