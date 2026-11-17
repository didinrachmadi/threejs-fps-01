// EMBERLINE — boot and the one loop: a fixed 60 Hz simulation feeding a render at
// the display's rate. The player attacks with two ally bots against five Ashen bots
// on Cinder Yard: plant the bomb at Foundry or Silo, or eliminate the other squad.
// ?shot=start|play|buy|end with &seed=N stages a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';
import { MAP } from './mapdata.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createArsenal, WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';
import { createBots } from './bots.js';
import { createBomb, BOMB_TIMER } from './bomb.js';
import { createMatch } from './rounds.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 85);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const audio = createAudio();
const hud = createHud();
const match = createMatch();
const bomb = createBomb(scene);
const player = createPlayer(world.colliders, MAP.spawns.attackers[0]);
const arsenal = createArsenal(camera);
const bots = createBots(scene, world.colliders, random);
const input = createInput(renderer.domElement, onLockChange);

// The player's hitbox: invisible to the eye (opacity 0) but real to the raycaster,
// so bot fire is checked against a body, not a dice roll.
const playerHitbox = new THREE.Mesh(
  new THREE.BoxGeometry(0.72, 1.72, 0.72),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
);
playerHitbox.position.set(0, 0.86, 0);
scene.add(playerHitbox);

const raycaster = new THREE.Raycaster();
const losRaycaster = new THREE.Raycaster();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _tmp = new THREE.Vector3();

let shootTargets = world.shootables.slice();
function rebuildShootTargets() {
  shootTargets = world.shootables.slice();
  shootTargets.push(playerHitbox);
  for (const bot of bots.bots) shootTargets.push(...bot.hitMeshes);
}

// Tracers: a fixed pool, reused, never allocated per shot.
const tracers = [];
for (let i = 0; i < 12; i += 1) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 }));
  line.frustumCulled = false;
  scene.add(line);
  tracers.push({ line, life: 0 });
}
function spawnTracer(from, to) {
  let slot = tracers.find((t) => t.life <= 0) ?? tracers[0];
  const attr = slot.line.geometry.getAttribute('position');
  attr.setXYZ(0, from.x, from.y, from.z);
  attr.setXYZ(1, to.x, to.y, to.z);
  attr.needsUpdate = true;
  slot.life = 0.09;
  slot.line.material.opacity = 0.9;
}

// Grenades and explosion flashes, pooled the same way.
const grenades = [];
const grenadeGeo = new THREE.SphereGeometry(0.12, 10, 8);
const grenadeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.slate), roughness: 0.6, metalness: 0.4 });
const explosions = [];
const explosionGeo = new THREE.SphereGeometry(1, 16, 12);
const explosionMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.8 });

const noises = [];
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let buyOpen = false;
let owned = { p9: true, vk47: false, raptor: false };
let plantBeep = 0;
const markerHoldMs = shot ? 4000 : 90;

function hasLOS(from, to) {
  _dir.subVectors(to, from);
  const dist = _dir.length();
  if (dist < 0.01) return true;
  _dir.divideScalar(dist);
  losRaycaster.set(from, _dir);
  losRaycaster.far = dist;
  return losRaycaster.intersectObjects(world.shootables, false).length === 0;
}

function pushNoise(x, z, radius) {
  noises.push({ x, z, radius, time: elapsed });
  if (noises.length > 12) noises.shift();
}

function syncCamera() {
  const body = player.state;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  playerHitbox.position.set(body.position.x, body.position.y + 0.86, body.position.z);
}

