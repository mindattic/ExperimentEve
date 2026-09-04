import type { PointLight, Vector3 } from '@babylonjs/core';

// The district has a dozen-odd lamps, storefront signs and lit windows, but a
// WebGL fragment shader can only carry a handful of lights before it runs out
// of uniform buffers (Babylon compiles one slot per light, and the water
// shader hit GL_MAX_VERTEX_UNIFORM_BUFFERS at 16).
//
// So: only the nearest few point lights are ever enabled. The count enabled is
// held CONSTANT rather than varying with proximity — Babylon recompiles a
// mesh's shader whenever the number of lights affecting it changes, and a
// recompile mid-walk is a visible hitch.

export const ACTIVE_POINT_LIGHTS = 4;
/** The moon and the hemisphere fill, plus ACTIVE_POINT_LIGHTS lamps. */
export const MAX_MATERIAL_LIGHTS = 2 + ACTIVE_POINT_LIGHTS;

export class LightRig {
  private ranked: { light: PointLight; d2: number }[] = [];

  constructor(private lights: PointLight[]) {
    for (const light of lights) light.setEnabled(false);
    for (const light of lights.slice(0, ACTIVE_POINT_LIGHTS)) light.setEnabled(true);
  }

  /** Keep the N nearest lamps lit, everything else dark. */
  update(target: Vector3): void {
    this.ranked = this.lights.map((light) => {
      // Lamps are parented to their post, so the world position is the one
      // that matters here, not the local offset.
      const at = light.getAbsolutePosition();
      return {
        light,
        d2: (at.x - target.x) ** 2 + (at.z - target.z) ** 2,
      };
    });
    this.ranked.sort((a, b) => a.d2 - b.d2);
    for (let i = 0; i < this.ranked.length; i++) {
      const entry = this.ranked[i]!;
      const shouldBeOn = i < ACTIVE_POINT_LIGHTS;
      if (entry.light.isEnabled() !== shouldBeOn) entry.light.setEnabled(shouldBeOn);
    }
  }
}
