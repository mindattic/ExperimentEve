import * as THREE from 'three';
import { prepTexture } from '../render/ps1/ps1Material';

// Procedural CanvasTextures — the whole art budget. Low-res on purpose.

function canvas(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = size;
  const ctx = cnv.getContext('2d')!;
  draw(ctx, size);
  const tex = prepTexture(new THREE.CanvasTexture(cnv)) as THREE.CanvasTexture;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function noise(ctx: CanvasRenderingContext2D, s: number, alpha: number, seedShift = 0): void {
  for (let i = 0; i < s * s * 0.15; i++) {
    const v = 128 + Math.floor(((i * 2654435761 + seedShift) % 97) / 97 * 80 - 40);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect((i * 7919) % s, (i * 104729) % s, 1, 1);
  }
}

export function brickTexture(): THREE.CanvasTexture {
  return canvas(64, (ctx, s) => {
    ctx.fillStyle = '#4a3630';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#5a423a';
    const bh = 8;
    for (let y = 0; y < s; y += bh) {
      const off = (y / bh) % 2 === 0 ? 0 : 8;
      for (let x = -8; x < s; x += 16) {
        ctx.fillRect(x + off + 1, y + 1, 14, bh - 2);
      }
    }
    noise(ctx, s, 0.08);
  });
}

export function clapboardTexture(): THREE.CanvasTexture {
  return canvas(64, (ctx, s) => {
    ctx.fillStyle = '#5e6660';
    ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 8) {
      ctx.fillStyle = '#525a54';
      ctx.fillRect(0, y, s, 2);
      ctx.fillStyle = '#6a726c';
      ctx.fillRect(0, y + 2, s, 1);
    }
    noise(ctx, s, 0.06);
  });
}

export function asphaltTexture(): THREE.CanvasTexture {
  return canvas(64, (ctx, s) => {
    ctx.fillStyle = '#2e2e33';
    ctx.fillRect(0, 0, s, s);
    noise(ctx, s, 0.13);
    ctx.fillStyle = '#3e3e44';
    ctx.fillRect(0, 0, 2, s); // seam line
  });
}

export function grassTexture(): THREE.CanvasTexture {
  return canvas(64, (ctx, s) => {
    ctx.fillStyle = '#37402c';
    ctx.fillRect(0, 0, s, s);
    noise(ctx, s, 0.12, 13);
  });
}

export function gravelTexture(): THREE.CanvasTexture {
  return canvas(64, (ctx, s) => {
    ctx.fillStyle = '#4a453e';
    ctx.fillRect(0, 0, s, s);
    noise(ctx, s, 0.2, 29);
  });
}

export function chainlinkTexture(): THREE.CanvasTexture {
  const tex = canvas(32, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(180,185,190,0.9)';
    ctx.lineWidth = 1.5;
    for (let i = -s; i < s * 2; i += 8) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + s, s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i + s, 0);
      ctx.lineTo(i, s);
      ctx.stroke();
    }
  });
  return tex;
}

export function plankTexture(): THREE.CanvasTexture {
  return canvas(64, (ctx, s) => {
    ctx.fillStyle = '#4e4234';
    ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 10) {
      ctx.fillStyle = '#443a2e';
      ctx.fillRect(x, 0, 2, s);
    }
    noise(ctx, s, 0.07, 41);
  });
}

export function interiorTexture(): THREE.CanvasTexture {
  return canvas(64, (ctx, s) => {
    ctx.fillStyle = '#57504a';
    ctx.fillRect(0, 0, s, s);
    noise(ctx, s, 0.05, 7);
    ctx.fillStyle = '#4a443e';
    ctx.fillRect(0, s - 10, s, 10); // baseboard
  });
}