function aimAt(point) {
  const body = player.state;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

// ---- shooting -------------------------------------------------------------

function playerShoot(spread) {
  const def = arsenal.current();
  if (!arsenal.takeRound()) {
    audio.dryFire();
    return false;
  }
  camera.getWorldDirection(_dir);
  _dir.x += (random() * 2 - 1) * spread;
  _dir.y += (random() * 2 - 1) * spread;
  _dir.z += (random() * 2 - 1) * spread;
  _dir.normalize();
  raycaster.set(camera.position, _dir);
  raycaster.far = def.range;
  const hits = raycaster.intersectObjects(shootTargets, false);
  const end = _tmp.copy(_dir).multiplyScalar(def.range).add(camera.position);
  if (hits.length > 0) {
    const hit = hits[0];
    end.copy(hit.point);
    const bot = hit.object.userData.bot;
    if (bot && bot.alive) {
      const head = hit.object.userData.part === 'head';
      const falloff = hit.distance > 30 ? 0.8 : 1;
      const dealt = bots.damage(bot, def.damage * falloff, head);
      void dealt;
      const killed = !bot.alive;
      hud.hitMarker(killed, markerHoldMs);
      if (killed) {
        audio.kill();
        hud.killfeed('You', bot.name, head, true);
        match.addKill();
        onBotDeath(bot);
      } else {
        audio.hit();
      }
    }
  }
  spawnTracer(camera.position, end);
  arsenal.pullTrigger();
  player.recoil(def.kick + random() * 0.004, (random() * 2 - 1) * 0.004);
  audio.shot();
  pushNoise(player.state.position.x, player.state.position.z, 26);
  syncHudAmmo();
  return true;
}

function botShoot(bot, target, err) {
  _from.set(bot.pos.x, 1.55, bot.pos.z);
  if (target.kind === 'player') {
    _to.set(player.state.position.x, player.state.position.y + 1.3, player.state.position.z);
  } else {
    _to.set(target.pos.x, 1.3, target.pos.z);
  }
  _dir.subVectors(_to, _from).normalize();
  _dir.x += (random() * 2 - 1) * err;
  _dir.y += (random() * 2 - 1) * err;
  _dir.z += (random() * 2 - 1) * err;
  _dir.normalize();
  raycaster.set(_from, _dir);
  raycaster.far = 60;
  const hits = raycaster.intersectObjects(shootTargets, false);
  const end = _tmp.copy(_dir).multiplyScalar(60).add(_from);
  if (hits.length > 0) {
    const hit = hits[0];
    end.copy(hit.point);
    if (hit.object === playerHitbox && player.state.alive) {
      const head = hit.point.y > player.state.position.y + 1.45;
      const dealt = player.damage(26, head);
      void dealt;
      hud.damageFlash();
      audio.hurt();
      if (!player.state.alive) onPlayerDeath(bot);
    } else if (hit.object.userData.bot) {
      const victim = hit.object.userData.bot;
      if (victim.alive && victim !== bot) {
        const head = hit.object.userData.part === 'head';
        bots.damage(victim, 26, head);
        if (!victim.alive) {
          hud.killfeed(bot.name, victim.name, head, bot.team === 'ally');
          onBotDeath(victim);
        }
      }
    }
  }
  spawnTracer(_from, end);
  const dist = _from.distanceTo(player.state.position);
  audio.enemyShot(dist);
  pushNoise(bot.pos.x, bot.pos.z, 22);
}

// ---- grenades -------------------------------------------------------------

function throwGrenade() {
  if (!arsenal.useGrenade()) return;
  const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
  mesh.castShadow = true;
  scene.add(mesh);
  camera.getWorldDirection(_dir);
  const body = player.state;
  grenades.push({
    mesh,
    pos: new THREE.Vector3(body.position.x, body.position.y + body.eye - 0.1, body.position.z).addScaledVector(_dir, 0.5),
    vel: _dir.clone().multiplyScalar(15).add(new THREE.Vector3(0, 3.5, 0)).addScaledVector(body.velocity, 0.4),
    fuse: 1.6,
  });
  audio.reload();
  syncHudAmmo();
}

const _probe = new THREE.Box3();
function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.vel.y -= 12 * dt;
    const nx = g.pos.x + g.vel.x * dt;
    const ny = g.pos.y + g.vel.y * dt;
    const nz = g.pos.z + g.vel.z * dt;
    _probe.min.set(nx - 0.12, ny - 0.12, nz - 0.12);
    _probe.max.set(nx + 0.12, ny + 0.12, nz + 0.12);
    let blocked = false;
    for (const c of world.colliders) {
      if (_probe.intersectsBox(c)) {
        blocked = true;
        break;
      }
    }
    if (blocked) {
      g.vel.multiplyScalar(-0.4);
      g.pos.y = Math.max(g.pos.y, 0.15);
    } else {
      g.pos.set(nx, ny, nz);
    }
    if (g.pos.y < 0.12) {
      g.pos.y = 0.12;
      g.vel.y = Math.abs(g.vel.y) * 0.4;
      g.vel.x *= 0.7;
      g.vel.z *= 0.7;
    }
    g.mesh.position.copy(g.pos);
    g.fuse -= dt;
    if (g.fuse <= 0) {
      explodeGrenade(g.pos);
      scene.remove(g.mesh);
      grenades.splice(i, 1);
    }
  }
  for (let i = explosions.length - 1; i >= 0; i -= 1) {
    const e = explosions[i];
    e.life -= dt;
    if (e.life <= 0) {
      scene.remove(e.mesh);
      scene.remove(e.light);
      explosions.splice(i, 1);
      continue;
    }
    const k = 1 - e.life / 0.5;
    e.mesh.scale.setScalar(1 + k * 5);
    e.mesh.material.opacity = 0.8 * (1 - k);
    e.light.intensity = 30 * (1 - k);
  }
}

