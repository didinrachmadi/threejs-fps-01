// The bomb: carried by the player (or an ally bot if the player falls), planted at
// a site by holding E, ticking down once planted, defused by a defender standing
// close. One small state record; main.js and bots.js drive it.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP } from './mapdata.js';

export const PLANT_TIME = 3;
export const BOMB_TIMER = 35;

export function createBomb(scene) {
  const mesh = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.22, 0.24),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.3, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.6 }),
  );
  const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
  mesh.add(body, light);
  mesh.visible = false;
  scene.add(mesh);

  const state = {
    carrier: 'player', // 'player' | bot object | null (dropped)
    planted: false,
    exploded: false,
    defused: false,
    site: null,
    pos: new THREE.Vector3(0, 0.2, 0),
    timer: BOMB_TIMER,
    plantProgress: 0,
    defuseProgress: 0,
    beepTimer: 0,
  };

  return {
    state,
    reset() {
      state.carrier = 'player';
      state.planted = false;
      state.exploded = false;
      state.defused = false;
      state.site = null;
      state.timer = BOMB_TIMER;
      state.plantProgress = 0;
      state.defuseProgress = 0;
      mesh.visible = false;
    },
    dropAt(x, z) {
      state.carrier = null;
      state.pos.set(x, 0.2, z);
      mesh.visible = true;
      mesh.position.copy(state.pos);
    },
    plant(site) {
      state.planted = true;
      state.site = site;
      state.pos.set(site.x, 0.2, site.z);
      state.timer = BOMB_TIMER;
      mesh.visible = true;
      mesh.position.copy(state.pos);
    },
    siteAt(x, z) {
      for (const site of MAP.sites) {
        if (Math.hypot(site.x - x, site.z - z) <= site.radius) return site;
      }
      return null;
    },
    // Blinks the planted bomb's light faster as the timer runs down.
    step(dt, onBeep) {
      if (!state.planted || state.exploded || state.defused) return;
      state.timer -= dt;
      light.intensity = 3 + Math.sin(state.timer * 10) * 2;
      state.beepTimer -= dt;
      if (state.beepTimer <= 0) {
        state.beepTimer = Math.max(0.25, state.timer / BOMB_TIMER);
        onBeep?.();
      }
      if (state.timer <= 0) state.exploded = true;
    },
  };
}
