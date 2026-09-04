import * as THREE from 'three';
import { blitVertexShader, blitFragmentShader } from './ditherQuantize';

// PSX-HD: PS1 rendering grammar (vertex snap, affine warp, dither/quantize)
// at 4x the dots. 640x480 keeps the pixel identity readable without the
// DOS-era mush of 320x240 on a modern panel.
export const INTERNAL_WIDTH = 640;
export const INTERNAL_HEIGHT = 480;

// Renders the scene into the internal target, then blits it to the canvas
// with nearest-neighbor upscaling + dither/quantize. Letterboxed 4:3.
export class LowResPipeline {
  readonly renderer: THREE.WebGLRenderer;
  enabled = true;

  private readonly rt: THREE.WebGLRenderTarget;
  private readonly blitScene = new THREE.Scene();
  private readonly blitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private blitUniforms!: Record<string, THREE.IUniform>;

  /** CCTV warped-lens amount for the active camera zone (0 = normal). */
  setDistortion(v: number): void {
    this.blitUniforms['uDistortion']!.value = v;
  }

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);

    this.rt = new THREE.WebGLRenderTarget(INTERNAL_WIDTH, INTERNAL_HEIGHT, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
    });

    const blitMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.rt.texture },
        uInternalResolution: { value: new THREE.Vector2(INTERNAL_WIDTH, INTERNAL_HEIGHT) },
        uDitherStrength: { value: 1.0 },
        uDistortion: { value: 0.0 },
      },
      vertexShader: blitVertexShader,
      fragmentShader: blitFragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.blitUniforms = blitMaterial.uniforms;
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blitMaterial);
    quad.frustumCulled = false;
    this.blitScene.add(quad);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const availW = window.innerWidth;
    const availH = window.innerHeight;
    const aspect = INTERNAL_WIDTH / INTERNAL_HEIGHT;
    let w = availW;
    let h = Math.round(availW / aspect);
    if (h > availH) {
      h = availH;
      w = Math.round(availH * aspect);
    }
    this.renderer.setSize(w, h, true);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.enabled) {
      this.renderer.setRenderTarget(this.rt);
      this.renderer.render(scene, camera);
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.blitScene, this.blitCamera);
    } else {
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
    }
  }
}
