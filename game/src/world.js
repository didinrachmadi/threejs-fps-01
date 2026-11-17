// The scene: builds the map's boxes from mapdata.js, lights the dusk yard, and marks
// the two bomb sites. Every box is a collider for movement and a surface a bullet
// stops on. No textures, no models: styled geometry in the one palette.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP } from './mapdata.js';

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'sand' ? 1 : name === 'steel' ? 0.55 : 0.85,
      metalness: name === 'steel' || name === 'steelDark' ? 0.35 : 0.02,
    });
  }
  // The ground gets a second, darker sand patchwork so the floor reads as terrain,
  // not a flat card: a few thin dark slabs laid on top of the ground box.
  const groundTint = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.sandDark), roughness: 1, metalness: 0 });

  const colliders = [];
  const shootables = [];
  const tmpBox = new THREE.Box3();

  function box(w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    tmpBox.setFromObject(mesh);
    colliders.push(tmpBox.clone());
    shootables.push(mesh);
    return mesh;
  }

  for (const [w, h, d, x, y, z, material] of MAP.boxes) box(w, h, d, x, y, z, material);

  // Dark sand patches on the ground, purely visual (they sit on the floor box).
  const patches = [
    [10, 0.02, 7, -14, 0.01, 8], [8, 0.02, 6, 12, 0.01, -2], [12, 0.02, 5, 2, 0.01, -14],
    [7, 0.02, 7, -18, 0.01, -6], [7, 0.02, 7, 18, 0.01, 6],
  ];
  for (const [w, h, d, x, y, z] of patches) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), groundTint);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Bomb-site markers: a glowing floor ring and a floating letter, both in the accent.
  const siteMarkers = [];
  for (const site of MAP.sites) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.radius - 0.25, site.radius, 48),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.03, site.z);
    group.add(ring);
    const pole = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 3.4, 0.18),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.35 }),
    );
    pole.position.set(site.x, 1.7, site.z);
    pole.castShadow = true;
    group.add(pole);
    const beacon = new THREE.PointLight(new THREE.Color(PALETTE.accent), 6, 12);
    beacon.position.set(site.x, 3.2, site.z);
    group.add(beacon);
    siteMarkers.push({ site, ring, beacon });
  }

  // Light: low dusk sun from the west, cool sky fill, and a warm bounce from the east.
  const sky = new THREE.HemisphereLight(new THREE.Color('#8a7a68'), new THREE.Color(PALETTE.canvas), 0.9);
  scene.add(sky);

  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb066'), 2.4);
  sun.position.set(-30, 22, 12);
  sun.target.position.set(4, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -32;
  sun.shadow.camera.right = 32;
  sun.shadow.camera.top = 32;
  sun.shadow.camera.bottom = -32;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(new THREE.Color('#7d90b0'), 0.5);
  fill.position.set(20, 14, -18);
  scene.add(fill);

  return { colliders, shootables, siteMarkers, group };
}
