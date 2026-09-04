import {
  Color3,
  Color4,
  CubeTexture,
  DefaultRenderingPipeline,
  DirectionalLight,
  DynamicTexture,
  Effect,
  Engine,
  HemisphericLight,
  ImageProcessingConfiguration,
  Mesh,
  MeshBuilder,
  PostProcess,
  ReflectionProbe,
  RenderTargetTexture,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Texture,
  Vector3,
  type Camera,
} from '@babylonjs/core';

// Rendering is deliberately NOT the PS1 pipeline the Three build used: no
// 640x480 internal buffer, no ordered-dither quantization, no vertex snapping,
// no affine UV warping. Full resolution, PBR, real shadows, sky-lit IBL, ACES
// tone mapping. The 1998 survival-horror read comes from palette, lighting and
// fog instead of from destroyed pixels.

export interface Rendering {
  engine: Engine;
  scene: Scene;
  skybox: Mesh;
  moon: DirectionalLight;
  hemi: HemisphericLight;
  shadows: ShadowGenerator;
  /** Re-tint sky/lights/fog for a 0 (dusk) .. 1 (full night) darkness. */
  applyTimeOfDay(darkness: number): void;
  /** Keep the shadow window centred on the player for crisp contact shadows. */
  followShadows(target: Vector3): void;
  /** CCTV lens warp, 0 = clean glass. */
  setFisheye(amount: number): void;
}

const DUSK = {
  skyTop: new Color3(0.16, 0.2, 0.34),
  skyHorizon: new Color3(0.62, 0.42, 0.31),
  moon: new Color3(1.0, 0.83, 0.66),
  hemiSky: new Color3(0.42, 0.45, 0.58),
  hemiGround: new Color3(0.2, 0.17, 0.15),
  fog: new Color3(0.36, 0.33, 0.35),
  moonIntensity: 2.4,
  hemiIntensity: 1.15,
  fogDensity: 0.012,
};

const NIGHT = {
  skyTop: new Color3(0.014, 0.018, 0.038),
  skyHorizon: new Color3(0.05, 0.07, 0.12),
  moon: new Color3(0.62, 0.72, 1.0),
  hemiSky: new Color3(0.11, 0.14, 0.22),
  hemiGround: new Color3(0.035, 0.04, 0.05),
  fog: new Color3(0.035, 0.045, 0.07),
  moonIntensity: 0.85,
  hemiIntensity: 0.52,
  fogDensity: 0.03,
};

Effect.ShadersStore['cctvLensFragmentShader'] = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform float amount;