function explodeGrenade(pos) {
  const mesh = new THREE.Mesh(explosionGeo, explosionMat.clone());
  mesh.position.copy(pos);
  scene.add(mesh);
  const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 30, 14);
  light.position.copy(pos);
  scene.add(light);
  explosions.push({ mesh, light, life: 0.5 });
  audio.explosion();
  pushNoise(pos.x, pos.z, 30);
  const hurt = (px, pz, py) => Math.hypot(px - pos.x, pz - pos.z) + Math.abs(py - pos.y) * 0.5;
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const d = hurt(bot.pos.x, bot.pos.z, 1);
    if (d < 6) {
      bots.damage(bot, 120 * (1 - d / 6), false);
      if (!bot.alive) {
        hud.killfeed('You', bot.name, false, true);
        match.addKill();
        onBotDeath(bot);
      }
    }
  }
  if (player.state.alive) {
    const d = hurt(player.state.position.x, player.state.position.z, player.state.position.y + 1);
    if (d < 6) {
      player.damage(120 * (1 - d / 6), false);
      hud.damageFlash();
      if (!player.state.alive) onPlayerDeath(null);
    }
  }
}

// ---- deaths, bomb handoff, round flow --------------------------------------

function onBotDeath(bot) {
  if (bot.carriesBomb) {
    bot.carriesBomb = false;
    if (!bomb.state.planted) bomb.dropAt(bot.pos.x, bot.pos.z);
  }
  checkRoundEnd();
}

function onPlayerDeath(killer) {
  match.state.deaths += 1;
  hud.killfeed(killer ? killer.name : 'Frag', 'You', false, false);
  hud.message('You are down — your squad fights on.');
  input.releaseLock();
  if (bomb.state.carrier === 'player' && !bomb.state.planted) {
    bomb.dropAt(player.state.position.x, player.state.position.z);
    hud.message('Bomb dropped — a teammate must pick it up.');
  }
  checkRoundEnd();
}

function checkRoundEnd() {
  const m = match.state;
  if (m.phase === 'over') return;
  const enemies = bots.aliveCount('enemy');
  const allies = bots.aliveCount('ally') + (player.state.alive ? 1 : 0);
  if (bomb.state.exploded) return endRound('ally', 'Bomb detonated at the site.');
  if (bomb.state.defused) return endRound('enemy', 'Bomb defused.');
  if (enemies === 0) return endRound('ally', 'Ashen squad eliminated.');
  if (allies === 0) return endRound('enemy', 'Ember squad eliminated.');
  if ((m.phase === 'live' || m.phase === 'planted') && m.phaseTime <= 0 && !bomb.state.planted) {
    return endRound('enemy', 'Time expired — the bomb was never planted.');
  }
}

