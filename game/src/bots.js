// Bot opponents and teammates: one state machine each, walking the waypoint graph,
// holding sites, reacting to what they see and hear, and shooting back in bursts.
// A bot is a body and a head the player's ray can hit, with a name the killfeed uses.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP, nearestWaypoint, findPath } from './mapdata.js';
import { shuffle } from './rng.js';

const BOT_RADIUS = 0.38;
const BOT_HEIGHT = 1.72;
const WALK_SPEED = 3.4;
const RUSH_SPEED = 4.6;
const REACT_MIN = 0.35;
const REACT_MAX = 0.75;
const BURST_MIN = 3;
const BURST_MAX = 5;
const SHOT_GAP = 0.13;
const BURST_PAUSE = 0.9;
const SEE_RANGE = 42;
const DEFUSE_TIME = 5;
const PLANT_TIME = 3;

const ALLY_NAMES = ['Rook', 'Vex', 'Iris'];
const ENEMY_NAMES = ['Ash', 'Cinder', 'Dusk', 'Flint', 'Sable'];

function botMesh(scene, team) {
  const group = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({
    color: new THREE.Color(team === 'ally' ? PALETTE.ally : PALETTE.enemy),
    roughness: 0.8, metalness: 0.05,
  });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.slate), roughness: 0.85, metalness: 0.05 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a184'), roughness: 0.9, metalness: 0 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.95, 0.36), suit);
  body.position.y = 0.95;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.32), dark);
  legs.position.y = 0.28;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), skin);
  head.position.y = 1.62;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark);
  helmet.position.y = 1.64;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), dark);
  gun.position.set(0.2, 1.15, -0.3);
  group.add(body, legs, head, helmet, gun);
  group.traverse((m) => {
    m.castShadow = true;
  });
  scene.add(group);
  return { group, body, head, gun };
}

