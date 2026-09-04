# Credits & Asset Sources

- **Kenney — Retro Urban Kit** (https://kenney.nl/assets/retro-urban-kit), CC0.
  Curated GLBs + textures in `public/models/retro-urban/` (trucks, dumpsters,
  barriers, scaffolding, cables, street furniture, trees). No attribution
  required; given gladly.
- **"City Pack"** (user-supplied download; 32 curated GLBs in
  `public/models/city-pack/`): buildings, vehicles, street furniture,
  fire exit. TODO: record the original source/license here (looks like a
  Quaternius/Poly-style CC0 pack — confirm).
- **Michelle** and **Soldier** (`public/models/michelle/`, `public/models/soldier/`):
  Mixamo-rigged glTF characters bundled with three.js's own examples
  (`examples/models/gltf/`). Free for any use, no attribution required.
  Used by `src/dev/characterPreview.ts`, a standalone full-fidelity PBR
  character preview (WASD locomotion, retargeted Idle/Walk/Run) kept
  separate from the PS1 game pipeline — see `character-preview.html`.
- **Quaternius — Universal Base Characters** and **Universal Animation
  Library** (https://quaternius.com), CC0 1.0. In `public/models/kat/`: the
  female base body, the `Hair_Long` mesh, and `UAL1_Standard.glb` (43 clips).
  Used as Kat in the Babylon build (`babylon/src/player/playerCharacter.ts`).
  Chosen as a pair because both ship the *same* 65-joint rig in the same joint
  order, so the clips and the hair's skinning apply with no retargeting.
  Her clothes are not from the (medieval-only) outfit pack — they are painted
  into her albedo procedurally by `babylon/src/player/outfit.ts`.
- **Quaternius — LowPoly Animated Easy Enemies / Monsters / Fish**
  (https://quaternius.com), CC0 1.0. In `public/models/creatures/`: Frog, Rat,
  Snake, Spider, Wasp, Bat, Slime, Fish1, Fish2, Shark, Manta ray — each with
  its own rig and its own clips (Idle/Walk/Attack/Death on the land animals,
  Swim or Flying on the rest). Those packs ship `.blend`/`.fbx`/`.obj` only, so
  the `.glb` files here were exported from the pack `.blend` sources with
  Blender 3.3 headless (skins + all actions): Babylon has no FBX loader, and
  `.obj` carries no rig. Loaded by `babylon/src/enemies/creature.ts`.
- All other meshes are procedural primitives, all audio is synthesized at
  runtime (WebAudio), and all textures outside the kits are generated at
  load time onto canvases.
- Asset pipeline: GLB → `src/level/props/modelLoader.ts` → PS1 shader
  conversion (vertex snap, affine UVs, nearest-filter). Candidate future
  sources: Kenney/Quaternius CC0 packs, Polyfork (polyfork.dev), AI-generated
  GLB models.