function endRound(winner, reason) {
  match.endRound(winner, reason);
  if (winner === 'ally') audio.roundWin();
  else audio.roundLose();
  hud.banner(winner === 'ally' ? 'ROUND WON' : 'ROUND LOST', reason, 2600);
  input.releaseLock();
  const m = match.state;
  const matchOver = m.matchWinner !== null;
  const title = matchOver
    ? m.matchWinner === 'ally' ? 'MATCH WON' : m.matchWinner === 'enemy' ? 'MATCH LOST' : 'MATCH DRAWN'
    : winner === 'ally' ? 'Round won' : 'Round lost';
  const copy = matchOver
    ? `Final score Ember ${m.score.ally} — ${m.score.enemy} Ashen.`
    : `${reason} Ember ${m.score.ally} — ${m.score.enemy} Ashen.`;
  const sub = `Kills ${m.kills} · Deaths ${m.deaths} · Money $${m.money}`;
  hud.showOverlay(matchOver ? 'match' : 'round', { title, copy, sub, matchOver });
}

function startRound() {
  match.startRound();
  bomb.reset();
  player.reset(MAP.spawns.attackers[0]);
  bots.reset(match.state.round);
  rebuildShootTargets();
  // Keep bought guns, refilled; grenades are bought fresh each round.
  for (const id of Object.keys(owned)) if (owned[id]) arsenal.buy(id);
  arsenal.equip(owned.vk47 ? 'vk47' : owned.raptor ? 'raptor' : 'p9');
  arsenal.setGrenades(0);
  buyOpen = false;
  hud.hideBuy();
  hud.setProgress(null, null);
  hud.message(match.state.round === 1 ? 'Round 1 — buy up with B, then push a site.' : `Round ${match.state.round} — buy time.`);
  syncHudAll();
}

function nextRound() {
  if (match.state.matchWinner !== null) {
    match.reset();
    owned = { p9: true, vk47: false, raptor: false };
  } else {
    match.nextRound();
  }
  startRound();
  if (!shot) input.requestLock();
}

function syncHudAmmo() {
  const def = arsenal.current();
  const s = arsenal.state();
  hud.setAmmo(s.mag, s.reserve, def.name, arsenal.grenades);
}

function syncHudAll() {
  const m = match.state;
  const body = player.state;
  hud.setHealth(body.hp, body.armor);
  hud.setMoney(m.money);
  hud.setScore(m.score.ally, m.score.enemy, m.round);
  hud.setTimer(m.phase === 'planted' ? bomb.state.timer : m.phaseTime, m.phase);
  hud.setAlive(bots.aliveCount('ally') + (body.alive ? 1 : 0), bots.aliveCount('enemy'));
  syncHudAmmo();
  const b = bomb.state;
  hud.setBombStatus(
    b.planted ? `BOMB PLANTED — ${Math.max(0, Math.ceil(b.timer))}s` :
    b.carrier === 'player' ? 'YOU CARRY THE BOMB — plant at Foundry or Silo' :
    b.carrier ? `${b.carrier.name} carries the bomb` :
    'BOMB DROPPED — pick it up',
  );
}

// ---- the fixed step ---------------------------------------------------------

