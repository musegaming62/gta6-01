// Screenshot staging. The shots.json entries load the game with ?shot=<name>;
// this module sets up a deterministic, readable scene for each one so the four
// screenshots show the chase, the driving, a mission, and combat.
import { SPOTS } from './world.js';
import { makeCar } from './cars.js';
import { makePed } from './peds.js';
import { startMission } from './missions.js';

function putPlayerInCar(G, type, x, y, angle) {
  const car = makeCar(type, x, y, angle);
  car.driver = 'player';
  G.cars.push(car);
  G.player.inCar = car;
  G.player.x = x;
  G.player.y = y;
  G.player.angle = angle;
  return car;
}

function stageChase(G) {
  // Getaway Driver: the player in a sports car, three wanted stars, two police
  // cruisers closing in from behind, the mission timer running.
  G.player.x = 1500;
  G.player.y = 1500;
  putPlayerInCar(G, 'sport', 1500, 1500, 0);
  G.player.inCar.speed = 240;
  startMission(G, 2);
  G.missions.timer = 62;
  G.police.setWanted(G, 3);
  const c1 = makeCar('police', 1290, 1478, 0);
  c1.driver = 'police';
  c1.speed = 260;
  G.cars.push(c1);
  const c2 = makeCar('police', 1180, 1522, 0);
  c2.driver = 'police';
  c2.speed = 250;
  G.cars.push(c2);
  const t1 = makeCar('sedan', 1750, 1478, 0);
  t1.isTraffic = true;
  t1.speed = 120;
  G.cars.push(t1);
  const t2 = makeCar('truck', 1900, 1522, Math.PI);
  t2.isTraffic = true;
  t2.speed = 90;
  G.cars.push(t2);
}

function stageDrive(G) {
  // A calm drive through downtown in a sedan, traffic around, Mission 1 live.
  G.player.x = 1100;
  G.player.y = 1500;
  putPlayerInCar(G, 'sedan', 1100, 1500, 0);
  G.player.inCar.speed = 170;
  startMission(G, 0);
  const t1 = makeCar('sedan', 1350, 1478, 0);
  t1.isTraffic = true;
  t1.speed = 130;
  G.cars.push(t1);
  const t2 = makeCar('sport', 900, 1522, Math.PI);
  t2.isTraffic = true;
  t2.speed = 150;
  G.cars.push(t2);
  const t3 = makeCar('truck', 1500, 1278, Math.PI / 2);
  t3.isTraffic = true;
  t3.speed = 80;
  G.cars.push(t3);
  // A few pedestrians on the sidewalk.
  G.peds.push(makePed(1150, 1420, {}));
  G.peds.push(makePed(1250, 1580, {}));
  G.peds.push(makePed(1400, 1420, {}));
}

function stageMission(G) {
  // On foot beside the red sports car, Mission 1 objective and marker live.
  G.player.x = 1620;
  G.player.y = 1380;
  G.player.angle = Math.PI / 4;
  startMission(G, 0);
  // The mission sports car is already parked by spawnParkedCars; make sure the
  // marker and the gold-outlined car read in the frame.
  const t1 = makeCar('sedan', 1500, 1278, Math.PI / 2);
  t1.isTraffic = true;
  t1.speed = 100;
  G.cars.push(t1);
  G.peds.push(makePed(1560, 1450, {}));
  G.peds.push(makePed(1740, 1400, {}));
}

function stageCombat(G) {
  // Payback: on foot at the Vulture turf, all four gang members in frame.
  G.player.x = 560;
  G.player.y = 1950;
  G.player.angle = Math.PI;
  G.player.ammo = 48;
  startMission(G, 3);
  // Jump straight to the kill stage and spawn the gang around the player.
  G.missions.stage = 1;
  G.missions.gangSpawned = false;
  G.missions.gangLeft = 4;
  const spots = [
    { x: 470, y: 1890 },
    { x: 620, y: 1880 },
    { x: 480, y: 2030 },
    { x: 640, y: 2020 },
  ];
  for (const s of spots) {
    const g = makePed(s.x, s.y, { isGang: true, shirt: '#3a1f1f' });
    G.peds.push(g);
  }
  G.missions.gangSpawned = true;
  G.peds.push(makePed(700, 1950, {}));
}

// Called at boot when the URL carries ?shot=<name>. Skips the menu and drops
// the player straight into the staged scene.
export function stageShot(G, name) {
  if (name === 'chase') stageChase(G);
  else if (name === 'drive') stageDrive(G);
  else if (name === 'mission') stageMission(G);
  else if (name === 'combat') stageCombat(G);
  else return false;
  G.state = 'playing';
  G.camera.x = G.player.x;
  G.camera.y = G.player.y;
  return true;
}

export function shotFromUrl() {
  try {
    const q = new URLSearchParams(window.location.search);
    return q.get('shot');
  } catch (e) {
    return null;
  }
}
