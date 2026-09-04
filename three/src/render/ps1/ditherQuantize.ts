// Fullscreen blit shaders: nearest upscale of the low-res target plus
// ordered Bayer dithering and RGB555 (15-bit) quantization in one pass.

export const blitVertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const blitFragmentShader = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uInternalResolution;
uniform float uDitherStrength;
uniform float uDistortion; // CCTV fisheye: 0 off, ~0.35 warped lens
varying vec2 vUv;

// Compact 4x4 Bayer: bayer2 yields the 2x2 base matrix, composed twice.
float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}

// The render target holds linear values (Three only encodes to sRGB when
// drawing to the canvas); encode here, then dither/quantize in gamma space
// like the PS1's framebuffer did.
vec3 lin2srgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 uv = vUv;
  float vignette = 1.0;
  if (uDistortion > 0.001) {
    vec2 cuv = uv - 0.5;
    float r2 = dot(cuv, cuv);
    uv = 0.5 + cuv * (1.0 + uDistortion * r2 * 3.0);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    vignette = 1.0 - uDistortion * r2 * 2.2;
  }
  vec3 c = lin2srgb(texture2D(tDiffuse, uv).rgb) * vignette;
  // Threshold pattern locked to INTERNAL pixels so the dither stays chunky
  // after the nearest upscale instead of dithering at native resolution.
  vec2 p = floor(uv * uInternalResolution);
  float threshold = bayer2(0.5 * p) * 0.25 + bayer2(p);
  c += (threshold - 0.5) / 31.0 * uDitherStrength;
  c = clamp(floor(c * 31.0 + 0.5) / 31.0, 0.0, 1.0);
  gl_FragColor = vec4(c, 1.0);
}
`;