function step(dt) {
  elapsed += dt;
  const m = match.state;

  if (m.phase === 'freeze' || m.phase === 'live') {
    m.phaseTime -= dt;
    if (m.phaseTime <= 0) {
      if (m.phase === 'freeze') {
        match.goLive();
        buyOpen = false;
        hud.hideBuy();
        hud.message('Round live — go!');
      } else {
        checkRoundEnd();
      }
    }
  }
  if (m.phase === 'planted') {
    m.phaseTime = bomb.state.timer;
    bomb.step(dt, () => audio.beep());
    if (bomb.state.exploded) checkRoundEnd();
  }

  player.step(dt, input.state.keys);
  arsenal.step(dt);

  // Bomb: pickup, plant, handoff.
  const b = bomb.state;
  if (!b.planted) {
    if (b.carrier === null && player.state.alive) {
      const d = Math.hypot(b.pos.x - player.state.position.x, b.pos.z - player.state.position.z);
      if (d < 1.6) {
        b.carrier = 'player';
        hud.message('Bomb picked up.');
      }
    }
    if (b.carrier === null) {
      for (const bot of bots.bots) {
        if (bot.team !== 'ally' || !bot.alive) continue;
        const d = Math.hypot(b.pos.x - bot.pos.x, b.pos.z - bot.pos.z);
        if (d < 1.6) {
          b.carrier = bot;
          bot.carriesBomb = true;
          hud.message(`${bot.name} picked up the bomb.`);
          break;
        }
      }
    }
    if (b.carrier && typeof b.carrier === 'object' && !b.carrier.alive) {
      b.carrier.carriesBomb = false;
      bomb.dropAt(b.carrier.pos.x, b.carrier.pos.z);
      b.carrier = null;
    }
    if (b.carrier === 'player' && player.state.alive && m.phase === 'live' && input.state.keys.has('KeyE')) {
      const site = bomb.siteAt(player.state.position.x, player.state.position.z);
      if (site) {
        b.plantProgress += dt;
        hud.setProgress(`PLANTING AT ${site.name}`, b.plantProgress / 3);
        plantBeep -= dt;
        if (plantBeep <= 0) {
          plantBeep = 0.5;
          audio.beep();
        }
        if (b.plantProgress >= 3) {
          bomb.plant(site);
          match.state.phase = 'planted';
          match.state.phaseTime = BOMB_TIMER;
          audio.plant();
          hud.banner('BOMB PLANTED', `${site.name} — defend it until it blows.`, 3000);
          hud.setProgress(null, null);
        }
      } else {
        b.plantProgress = 0;
        hud.setProgress(null, null);
      }
    } else {
      b.plantProgress = Math.max(0, b.plantProgress - dt * 2);
      if (m.phase === 'live') hud.setProgress(null, null);
    }
  }

  if (m.phase !== 'over') {
    bots.step(dt, {
      player: player.state,
      playerSpeed: player.groundSpeed(),
      shootables: world.shootables,
      hasLOS,
      botShoot,
      noises,
      bomb: b,
      phase: m.phase,
      time: elapsed,
      onDefuse: (bot, frac) => hud.setProgress(`${bot.name} IS DEFUSING`, frac),
      onPlant: (bot, frac) => hud.setProgress(`${bot.name} IS PLANTING`, frac),
      onPlanted: (bot, site) => {
        bomb.plant(site);
        match.state.phase = 'planted';
        match.state.phaseTime = BOMB_TIMER;
        audio.plant();
        hud.banner('BOMB PLANTED', `${bot.name} planted at ${site.name} — retake it!`, 3000);
        hud.setProgress(null, null);
      },
      onDefused: (bot) => {
        b.defused = true;
        hud.setProgress(null, null);
        checkRoundEnd();
      },
    });
  }

  stepGrenades(dt);
  for (const t of tracers) {
    if (t.life > 0) {
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
    }
  }
  syncCamera();
}

// ---- the frame --------------------------------------------------------------

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (input.state.locked) player.look(look.x, look.y);

    // Buy menu and weapon keys, checked once per frame.
    if (input.pressed('KeyB') && (match.state.phase === 'freeze') && player.state.alive && started) {
      buyOpen = !buyOpen;
      if (buyOpen) {
        hud.showBuy(match.state.money);
        input.releaseLock();
      } else {
        hud.hideBuy();
        input.requestLock();
      }
    }
    if (buyOpen) {
      for (const item of hud.BUY_ITEMS) {
        if (input.pressed(`Digit${item.key}`)) buyItem(item.id);
      }
    } else {
      if (input.pressed('Digit1')) arsenal.equip('p9');
      if (input.pressed('Digit2') && owned.vk47) arsenal.equip('vk47');
      if (input.pressed('Digit3') && owned.raptor) arsenal.equip('raptor');
      if (input.pressed('KeyG') || input.pressed('Digit4')) throwGrenade();
    }
    if (input.pressed('KeyR')) {
      if (arsenal.reload()) audio.reload();
    }

    const firing = input.state.firing && input.state.locked;
    const def = arsenal.current();
    if (firing && arsenal.ready()) {
      playerShoot(shot ? 0 : arsenal.spread(player.groundSpeed()));
      if (!def.auto) input.state.firing = false;
    } else if (firing && arsenal.state().mag === 0 && arsenal.state().reloadLeft === 0) {
      if (arsenal.reload()) audio.reload();
    }

    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;

    const spreadPx = 6 + arsenal.spread(player.groundSpeed()) * 900 + player.groundSpeed() * 1.2;
    hud.setSpread(spreadPx);
    syncCamera();
    syncHudAll();
  }
  renderer.render(scene, camera);
}