void main(void) {
  vec2 c = vUV - 0.5;
  float r2 = dot(c, c);
  // Barrel distortion: the cheap wide-angle glass in a 1998 security camera.
  vec2 warped = c * (1.0 + amount * r2 * 2.2) + 0.5;
  if (warped.x < 0.0 || warped.x > 1.0 || warped.y < 0.0 || warped.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec3 col = texture2D(textureSampler, warped).rgb;
  // Corner falloff and a touch of green bias — videotape, not film.
  float vig = smoothstep(0.85, 0.15, r2 * 1.6);
  col *= mix(1.0, vig, clamp(amount * 2.4, 0.0, 1.0));
  col.g *= 1.0 + amount * 0.05;
  gl_FragColor = vec4(col, 1.0);
}
`;

/** Engine first, then a Scene, then the camera — this dresses that scene. */
export function createEngine(canvas: HTMLCanvasElement): Engine {
  const engine = new Engine(canvas, true, {
    antialias: true,
    powerPreference: 'high-performance',
    stencil: true,
  }, false);
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));
  return engine;
}

export function createRendering(engine: Engine, scene: Scene, camera: Camera): Rendering {
  scene.clearColor = new Color4(0.01, 0.012, 0.02, 1);
  scene.ambientColor = new Color3(0.08, 0.09, 0.13);

  const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
  const moon = new DirectionalLight('moon', new Vector3(-0.45, -1, -0.35).normalize(), scene);
  moon.position = new Vector3(12, 26, 18);
  // A fixed, player-following orthographic window keeps 2048px of shadow map
  // on the few metres that matter instead of smearing it over the district.
  moon.autoUpdateExtends = false;
  moon.shadowFrustumSize = 34;
  moon.shadowMinZ = 1;
  moon.shadowMaxZ = 70;

  const shadows = new ShadowGenerator(2048, moon);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_HIGH;
  shadows.bias = 0.008;
  shadows.normalBias = 0.02;
  shadows.darkness = 0.35;

  const skybox = createSkyDome(scene);

  // Sky-only IBL. Refreshed on demand (see applyTimeOfDay) rather than every
  // frame — the sky changes over minutes, not milliseconds.
  const probe = new ReflectionProbe('skyProbe', 128, scene);
  probe.renderList?.push(skybox);
  probe.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
  scene.environmentTexture = probe.cubeTexture as unknown as CubeTexture;
  scene.environmentIntensity = 0.85;

  scene.fogMode = Scene.FOGMODE_EXP2;

  const pipeline = new DefaultRenderingPipeline('main', true, scene, [camera]);
  pipeline.samples = 4;
  pipeline.fxaaEnabled = true;
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.72;
  pipeline.bloomWeight = 0.35;
  pipeline.bloomKernel = 48;
  pipeline.bloomScale = 0.5;
  pipeline.sharpenEnabled = true;
  pipeline.sharpen.edgeAmount = 0.18;
  pipeline.imageProcessingEnabled = true;
  pipeline.imageProcessing.toneMappingEnabled = true;
  pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  pipeline.imageProcessing.contrast = 1.28;
  pipeline.imageProcessing.exposure = 1.05;
  pipeline.imageProcessing.vignetteEnabled = true;
  pipeline.imageProcessing.vignetteWeight = 2.2;
  pipeline.imageProcessing.vignetteStretch = 0.4;
  pipeline.imageProcessing.vignetteColor = new Color4(0, 0, 0, 0);

  // Created after the pipeline so it lands last in the camera's chain.
  const lens = new PostProcess(
    'cctvLens', 'cctvLens', ['amount'], null, 1.0, camera,
  );
  let fisheye = 0;
  lens.onApply = (effect) => effect.setFloat('amount', fisheye);

  const gradient = skybox.material as StandardMaterial;
  const skyTex = gradient.emissiveTexture as DynamicTexture;

  let lastSkyDarkness = -1;

  const applyTimeOfDay = (darkness: number): void => {
    const t = Math.min(1, Math.max(0, darkness));
    const lerp3 = (a: Color3, b: Color3): Color3 => Color3.Lerp(a, b, t);
    const num = (a: number, b: number): number => a + (b - a) * t;

    moon.diffuse = lerp3(DUSK.moon, NIGHT.moon);
    moon.intensity = num(DUSK.moonIntensity, NIGHT.moonIntensity);
    hemi.diffuse = lerp3(DUSK.hemiSky, NIGHT.hemiSky);
    hemi.groundColor = lerp3(DUSK.hemiGround, NIGHT.hemiGround);
    hemi.intensity = num(DUSK.hemiIntensity, NIGHT.hemiIntensity);

    const fog = lerp3(DUSK.fog, NIGHT.fog);
    scene.fogColor = fog;
    scene.fogDensity = num(DUSK.fogDensity, NIGHT.fogDensity);
    scene.clearColor = new Color4(fog.r, fog.g, fog.b, 1);

    // Repainting the sky canvas is cheap but not free; only when it shows.
    if (Math.abs(t - lastSkyDarkness) > 0.02) {
      lastSkyDarkness = t;
      paintSky(skyTex, lerp3(DUSK.skyTop, NIGHT.skyTop), lerp3(DUSK.skyHorizon, NIGHT.skyHorizon), t);
      probe.cubeTexture.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    }
  };

  const followShadows = (target: Vector3): void => {
    // Park the light 24m up-sun of her so the ortho window travels with her.
    moon.position.set(
      target.x - moon.direction.x * 24,
      target.y - moon.direction.y * 24,
      target.z - moon.direction.z * 24,
    );
  };

  applyTimeOfDay(0.35);

  return {
    engine,
    scene,
    skybox,
    moon,
    hemi,
    shadows,
    applyTimeOfDay,
    followShadows,
    setFisheye: (amount: number) => {
      fisheye = amount;
    },
  };
}

function createSkyDome(scene: Scene): Mesh {
  const dome = MeshBuilder.CreateSphere('sky', { diameter: 400, segments: 24, sideOrientation: Mesh.BACKSIDE }, scene);
  dome.infiniteDistance = true;
  dome.isPickable = false;
  dome.applyFog = false;

  const tex = new DynamicTexture('skyTex', { width: 256, height: 512 }, scene, false);
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;

  const mat = new StandardMaterial('skyMat', scene);
  mat.disableLighting = true;
  mat.emissiveTexture = tex;
  mat.diffuseColor = Color3.Black();
  mat.specularColor = Color3.Black();
  mat.backFaceCulling = false;
  dome.material = mat;

  paintSky(tex, DUSK.skyTop, DUSK.skyHorizon, 0.35);
  return dome;
}

/** Vertical gradient plus a star field that fades in with the darkness. */
function paintSky(tex: DynamicTexture, top: Color3, horizon: Color3, darkness: number): void {
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const { width, height } = tex.getSize();
  const css = (c: Color3): string =>
    `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;

  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, css(top));
  grad.addColorStop(0.48, css(Color3.Lerp(top, horizon, 0.55)));
  grad.addColorStop(0.62, css(horizon));
  grad.addColorStop(1, css(Color3.Lerp(horizon, top, 0.35)));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Deterministic stars, so the sky doesn't reshuffle every repaint.
  const starAlpha = Math.max(0, (darkness - 0.4) / 0.6);
  if (starAlpha > 0) {
    let seed = 20614;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 420; i++) {
      const x = rand() * width;
      const y = rand() * height * 0.52; // upper hemisphere only
      const r = rand() * 0.9 + 0.25;
      const a = (rand() * 0.7 + 0.3) * starAlpha;
      ctx.fillStyle = `rgba(255,252,240,${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  tex.update(false);
}