export function createBots(scene, colliders, random) {
  const bots = [];
  const probe = new THREE.Box3();

  function overlaps(x, z, height) {
    probe.min.set(x - BOT_RADIUS, 0.04, z - BOT_RADIUS);
    probe.max.set(x + BOT_RADIUS, height - 0.04, z + BOT_RADIUS);
    for (const c of colliders) if (probe.intersectsBox(c)) return true;
    return false;
  }

  function moveBot(bot, dx, dz) {
    const nx = bot.pos.x + dx;
    if (!overlaps(nx, bot.pos.z, BOT_HEIGHT)) bot.pos.x = nx;
    const nz = bot.pos.z + dz;
    if (!overlaps(bot.pos.x, nz, BOT_HEIGHT)) bot.pos.z = nz;
  }

  function spawnBot(team, name, spawn, role, index) {
    const parts = botMesh(scene, team);
    const bot = {
      team, name, role, index,
      pos: new THREE.Vector3(spawn.x, 0, spawn.z),
      yaw: team === 'ally' ? Math.PI : 0,
      hp: 100, alive: true, armor: 0,
      parts, hitMeshes: [parts.body, parts.head],
      path: [], pathIdx: 0, holdPos: null, holdYaw: 0,
      target: null, lastSeen: null, hearPos: null, hearUntil: 0,
      reactTimer: 0, burstLeft: 0, shotTimer: 0, pauseTimer: 0,
      strafeDir: 1, strafeTimer: 0, stuckTimer: 0, lastX: spawn.x, lastZ: spawn.z,
      plantProgress: 0, defuseProgress: 0, carriesBomb: false,
      speed: WALK_SPEED,
    };
    parts.body.userData.bot = bot;
    parts.body.userData.part = 'body';
    parts.head.userData.bot = bot;
    parts.head.userData.part = 'head';
    bots.push(bot);
    return bot;
  }

  function buildTeams() {
    const roles = shuffle(random, ['A', 'B', 'mid']);
    MAP.spawns.attackers.slice(1).forEach((spawn, i) => {
      spawnBot('ally', ALLY_NAMES[i], spawn, roles[i], i);
    });
    const enemyRoles = ['A', 'B', 'mid', 'roamA', 'roamB'];
    MAP.spawns.defenders.forEach((spawn, i) => {
      spawnBot('enemy', ENEMY_NAMES[i], spawn, enemyRoles[i], i);
    });
  }

  function reset(round) {
    for (const bot of bots) {
      bot.parts.group.removeFromParent();
    }
    bots.length = 0;
    buildTeams();
    // Round-based kit: defenders get armor from round 2, attackers from round 3.
    for (const bot of bots) {
      bot.armor = (bot.team === 'enemy' && round >= 2) || (bot.team === 'ally' && round >= 3) ? 50 : 0;
    }
  }

  function siteWaypoint(role) {
    if (role === 'A') return 9;
    if (role === 'B') return 10;
    if (role === 'mid') return 13;
    if (role === 'roamA') return 21;
    return 22;
  }

  function holdWaypoint(role) {
    if (role === 'A') return 19;
    if (role === 'B') return 20;
    if (role === 'mid') return 14;
    if (role === 'roamA') return 7;
    return 8;
  }

  function setPath(bot, to) {
    const from = nearestWaypoint(bot.pos.x, bot.pos.z);
    bot.path = findPath(from, to);
    bot.pathIdx = 0;
  }

  function followPath(bot, dt, speed) {
    if (bot.pathIdx >= bot.path.length) return true;
    const wp = MAP.waypoints[bot.path[bot.pathIdx]];
    const dx = wp[0] - bot.pos.x;
    const dz = wp[1] - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.7) {
      bot.pathIdx += 1;
      return bot.pathIdx >= bot.path.length;
    }
    const step = Math.min(dist, speed * dt);
    moveBot(bot, (dx / dist) * step, (dz / dist) * step);
    bot.yaw = Math.atan2(-dx, -dz);
    return false;
  }

  function damage(bot, amount, headshot) {
    if (!bot.alive) return 0;
    let dealt = amount * (headshot ? 2 : 1);
    if (bot.armor > 0) {
      const absorbed = Math.min(bot.armor, dealt * 0.5);
      bot.armor -= absorbed;
      dealt -= absorbed;
    }
    bot.hp = Math.max(0, bot.hp - dealt);
    if (bot.hp <= 0) {
      bot.alive = false;
      bot.parts.group.rotation.x = -Math.PI / 2;
      bot.parts.group.position.y = 0.25;
    }
    return dealt;
  }

  function visibleEnemy(bot, ctx) {
    // Returns {kind, pos, ref, dist} for the nearest visible enemy, or null.
    let best = null;
    const eye = _eye.set(bot.pos.x, 1.55, bot.pos.z);
    const consider = (kind, pos, ref) => {
      const dx = pos.x - bot.pos.x;
      const dz = pos.z - bot.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > SEE_RANGE) return;
      // Field of view: only what is roughly in front, unless very close.
      const facing = Math.atan2(-dx, -dz);
      let diff = Math.abs(facing - bot.yaw);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (dist > 6 && diff > 1.25) return;
      const target = _target.set(pos.x, pos.y + 1.3, pos.z);
      if (!ctx.hasLOS(eye, target)) return;
      if (!best || dist < best.dist) best = { kind, pos, ref, dist };
    };
    if (ctx.player.alive && bot.team === 'enemy') {
      consider('player', ctx.player.position, null);
    }
    for (const other of bots) {
      if (!other.alive || other.team === bot.team) continue;
      consider('bot', other.pos, other);
    }
    return best;
  }

  const _eye = new THREE.Vector3();
  const _target = new THREE.Vector3();

  function stepBot(bot, dt, ctx) {
    if (!bot.alive) return;
    const bomb = ctx.bomb;
    const planted = bomb.planted;

    // Hearing: a recent loud noise pulls the bot toward it.
    for (const noise of ctx.noises) {
      const d = Math.hypot(noise.x - bot.pos.x, noise.z - bot.pos.z);
      if (d < noise.radius && ctx.time - noise.time < 4) {
        bot.hearPos = { x: noise.x, z: noise.z };
        bot.hearUntil = ctx.time + 5;
      }
    }

    // Plant / defuse duties override movement.
    if (planted && bot.team === 'enemy') {
      const d = Math.hypot(bomb.pos.x - bot.pos.x, bomb.pos.z - bot.pos.z);
      if (d < 1.8) {
        const seen = visibleEnemy(bot, ctx);
        if (!seen) {
          bot.defuseProgress += dt;
          ctx.onDefuse(bot, bot.defuseProgress / DEFUSE_TIME);
          if (bot.defuseProgress >= DEFUSE_TIME) ctx.onDefused(bot);
          return;
        }
      } else if (bot.pathIdx >= bot.path.length) {
        setPath(bot, nearestWaypoint(bomb.pos.x, bomb.pos.z));
      }
    }
    if (!planted && bot.carriesBomb && bot.team === 'ally') {
      const site = MAP.sites[bot.role === 'B' ? 1 : 0];
      const d = Math.hypot(site.x - bot.pos.x, site.z - bot.pos.z);
      if (d < site.radius) {
        const seen = visibleEnemy(bot, ctx);
        if (!seen) {
          bot.plantProgress += dt;
          ctx.onPlant(bot, bot.plantProgress / PLANT_TIME);
          if (bot.plantProgress >= PLANT_TIME) ctx.onPlanted(bot, site);
          return;
        }
      }
    }

    const seen = visibleEnemy(bot, ctx);
    if (seen) {
      bot.target = seen;
      bot.lastSeen = { x: seen.pos.x, z: seen.pos.z, time: ctx.time };
      bot.hearPos = null;
      if (bot.reactTimer <= 0 && bot.burstLeft <= 0 && bot.pauseTimer <= 0) {
        bot.reactTimer = REACT_MIN + random() * (REACT_MAX - REACT_MIN);
      }
    } else if (bot.target && ctx.time - (bot.lastSeen?.time ?? 0) > 2.5) {
      bot.target = null;
    }

    if (bot.target) {
      // Face the target, strafe while firing.
      const t = bot.target;
      const dx = t.pos.x - bot.pos.x;
      const dz = t.pos.z - bot.pos.z;
      bot.yaw = Math.atan2(-dx, -dz);
      bot.strafeTimer -= dt;
      if (bot.strafeTimer <= 0) {
        bot.strafeTimer = 0.7 + random() * 0.8;
        bot.strafeDir = random() < 0.5 ? -1 : 1;
      }
      const sideX = Math.cos(bot.yaw) * bot.strafeDir;
      const sideZ = -Math.sin(bot.yaw) * bot.strafeDir;
      moveBot(bot, sideX * 1.1 * dt, sideZ * 1.1 * dt);

      if (bot.reactTimer > 0) {
        bot.reactTimer -= dt;
      } else if (bot.burstLeft > 0) {
        bot.shotTimer -= dt;
        if (bot.shotTimer <= 0) {
          bot.shotTimer = SHOT_GAP;
          bot.burstLeft -= 1;
          const dist = Math.hypot(dx, dz);
          const err = 0.012 + dist * 0.0016 + (t.kind === 'player' && ctx.playerSpeed > 3 ? 0.02 : 0);
          ctx.botShoot(bot, t, err);
          if (bot.burstLeft === 0) bot.pauseTimer = BURST_PAUSE * (0.7 + random() * 0.6);
        }
      } else if (bot.pauseTimer > 0) {
        bot.pauseTimer -= dt;
        if (bot.pauseTimer <= 0) bot.burstLeft = BURST_MIN + Math.floor(random() * (BURST_MAX - BURST_MIN + 1));
      } else {
        bot.burstLeft = BURST_MIN + Math.floor(random() * (BURST_MAX - BURST_MIN + 1));
      }
      return;
    }

    // No target: walk the plan.
    bot.plantProgress = 0;
    bot.defuseProgress = 0;
    if (ctx.phase === 'freeze') return;
    let dest = null;
    if (planted) {
      // Attackers fall back to guard the planted bomb; defenders rush it.
      dest = bot.team === 'ally' ? nearestWaypoint(bomb.pos.x, bomb.pos.z) : nearestWaypoint(bomb.pos.x, bomb.pos.z);
    } else if (bot.hearPos && ctx.time < bot.hearUntil) {
      dest = nearestWaypoint(bot.hearPos.x, bot.hearPos.z);
    } else if (bot.team === 'ally') {
      dest = siteWaypoint(bot.role);
    } else {
      dest = holdWaypoint(bot.role);
    }
    if (bot.path.length === 0 || bot.path[bot.path.length - 1] !== dest) setPath(bot, dest);
    const arrived = followPath(bot, dt, bot.team === 'ally' && !planted ? RUSH_SPEED : WALK_SPEED);
    if (arrived) {
      // Hold: face the lane the enemy comes from.
      bot.holdYaw = bot.team === 'ally' ? Math.PI : 0;
      if (bot.role === 'mid') bot.holdYaw = bot.team === 'ally' ? Math.PI : 0;
      bot.yaw += (bot.holdYaw - bot.yaw) * Math.min(1, dt * 3);
    }
    // Stuck detection: if the bot barely moved, skip to the next waypoint.
    bot.stuckTimer += dt;
    if (bot.stuckTimer > 1) {
      const moved = Math.hypot(bot.pos.x - bot.lastX, bot.pos.z - bot.lastZ);
      if (moved < 0.2 && bot.pathIdx < bot.path.length) bot.pathIdx += 1;
      bot.lastX = bot.pos.x;
      bot.lastZ = bot.pos.z;
      bot.stuckTimer = 0;
    }
  }

  function syncMeshes() {
    for (const bot of bots) {
      if (!bot.alive) continue;
      bot.parts.group.position.set(bot.pos.x, 0, bot.pos.z);
      bot.parts.group.rotation.y = bot.yaw;
    }
  }

  return {
    get bots() {
      return bots;
    },
    reset,
    damage,
    step(dt, ctx) {
      for (const bot of bots) stepBot(bot, dt, ctx);
      syncMeshes();
    },
    aliveCount(team) {
      return bots.filter((b) => b.team === team && b.alive).length;
    },
    carrier() {
      return bots.find((b) => b.carriesBomb && b.alive) ?? null;
    },
  };
}
