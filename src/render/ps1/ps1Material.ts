import * as THREE from 'three';

// Shared uniforms so the snap grid can be tuned live across every material.
// The snap grid is deliberately COARSER than the framebuffer (~200x150) —
// PS1 vertex precision was worse than its output resolution, and the wobble
// reads more authentic that way. Values here are half-resolution.
export const ps1GlobalUniforms = {
  uSnapHalfRes: { value: new THREE.Vector2(100, 75) },
  uSnapEnabled: { value: 1.0 },
};

export function prepTexture(tex: THREE.Texture): THREE.Texture {
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// MeshLambertMaterial (per-vertex Gouraud lighting — the PS1 look) extended
// with clip-space vertex snapping and affine texture mapping.
//
// Affine trick: WebGL always perspective-corrects varyings and GLSL ES has no
// `noperspective`. Passing uv*w and w as varyings makes the hardware's own
// correction cancel out; dividing them in the fragment shader recovers a
// screen-space-linear (affine) UV, i.e. the PS1 texture warp.
export function makePS1Material(
  params: THREE.MeshLambertMaterialParameters = {},
): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ flatShading: true, ...params });
  if (mat.map) prepTexture(mat.map);
  const useAffine = mat.map !== null;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSnapHalfRes = ps1GlobalUniforms.uSnapHalfRes;
    shader.uniforms.uSnapEnabled = ps1GlobalUniforms.uSnapEnabled;

    let vertexDecl = 'uniform vec2 uSnapHalfRes;\nuniform float uSnapEnabled;\n';
    let vertexInject = /* glsl */ `
      if (uSnapEnabled > 0.5) {
        vec2 ps1NdcXY = gl_Position.xy / gl_Position.w;
        ps1NdcXY = floor(ps1NdcXY * uSnapHalfRes + 0.5) / uSnapHalfRes;
        gl_Position.xy = ps1NdcXY * gl_Position.w;
      }
    `;
    if (useAffine) {
      vertexDecl += 'varying vec2 vAffineUvW;\nvarying float vAffineW;\n';
      // Snap only touches xy, so gl_Position.w here is the true perspective w.
      vertexInject += /* glsl */ `
        vAffineW = gl_Position.w;
        vAffineUvW = vMapUv * gl_Position.w;
      `;
    }
    shader.vertexShader =
      vertexDecl +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n' + vertexInject,
      );

    if (useAffine) {
      shader.fragmentShader =
        'varying vec2 vAffineUvW;\nvarying float vAffineW;\n' +
        shader.fragmentShader.replace(
          '#include <map_fragment>',
          /* glsl */ `
          #ifdef USE_MAP
            vec4 sampledDiffuseColor = texture2D( map, vAffineUvW / max(vAffineW, 1e-5) );
            diffuseColor *= sampledDiffuseColor;
          #endif
          `,
        );
    }
  };
  mat.customProgramCacheKey = () => `ps1${useAffine ? '-affine' : ''}`;
  return mat;
}
