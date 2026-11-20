// Solmar — shared game state. Every module imports this one object; main.js
// fills it in at boot. Keeping the whole mutable state in one place keeps the
// module graph free of cycles: no game module imports main.js.

export const WORLD = 3200;
export const ROAD_STEP = 400;
export const ROAD_HALF = 60;
export const BEACH_Y = 2900;
export const WATER_Y = 3060;

export const S = {
  mode: 'menu', // menu | playing | paused | busted | wasted | win | failed
  time: 0,
  money: 0,
  mission: 0, // index into MISSIONS
  missionStage: 0,
  missionTimer: 0,
  missionMsg: '',
  banner: '',
  bannerT: 0,
  wanted: 0,
  wantedQuiet: 0,
  lastCrime: -999,
  holdup: 0,
  shake: 0,
  cam: { x: 0, y: 0 },
  player: null,
  cars: [],
  peds: [],
  cops: [],
  bullets: [],
  pickups: [],
  parts: [],
  floats: [],
  skids: [],
  world: null, // filled by world.js buildCity()
  shot: null, // staged screenshot mode from ?shot=
  stats: { shots: 0, kills: 0, carsStolen: 0, missionsDone: 0 },
  failedReason: '',
};

export function freshPlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, hp: 100, maxHp: 100,
    vx: 0, vy: 0, speed: 0, stamina: 100,
    money: 0, ammo: 12, mag: 12, reserve: 96,
    reloading: 0, reloadT: 0, punchT: 0, punchCd: 0,
    inCar: null, sprinting: false, hurtT: 0, bustedT: 0,
    lastShot: 0, aimX: 0, aimY: 0,
  };
}

export function resetRun() {
  S.time = 0;
  S.money = 0;
  S.mission = 0;
  S.missionStage = 0;
  S.missionTimer = 0;
  S.missionMsg = '';
  S.banner = '';
  S.bannerT = 0;
  S.wanted = 0;
  S.wantedQuiet = 0;
  S.lastCrime = -999;
  S.holdup = 0;
  S.shake = 0;
  S.cars = [];
  S.peds = [];
  S.cops = [];
  S.bullets = [];
  S.pickups = [];
  S.parts = [];
  S.floats = [];
  S.skids = [];
  S.stats = { shots: 0, kills: 0, carsStolen: 0, missionsDone: 0 };
  S.failedReason = '';
}
