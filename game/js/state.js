// Solmar — the one shared game state object. Every system reads and writes G.
export const WORLD = 3200;            // world is WORLD x WORLD world units
export const ROAD_PITCH = 400;        // distance between road centrelines
export const ROAD_W = 88;             // road width
export const ROAD_AT = [200, 600, 1000, 1400, 1800, 2200, 2600]; // road centrelines
export const BEACH_Y = 2840;          // sand starts here
export const WATER_Y = 3020;          // ocean starts here

export const G = {
  mode: 'menu',           // menu | playing | paused | busted | wasted | done
  time: 0,
  money: 0,
  health: 100,
  maxHealth: 100,
  ammo: 24,
  maxAmmo: 120,
  wanted: 0,              // 0..5 stars
  wantedTimer: 0,         // seconds since last crime / police sighting
  bustedTimer: 0,
  shake: 0,
  muted: false,
  musicOn: true,
  player: null,           // {x,y,angle,car,speed, ...}
  cars: [],               // traffic, parked, police, player car
  peds: [],
  npcs: [],               // mission enemies / allies
  bullets: [],
  particles: [],
  pickups: [],
  markers: [],            // world markers (objective beacons)
  city: null,             // generated city data
  staticLayer: null,      // offscreen canvas with the whole city painted once
  missionIndex: 0,        // next mission to start (0..5); 5 = all done
  mission: null,          // active mission runtime {def, step, ...}
  missionDone: [false, false, false, false, false],
  camera: { x: WORLD / 2, y: WORLD / 2, zoom: 1 },
  mouse: { x: 0, y: 0, wx: 0, wy: 0, down: false },
  keys: {},
  stats: { carsStolen: 0, shots: 0, hits: 0, missions: 0 },
  saveSlot: false,        // a save exists in localStorage
  shot: null,             // ?shot= staging for screenshots
  endReason: '',
};

export function resetRun() {
  G.time = 0;
  G.money = 0;
  G.health = 100;
  G.ammo = 24;
  G.wanted = 0;
  G.wantedTimer = 0;
  G.bustedTimer = 0;
  G.shake = 0;
  G.cars = [];
  G.peds = [];
  G.npcs = [];
  G.bullets = [];
  G.particles = [];
  G.pickups = [];
  G.markers = [];
  G.missionIndex = 0;
  G.mission = null;
  G.missionDone = [false, false, false, false, false];
  G.stats = { carsStolen: 0, shots: 0, hits: 0, missions: 0 };
}
