// The arsenal: three guns and a frag grenade, each with its own numbers, view model
// and feel. Spread grows with movement speed, so stopping to aim pays; recoil kicks
// the view model and the player's pitch. main.js owns the ray and the damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 Sidearm', price: 0, damage: 34, headMult: 3.5, magSize: 12,
    reserve: Infinity, fireGap: 0.18, reloadTime: 1.2, auto: false,
    spreadStill: 0.004, spreadMove: 0.03, range: 45, kick: 0.011,
  },
  vk47: {
    id: 'vk47', name: 'VK-47 Rifle', price: 2700, damage: 36, headMult: 4, magSize: 30,
    reserve: 90, fireGap: 0.11, reloadTime: 2.2, auto: true,
    spreadStill: 0.0022, spreadMove: 0.028, range: 70, kick: 0.014,
  },
  raptor: {
    id: 'raptor', name: 'Raptor-9 SMG', price: 1500, damage: 26, headMult: 3.5, magSize: 32,
    reserve: 96, fireGap: 0.075, reloadTime: 1.8, auto: true,
    spreadStill: 0.004, spreadMove: 0.035, range: 38, kick: 0.008,
  },
};

export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;

const MOVE_REFERENCE = 5.4;
const MUZZLE_TIME = 0.06;

export function createArsenal(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steelDark), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.slate), roughness: 0.6, metalness: 0.3 });

  function buildModel(def) {
    const model = new THREE.Group();
    if (def.id === 'p9') {
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.24), body);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.13, 0.07), grip);
      handle.position.set(0, -0.08, 0.08);
      model.add(slide, handle);
      model.position.set(0.22, -0.19, -0.38);
    } else if (def.id === 'vk47') {
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.42), grip);
      barrel.position.set(0, 0.025, -0.4);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
      stock.position.set(0, -0.02, 0.3);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.09), dark);
      mag.position.set(0, -0.11, -0.05);
      mag.rotation.x = 0.25;
      model.add(receiver, barrel, stock, mag);
      model.position.set(0.24, -0.2, -0.42);
    } else {
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.34), dark);
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), grip);
      barrel.position.set(0, 0.02, -0.3);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.07), body);
      mag.position.set(0, -0.12, 0.02);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.16), grip);
      stock.position.set(0, 0, 0.24);
      model.add(receiver, barrel, mag, stock);
      model.position.set(0.23, -0.19, -0.4);
    }
    model.visible = false;
    camera.add(model);
    return model;
  }

  const models = {};
  for (const def of Object.values(WEAPONS)) models[def.id] = buildModel(def);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  // One state record per weapon, so switching back keeps the magazine as it was.
  const states = {};
  for (const def of Object.values(WEAPONS)) {
    states[def.id] = { mag: def.magSize, reserve: def.reserve, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0 };
  }
  let currentId = 'p9';
  let grenades = 0;
  models[currentId].visible = true;

  function current() {
    return WEAPONS[currentId];
  }
  function state() {
    return states[currentId];
  }

  function step(dt) {
    const s = state();
    s.cooldown = Math.max(0, s.cooldown - dt);
    s.flash = Math.max(0, s.flash - dt);
    s.kick += (0 - s.kick) * Math.min(1, dt * 14);
    const model = models[currentId];
    const def = current();
    model.position.z = (def.id === 'p9' ? -0.38 : -0.42) + s.kick;
    model.rotation.x = s.kick * 2.2;
    flash.visible = s.flash > 0;
    flash.rotation.z = s.flash * 30;
    flashLight.intensity = s.flash > 0 ? 18 : 0;
    if (s.reloadLeft > 0) {
      s.reloadLeft = Math.max(0, s.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def.reloadTime - s.reloadLeft) * 2);
      if (s.reloadLeft === 0) {
        const need = def.magSize - s.mag;
        const take = Math.min(need, s.reserve);
        s.mag += take;
        s.reserve -= take;
      }
    }
  }

  return {
    WEAPONS,
    current,
    state,
    step,
    equip(id) {
      if (!WEAPONS[id] || id === currentId) return false;
      models[currentId].visible = false;
      currentId = id;
      models[currentId].visible = true;
      return true;
    },
    buy(id) {
      // A bought gun arrives loaded with a full reserve.
      states[id].mag = WEAPONS[id].magSize;
      states[id].reserve = WEAPONS[id].reserve;
      this.equip(id);
    },
    reset() {
      for (const def of Object.values(WEAPONS)) {
        states[def.id].mag = def.magSize;
        states[def.id].reserve = def.reserve;
        states[def.id].cooldown = 0;
        states[def.id].reloadLeft = 0;
        states[def.id].flash = 0;
        states[def.id].kick = 0;
      }
      grenades = 0;
      this.equip('p9');
    },
    ready() {
      const s = state();
      return s.mag > 0 && s.cooldown === 0 && s.reloadLeft === 0;
    },
    pullTrigger() {
      const s = state();
      s.cooldown = current().fireGap;
      s.flash = MUZZLE_TIME;
      s.kick = 0.055;
    },
    takeRound() {
      const s = state();
      if (s.mag <= 0) return false;
      s.mag -= 1;
      return true;
    },
    reload() {
      const s = state();
      const def = current();
      if (s.reloadLeft > 0 || s.mag === def.magSize || s.reserve === 0) return false;
      s.reloadLeft = def.reloadTime;
      return true;
    },
    spread(speed) {
      const def = current();
      return def.spreadStill + Math.min(1, speed / MOVE_REFERENCE) * def.spreadMove;
    },
    get grenades() {
      return grenades;
    },
    setGrenades(n) {
      grenades = n;
    },
    useGrenade() {
      if (grenades <= 0) return false;
      grenades -= 1;
      return true;
    },
  };
}
