import type { LevelDef } from './levelTypes';

// Kingsport North End by the Colony Line rails (design ref: Newport, RI).
// +Z is "north" (toward the tracks); she works her way SOUTH toward the
// Bell Bridge approach, then east through chain-link corridors to the garage.
//
// Areas: tracks (z 30..40) -> street A (z 6..30, house1 enterable on the
// west side) -> cross street (z 0..6, pawnshop + graffiti) -> south street
// (z -18..0, frog street) -> blockade (z -26..-17, jackknifed semi, pylons)
// -> chain-link corridor east (x 6..26) -> north (z -18..-6) -> garage.

export const LEVEL01: LevelDef = {
  playerStart: [0, 36],
  playerFacing: Math.PI, // facing -Z (south, toward town)

  zones: [
    {
      id: 'tracks',
      polygon: [[-14, 30], [14, 30], [14, 40], [-14, 40]],
      cameraPosition: [0, 5, 44],
      cameraLookAt: [0, 1, 32],
      forward: [0, -1],
    },
    {
      id: 'streetA-north',
      polygon: [[-4, 16], [4, 16], [4, 31], [-4, 31]],
      cameraPosition: [0, 4.5, 30.5],
      cameraLookAt: [0, 1, 18],
      forward: [0, -1],
    },
    {
      id: 'streetA-south',
      polygon: [[-4, 5], [4, 5], [4, 18], [-4, 18]],
      cameraPosition: [2.6, 4, 17.2],
      cameraLookAt: [-1, 0.8, 8],
      forward: [0, -1],
    },
    {
      id: 'house1',
      polygon: [[-11, 19], [-4, 19], [-4, 27], [-11, 27]],
      cameraPosition: [-4.7, 3, 19.8],
      cameraLookAt: [-9, 0.6, 24.5],
      forward: [-1, 0],
      fov: 62,
    },
    {
      id: 'crossStreet',
      polygon: [[-14, -1], [14, -1], [14, 6], [-14, 6]],
      cameraPosition: [-12.8, 5.2, 5.2],
      cameraLookAt: [2, 0.8, 2.5],
      forward: [0, -1],
      // The Observer's lens: pole-mounted CCTV that pans to follow Kat.
      mode: 'cctv',
      fisheye: 0.32,
    },
    {
      id: 'southStreet',
      polygon: [[-4, -19], [4, -19], [4, 0], [-4, 0]],
      cameraPosition: [0, 4.2, -0.5],
      cameraLookAt: [0, 1, -12],
      forward: [0, -1],
    },
    {
      id: 'blockade',
      polygon: [[-14, -30], [6, -30], [6, -17], [-14, -17]],
      cameraPosition: [-12.5, 4.5, -18.5],
      cameraLookAt: [-1, 1.2, -22],
      forward: [1, 0],
    },
    {
      id: 'corridorE',
      polygon: [[6, -21.5], [26.5, -21.5], [26.5, -17.5], [6, -17.5]],
      cameraPosition: [7, 3, -19.5],
      cameraLookAt: [20, 1, -19.5],
      forward: [1, 0],
      fov: 60,
    },
    {
      // Pawnshop roof — reached by the fire escape. Footprint sits outside
      // every street zone's polygon, so no elevation logic is needed.
      id: 'pawnRoof',
      polygon: [[6, 6], [12, 6], [12, 10], [6, 10]],
      cameraPosition: [6.8, 7.2, 4.8],
      cameraLookAt: [9.5, 3.9, 8.5],
      forward: [0, 1],
      fov: 58,
    },
    {
      id: 'pocketYard',
      polygon: [[18, -16], [23, -16], [23, -6], [18, -6]],
      cameraPosition: [18.8, 3.6, -15.2],
      cameraLookAt: [21.5, 0.8, -10],
      forward: [0, 1],
      // Another of the Observer's lenses: it pans, and it saw this coming.
      mode: 'cctv',
      fisheye: 0.22,
    },
    {
      id: 'corridorN',
      polygon: [[22.5, -18], [26.5, -18], [26.5, -5], [22.5, -5]],
      cameraPosition: [24.5, 3.5, -17.5],
      cameraLookAt: [24.5, 1, -7],
      forward: [0, 1],
      fov: 60,
    },
    {
      id: 'garage',
      polygon: [[18, -6], [30, -6], [30, 2], [18, 2]],
      cameraPosition: [29.2, 3.4, -5.2],
      cameraLookAt: [21, 0.8, 0.5],
      forward: [0, 1],
    },
  ],

  walls: [
    // Tracks embankment: south retaining wall with a stair gap at x[-2,2].
    { a: [-14, 30], b: [-2, 30], tex: 'plank', h: 1.6 },
    { a: [2, 30], b: [14, 30], tex: 'plank', h: 1.6 },
    { a: [-14, 40], b: [14, 40], invisible: true },
    { a: [-14, 30], b: [-14, 40], invisible: true },
    { a: [14, 30], b: [14, 40], invisible: true },

    // House1 exterior (clapboard), door gap on the east wall z[22,24].
    { a: [-4, 19], b: [-4, 22], tex: 'clapboard', h: 3 },
    { a: [-4, 24], b: [-4, 27], tex: 'clapboard', h: 3 },
    { a: [-11, 27], b: [-4, 27], tex: 'clapboard', h: 3 },
    { a: [-11, 19], b: [-4, 19], tex: 'clapboard', h: 3 },
    { a: [-11, 19], b: [-11, 27], tex: 'clapboard', h: 3 },
    // House1 interior: living (east), bedroom (NW), bathroom (SW).
    { a: [-7, 19], b: [-7, 21], tex: 'interior', h: 2.6 },
    { a: [-7, 22.2], b: [-7, 24.5], tex: 'interior', h: 2.6 },
    { a: [-7, 25.7], b: [-7, 27], tex: 'interior', h: 2.6 },
    { a: [-11, 23], b: [-7, 23], tex: 'interior', h: 2.6 },

    // Cross street north edge: house backs, pawnshop face is its own box.
    { a: [-14, 6], b: [-4, 6], tex: 'brick', h: 3 },
    { a: [12, 6], b: [14, 6], tex: 'brick', h: 3 },
    // Cross street south edge with the southStreet opening x[-4,4].
    { a: [-14, 0], b: [-4, 0], tex: 'brick', h: 3.2 }, // graffiti wall (west run)
    { a: [4, 0], b: [14, 0], tex: 'brick', h: 3 },
    { a: [-14, 0], b: [-14, 6], tex: 'brick', h: 3 },
    { a: [14, 0], b: [14, 6], tex: 'brick', h: 3 },

    // South street: row-house backs both sides.
    { a: [-4, -17], b: [-4, 0], tex: 'brick', h: 3.2 },
    { a: [4, -17], b: [4, 0], tex: 'brick', h: 3.2 },

    // Blockade perimeter.
    { a: [-14, -17], b: [-4, -17], tex: 'brick', h: 3 },
    { a: [-14, -30], b: [-14, -17], tex: 'brick', h: 3 },
    // Past-the-truck gate: collider only while the fire still burns.
    { a: [-14, -26], b: [6, -26], invisible: true, gated: 'fireOut' },
    // South strip (slice exit once the fire dies).
    { a: [-14, -30], b: [6, -30], invisible: true },
    { a: [6, -30], b: [6, -26], tex: 'brick', h: 3 },

    // Garage (brick shell), door gap x[23,26] on the south wall.
    // Boarded shortcut panel (axe-choppable) in the east alley fence line.
    { a: [4, 18], b: [4, 19.2], tex: 'plank', h: 2.1, gated: 'chopped1' },
    // Pawnshop roof parapet: invisible, tall enough to hold at roof height.
    { a: [6, 6], b: [12, 6], invisible: true, h: 99 },
    { a: [12, 6], b: [12, 10], invisible: true, h: 99 },
    { a: [12, 10], b: [6, 10], invisible: true, h: 99 },
    { a: [6, 10], b: [6, 6], invisible: true, h: 99 },
    // The Observer's gate: electric-locked side gate in the corridor fence.
    { a: [23, -13], b: [23, -11.6], tex: 'plank', h: 2.2, gated: 'observerGate' },
    // Pocket yard enclosure (west/south).
    { a: [18, -16], b: [18, -6], invisible: true },
    { a: [18, -16], b: [23, -16], invisible: true },
    { a: [18, -6], b: [23, -6], tex: 'brick', h: 3.4 },
    { a: [26, -6], b: [30, -6], tex: 'brick', h: 3.4 },
    { a: [18, -6], b: [18, 2], tex: 'brick', h: 3.4 },
    { a: [18, 2], b: [30, 2], tex: 'brick', h: 3.4 },
    { a: [30, -6], b: [30, 2], tex: 'brick', h: 3.4 },
  ],

  fences: [
    // Alley gaps between street A facades.
    { a: [-4, 6], b: [-4, 8] },
    { a: [-4, 16], b: [-4, 19] },
    { a: [-4, 27], b: [-4, 30] },
    { a: [4, 6], b: [4, 10] },
    { a: [4, 17], b: [4, 18] }, // boarded panel between these two stubs
    { a: [4, 19.2], b: [4, 20] },
    { a: [4, 27], b: [4, 30] },
    // Cross street NE gap.
    { a: [4, 6], b: [6, 6] },
    // Blockade east edge below the corridor mouth.
    { a: [6, -26], b: [6, -21] },
    { a: [6, -18], b: [6, -17] },
    { a: [4, -17], b: [6, -17] },
    // Chain-link corridor east, then north to the garage.
    { a: [6, -18], b: [23, -18] },
    { a: [6, -21], b: [26, -21] },
    // Dobermans lunge from behind this run (M15); a padlocked side gate
    // sits in the gap — the Observer opens it when it matters.
    { a: [23, -18], b: [23, -13] },
    { a: [23, -11.6], b: [23, -6] },
    { a: [26, -21], b: [26, -6] },
  ],

  boxes: [
    // Rails (visual only).
    { min: [-14, 35.1], max: [14, 35.35], h: 0.14, color: 0x8a8f94, noCollide: true },
    { min: [-14, 36.6], max: [14, 36.85], h: 0.14, color: 0x8a8f94, noCollide: true },
    { min: [-14, 34.6], max: [14, 37.4], h: 0.05, color: 0x3d3a34, noCollide: true },

    // Street A facades (colliders only — facades.ts supplies the meshes).
    { min: [-11, 8], max: [-4, 16], h: 3.4, hidden: true },
    { min: [4, 10], max: [11, 17], h: 3.4, hidden: true }, // MEGAHIT VIDEO
    { min: [4, 20], max: [11, 27], h: 3.2, hidden: true },

    // Pawnshop (cross street, north side; collider only).
    { min: [6, 6], max: [12, 10], h: 3.6, hidden: true },

    // House1 furniture.
    { min: [-10.8, 26.2], max: [-10, 27], h: 0.55, color: 0x6a5747 }, // nightstand
    { min: [-8.2, 26.2], max: [-7.2, 27], h: 1.1, color: 0x5d4a3c }, // dresser
    { min: [-10.9, 19.2], max: [-10.1, 19.9], h: 0.9, color: 0x8b8f92 }, // bath cabinet
    { min: [-9.6, 19.3], max: [-7.9, 20.2], h: 0.55, color: 0xb8bcc0 }, // bathtub
    { min: [-4.9, 25.9], max: [-4.2, 27], h: 1.6, color: 0x5d4a3c }, // shelf
    { min: [-6.6, 19.2], max: [-4.9, 20], h: 0.9, color: 0x707a80 }, // kitchen sink counter
    { min: [-5, 22.7], max: [-4.4, 23.3], h: 0.75, color: 0x6a6258 }, // phone table + answering machine
    { min: [-8, 23.2], max: [-7.2, 24.4], h: 2.1, color: 0x5a4c40 }, // bedroom closet
    { min: [-12.1, 21.1], max: [-11.4, 21.9], h: 0.9, color: 0x2e3236 }, // backyard grill

    // South street trash.
    { min: [3.1, -4.4], max: [3.9, -3.6], h: 1, color: 0x4e565c },
    { min: [-3.9, -12.4], max: [-3.1, -11.6], h: 1, color: 0x4e565c },

    // Jackknifed semi: cab + trailer at odd angles (offset AABBs), pylons.
    { min: [-6.5, -25], max: [-3, -22], h: 2.6, color: 0x6a2f28 }, // cab
    { min: [-3, -23.4], max: [6, -21.2], h: 2.9, color: 0x7d8288 }, // trailer
    { min: [-12, -26], max: [-10, -23.5], h: 9, color: 0x707478 }, // bridge pylon
    { min: [-9, -26], max: [-7, -24], h: 9, color: 0x686c70 }, // bridge pylon

    // Garage props.
    { min: [27.8, -0.2], max: [30, 0.9], h: 1, color: 0x5a5248 }, // workbench
    { min: [19, 0.6], max: [19.9, 1.5], h: 0.9, color: 0x4a5560 }, // lamp pedestal
    { min: [18.2, -4.6], max: [18.5, -3.8], h: 0.6, y: 1, color: 0x8a2020, noCollide: true }, // axe case

    // Salvage props: dead cars, a curb couch.
    { min: [-1, 1.4], max: [1.2, 3.4], h: 1.15, color: 0x54383a }, // dead sedan, cross street
    { min: [-2.6, -15.2], max: [-0.6, -13.4], h: 1.15, color: 0x3c4652 }, // dead wagon, south street
    { min: [-6.6, 17.1], max: [-4.9, 17.9], h: 0.75, color: 0x6a4a52 }, // curb couch

    // A bicycle leaning on the east fence of street A.
    { min: [3.4, 23.6], max: [3.8, 24.6], h: 0.9, color: 0x8a4420, noCollide: true },
    // Payphone by the pawnshop (the Observer's other channel).
    { min: [12.3, 4.3], max: [12.9, 4.9], h: 2.2, color: 0x2a4a6a },
    // Fire escape rails on the pawnshop's east face.
    { min: [12.02, 8.1], max: [12.14, 8.22], h: 3.2, y: 0.5, color: 0x3a3f44, noCollide: true },
    { min: [12.02, 8.58], max: [12.14, 8.7], h: 3.2, y: 0.5, color: 0x3a3f44, noCollide: true },
  ],

  ground: [
    { min: [-14, 30], max: [14, 40], tex: 'gravel' },
    { min: [-4, 6], max: [4, 30], tex: 'asphalt' },
    { min: [-14, 6], max: [-4, 19], tex: 'grass' },
    { min: [-14, 19], max: [-11, 30], tex: 'grass' },
    { min: [-11, 27], max: [-4, 30], tex: 'grass' },
    { min: [4, 6], max: [14, 30], tex: 'grass' },
    { min: [-11, 19], max: [-4, 27], tex: 'interior' },
    { min: [-14, 0], max: [14, 6], tex: 'asphalt' },
    { min: [-4, -17], max: [4, 0], tex: 'asphalt' },
    { min: [-14, -26], max: [6, -17], tex: 'asphalt' },
    { min: [-14, -30], max: [6, -26], tex: 'asphalt' },
    { min: [6, -21], max: [26, -18], tex: 'gravel' },
    { min: [23, -18], max: [26, -6], tex: 'gravel' },
    { min: [18, -16], max: [23, -6], tex: 'gravel' }, // pocket yard behind the Observer's gate
    { min: [18, -18.5], max: [23, -16], tex: 'gravel' }, // dog strip south of the yard
    { min: [18, -6], max: [30, 2], tex: 'interior' },
  ],

  interactables: [
    { id: 'nightstand1', x: -10.3, z: 26, prompt: 'Search the nightstand', kind: 'container', roomType: 'bedroom', containerType: 'nightstand' },
    { id: 'dresser1', x: -7.7, z: 26.1, prompt: 'Search the dresser', kind: 'container', roomType: 'bedroom', containerType: 'dresser' },
    { id: 'closet1', x: -7.9, z: 23.8, prompt: 'Search the closet', kind: 'container', roomType: 'bedroom', containerType: 'closet' },
    { id: 'bathcab1', x: -10.4, z: 20.2, prompt: 'Search the medicine cabinet', kind: 'container', roomType: 'bathroom', containerType: 'cabinet' },
    { id: 'tub-house1', x: -8.7, z: 20.5, prompt: 'Draw a bath', kind: 'inspect', once: false },
    { id: 'shelf1', x: -5.1, z: 26.2, prompt: 'Search the shelf', kind: 'container', roomType: 'living', containerType: 'shelf' },
    { id: 'sink1', x: -5.7, z: 20.3, prompt: 'Check under the sink', kind: 'container', roomType: 'kitchen', containerType: 'sink' },
    { id: 'trash1', x: 3.1, z: -4, prompt: 'Search the trash can', kind: 'container', roomType: 'street', containerType: 'trash' },
    { id: 'trash2', x: -3.1, z: -12, prompt: 'Search the trash can', kind: 'container', roomType: 'street', containerType: 'trash' },
    {
      id: 'pawnDoor', x: 9, z: 5.6, prompt: 'Try the pawnshop door', kind: 'inspect', once: false,
      inspectText: 'Barred shut. Two signs: "CLOSED SUNDAYS" and "BACK IN 5." Both are lying differently.',
    },
    {
      id: 'graffiti1', x: -11, z: 0.7, prompt: 'Inspect the graffiti', kind: 'pickup',
      inspectText: 'SOAK crossed out REN\'s piece with a STENCIL DIAGRAM: can + flame. Cans and a lighter left below.',
      grants: [{ item: 'sprayCan', n: 1 }, { item: 'lighter', n: 1 }],
      grantsBlueprint: 'flamethrower',
    },
    {
      id: 'truckHeat', x: 1.5, z: -20.6, prompt: 'Get closer to the truck', kind: 'inspect', once: false,
      inspectText: 'The heat is unbearable. Nothing gets past that fire.',
    },
    { id: 'workbench1', x: 28.2, z: 0.2, prompt: 'Search the workbench', kind: 'container', roomType: 'garage', containerType: 'workbench' },
    {
      id: 'megahitVideo', x: 4.4, z: 13.5, prompt: 'Read the video store marquee', kind: 'inspect', once: false,
      inspectText: 'MEGAHIT VIDEO — NEW RELEASE: SINKING SHIP. The return slot is jammed with tapes. Every one of them is Sinking Ship.',
    },
    { id: 'ansMachine1', x: -4.8, z: 23, prompt: 'Play the answering machine', kind: 'inspect', once: false },
    {
      id: 'dadCard', x: -4.5, z: 24.8, prompt: 'Look at the card', kind: 'inspect', once: false,
      inspectText: 'A Father\'s Day card, signed by three kids in three colors. Sealed. Today was Father\'s Day.',
    },
    {
      id: 'zelnaPoster', x: -9.5, z: 26.6, prompt: 'Look at the poster', kind: 'inspect', once: false,
      inspectText: 'SAGA OF ZELNA: FLUTE OF AGES — "Coming Christmas 1998." The date is circled in marker. Twice.',
    },
    {
      id: 'beastFlyer', x: -12, z: 16.2, prompt: 'Read the flyer on the fence', kind: 'inspect', once: false,
      inspectText: 'POCKETBEASTS CRIMSON & TEAL — COLLECT THEM ALL! Stapled to the fence. Just past it, something has been collecting.',
    },
    { id: 'nest1', x: -12.5, z: 17, radius: 1.6, prompt: 'The nest', kind: 'inspect', once: false },
    { id: 'payphone1', x: 12.6, z: 4.6, prompt: 'Answer the payphone', kind: 'inspect', once: false },
    // The fire escape up the pawnshop's east face.
    {
      id: 'ladderUp', x: 12.5, z: 8.4, prompt: 'Climb the fire escape', kind: 'ladder', once: false,
      ladderTo: [11.2, 8.4, 3.65],
    },
    {
      id: 'ladderDown', x: 11.6, z: 8.4, floorY: 3.65, prompt: 'Climb down', kind: 'ladder', once: false,
      ladderTo: [12.6, 8.4, 0],
    },
    {
      id: 'roofStash', x: 8.2, z: 8.6, floorY: 3.65, prompt: 'Open the tar-paper bundle', kind: 'pickup',
      inspectText: 'Somebody slept up here, above it all. Rounds, a first-aid kit, and a pearl necklace in a sock.',
      grants: [{ item: 'ammo9', n: 6 }, { item: 'medkit', n: 1 }, { item: 'pearlNecklace', n: 1 }],
    },
    {
      id: 'roofView', x: 7, z: 7, floorY: 3.65, prompt: 'Look north, over the water', kind: 'inspect', once: false,
      inspectText: 'From up here: the whole North End, the bridge, and the Island — lit like a shift change. The boats are still running.',
    },
    {
      id: 'grill1', x: -11.7, z: 21.5, prompt: 'Look at the grill', kind: 'inspect', once: false,
      inspectText: 'The grill is cold. Plates set for five. The cookout stopped between the second and third burger.',
    },
    {
      id: 'saleBanner', x: -6, z: 5.4, prompt: 'Read the banner', kind: 'inspect', once: false,
      inspectText: 'FATHER\'S DAY SALE — GRILLS · TIES · TOOLS. "SALE ENDS JUNE 21." It did.',
    },
    {
      id: 'y2kTag', x: -9, z: 0.7, prompt: 'Read the wall', kind: 'inspect', once: false,
      inspectText: 'Sprayed in careful block letters: THE BUG IS COMING 01/01/00. Eighteen months early, and wrong about which one.',
    },
    {
      id: 'islandView', x: -12.5, z: 36, prompt: 'Look across the water', kind: 'inspect', once: false,
      inspectText: 'The island is lit up like a shift change. Boats run out every few minutes. They come back empty.',
    },
    {
      id: 'protestField', x: -9, z: 3, radius: 2.4, prompt: 'Look at them', kind: 'inspect', once: false,
      inspectText: 'Dozens of them, dropped mid-march. Signs still in hand: WE ARE NOT YOUR CONTROL GROUP. OUR KIDS DRANK IT TOO.',
    },
    {
      id: 'islandTag', x: -13, z: 3, prompt: 'Read the argument on the wall', kind: 'inspect', once: false,
      inspectText: 'SOAK: "THEY TAKE THEM TO THE ISLAND." REN, underneath, in red: "the island was FIRST." Someone has underlined FIRST three times.',
    },
    {
      id: 'rayCard', x: 29.4, z: 0.6, prompt: 'Look at the construction-paper card', kind: 'inspect', once: false,
      inspectText: 'HAPPY FATHER\'S DAY DAD — two crayon hands, two names. Waiting on his workbench. The flatbed never came back.',
    },
    { id: 'saveLamp', x: 19.9, z: 1, prompt: 'Rest at the lighthouse lamp', kind: 'save', once: false },
    { id: 'pawnSlot', x: 10.8, z: 5.6, prompt: 'Trade at the mail slot', kind: 'trade', once: false },
    {
      id: 'axeCase', x: 18.7, z: -4.2, prompt: 'Break the glass', kind: 'pickup',
      inspectText: 'IN CASE OF EMERGENCY, BREAK GLASS. She breaks the glass. The sound goes somewhere.',
      grants: [{ item: 'fireAxe', n: 1 }],
    },
    { id: 'fireAlarm1', x: 7, z: 0.6, prompt: 'Pull the fire alarm', kind: 'alarm', once: true },
    {
      id: 'boards1', x: 4, z: 18.6, prompt: 'The boarded panel', kind: 'chop', once: false,
      chopFlag: 'chopped1',
    },
    { id: 'car1', x: 0, z: 1.2, prompt: 'Salvage the dead sedan', kind: 'salvage', salvageType: 'car' },
    { id: 'car2', x: -1.6, z: -13.2, prompt: 'Salvage the dead wagon', kind: 'salvage', salvageType: 'car' },
    {
      id: 'yardCache', x: 20.5, z: -12, prompt: 'Open the tow-truck toolbox', kind: 'pickup',
      inspectText: 'A dented toolbox, left where someone would find it. Rounds, a first-aid kit, and no note.',
      grants: [{ item: 'ammo9', n: 8 }, { item: 'medkit', n: 1 }],
    },
    { id: 'couch1', x: -5.7, z: 17.5, prompt: 'Strip the curb couch', kind: 'salvage', salvageType: 'couch' },
    { id: 'bike1', x: 3.4, z: 24.1, prompt: 'Take the bicycle', kind: 'bike', once: false },
  ],

  triggers: [
    { id: 'introBark', polygon: [[-14, 30], [14, 30], [14, 40], [-14, 40]], once: true },
    { id: 'frogStreet', polygon: [[-4, -10], [4, -10], [4, -4], [-4, -4]], once: true },
    { id: 'blockadeSwarm', polygon: [[-10, -25], [4, -25], [4, -18], [-10, -18]], once: true },
    { id: 'sliceEnd', polygon: [[-14, -30], [6, -30], [6, -27], [-14, -27]], once: true },
    { id: 'catScare', polygon: [[-4, 8], [4, 8], [4, 12], [-4, 12]], once: true },
    { id: 'protestBark', polygon: [[-13, 0], [-5, 0], [-5, 6], [-13, 6]], once: true },
    { id: 'shutterScare', polygon: [[-4.5, 21.5], [-3, 21.5], [-3, 24.5], [-4.5, 24.5]], once: true },
    { id: 'dogFence', polygon: [[22.5, -16], [26.5, -16], [26.5, -10], [22.5, -10]], once: true },
    { id: 'corridorAmbush', polygon: [[22.5, -15], [26.5, -15], [26.5, -12], [22.5, -12]], once: true },
  ],
};