function buyItem(id) {
  const m = match.state;
  if (id === 'grenade') {
    if (!match.spend(GRENADE_PRICE)) return hud.message('Not enough money for a frag grenade.');
    arsenal.setGrenades(arsenal.grenades + 1);
  } else if (id === 'armor') {
    if (!match.spend(ARMOR_PRICE)) return hud.message('Not enough money for kevlar.');
    player.state.armor = 50;
  } else {
    const def = WEAPONS[id];
    if (owned[id]) return hud.message(`You already own the ${def.name}.`);
    if (!match.spend(def.price)) return hud.message(`Not enough money for the ${def.name}.`);
    owned[id] = true;
    arsenal.buy(id);
  }
  audio.buy();
  hud.showBuy(m.money);
  syncHudAll();
}

function onLockChange(locked) {
  if (shot) return;
  audio.unlock();
  if (locked) {
    started = true;
    hud.hideOverlay();
    hud.hideBuy();
    buyOpen = false;
  } else if (!buyOpen && match.state.phase !== 'over') {
    hud.showOverlay(started ? 'paused' : 'start');
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (match.state.phase === 'over') {
    nextRound();
    return;
  }
  input.requestLock();
});
hud.onBuy((id) => buyItem(id));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- deterministic screenshot staging ---------------------------------------

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    syncHudAll();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  const body = player.state;
  if (name === 'start') {
    body.position.set(0, 0, 16);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -10));
    hud.showOverlay('start');
  } else if (name === 'buy') {
    body.position.set(0, 0, 16);
    settle(20);
    aimAt(new THREE.Vector3(-6, 1.5, -8));
    hud.showBuy(3200);
  } else if (name === 'play') {
    match.state.phase = 'live';
    match.state.phaseTime = 96;
    arsenal.buy('vk47');
    owned.vk47 = true;
    const enemies = bots.bots.filter((b) => b.team === 'enemy');
    enemies[0].pos.set(0, 0, -3);
    enemies[0].yaw = 0;
    enemies[1].pos.set(-5, 0, -6);
    enemies[1].yaw = 0.4;
    enemies[2].pos.set(7, 0, -8);
    enemies[2].yaw = -0.4;
    body.position.set(0, 0, 14);
    settle(20);
    const target = enemies[0];
    for (let round = 0; round < 3; round += 1) {
      aimAt(new THREE.Vector3(target.pos.x, 1.3, target.pos.z));
      playerShoot(0);
      settle(8);
    }
    settle(10);
    aimAt(new THREE.Vector3(target.pos.x, 1.3, target.pos.z));
    hud.setSpread(10);
  } else if (name === 'end') {
    match.state.score.ally = 4;
    match.state.score.enemy = 2;
    match.state.round = 7;
    match.state.phase = 'over';
    match.state.roundWinner = 'ally';
    const dead = bots.bots.filter((b) => b.team === 'enemy');
    dead[0].pos.set(-3, 0, -2);
    dead[0].alive = false;
    dead[0].parts.group.rotation.x = -Math.PI / 2;
    dead[0].parts.group.position.set(-3, 0.25, -2);
    body.position.set(0, 0, 8);
    settle(10);
    aimAt(new THREE.Vector3(-3, 1, -2));
    hud.showOverlay('round', {
      title: 'Round won',
      copy: 'Ashen squad eliminated. Ember 4 — 2 Ashen.',
      sub: 'Kills 6 · Deaths 1 · Money $3850',
    });
  }
  syncHudAll();
  paintTwiceThenReady();
}

syncCamera();
startRound();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
