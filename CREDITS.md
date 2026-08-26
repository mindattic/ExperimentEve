# Credits & Asset Sources

- **Kenney — Retro Urban Kit** (https://kenney.nl/assets/retro-urban-kit), CC0.
  Curated GLBs + textures in `public/models/retro-urban/` (trucks, dumpsters,
  barriers, scaffolding, cables, street furniture, trees). No attribution
  required; given gladly.
- All other meshes are procedural (Three.js primitives), all audio is
  synthesized at runtime (WebAudio), all textures outside the kit are
  generated CanvasTextures.
- Asset pipeline: GLB → `src/level/props/modelLoader.ts` → PS1 shader
  conversion (vertex snap, affine UVs, nearest-filter). Candidate future
  sources: Kenney/Quaternius CC0 packs, Polyfork (polyfork.dev), AI-generated
  GLB models.
