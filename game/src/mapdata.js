// Cinder Yard: the map as data, not geometry. One list of boxes (every box is a
// collider and a bullet stopper), the two bomb sites, the spawns, and a waypoint graph
// the bots walk. The yard is 52 x 40 m: attackers spawn south, defenders north, site
// A (Foundry) west, site B (Silo) east, and a mid lane with a doors gap in the middle.
// Nothing here names a real place or a commercial game.
export const MAP = {
  size: { x: 52, z: 40 },
  // [width, height, depth, x, y, z, material]
  boxes: [
    // Ground and perimeter.
    [52.4, 0.4, 40.4, 0, -0.2, 0, 'sand'],
    [52.4, 4.6, 0.4, 0, 2.3, -20.2, 'steel'],
    [52.4, 4.6, 0.4, 0, 2.3, 20.2, 'steel'],
    [0.4, 4.6, 40.4, -26.2, 2.3, 0, 'steel'],
    [0.4, 4.6, 40.4, 26.2, 2.3, 0, 'steel'],
    // Mid: a central block and two walls leaving a 3 m doors gap at x = 0.
    [6, 3.2, 4, 0, 1.6, -2, 'steelDark'],
    [6.5, 3.4, 0.6, -4.75, 1.7, 2, 'slate'],
    [6.5, 3.4, 0.6, 4.75, 1.7, 2, 'slate'],
    // Lane dividers: long walls that force A / mid / B decisions.
    [0.6, 3.0, 10, -11, 1.5, 6, 'slate'],
    [0.6, 3.0, 10, 11, 1.5, 6, 'slate'],
    [0.6, 3.0, 8, -11, 1.5, -8, 'slate'],
    [0.6, 3.0, 8, 11, 1.5, -8, 'slate'],
    // Site A (Foundry): rust containers and a corner wall.
    [4, 2.6, 2.2, -19, 1.3, -15, 'rust'],
    [2.2, 2.6, 2.2, -22.5, 1.3, -10.5, 'rust'],
    [2, 1.1, 2, -15, 0.55, -9.5, 'steelDark'],
    [0.6, 2.6, 6, -13, 1.3, -14, 'slate'],
    [3, 1.1, 1.4, -19, 0.55, -8, 'steelDark'],
    // Site B (Silo): steel containers and a corner wall.
    [4, 2.6, 2.2, 19, 1.3, -15, 'steel'],
    [2.2, 2.6, 2.2, 22.5, 1.3, -10.5, 'steel'],
    [2, 1.1, 2, 15, 0.55, -9.5, 'steelDark'],
    [0.6, 2.6, 6, 13, 1.3, -14, 'slate'],
    [3, 1.1, 1.4, 19, 0.55, -8, 'steelDark'],
    // Mid-lower crates and spawn cover.
    [2.2, 1.1, 2.2, -8, 0.55, 8, 'steelDark'],
    [2.2, 1.1, 2.2, 8, 0.55, 8, 'steelDark'],
    [3, 1.1, 1.4, -3, 0.55, 12, 'steelDark'],
    [3, 1.1, 1.4, 3, 0.55, 12, 'steelDark'],
    [1.6, 1.1, 1.6, -6, 0.55, 16.5, 'steelDark'],
    [1.6, 1.1, 1.6, 6, 0.55, 16.5, 'steelDark'],
    // Pillars that break the long sightlines.
    [1.2, 4, 1.2, -16, 2, 2, 'slate'],
    [1.2, 4, 1.2, 16, 2, 2, 'slate'],
    [1.2, 4, 1.2, -6, 2, -8, 'slate'],
    [1.2, 4, 1.2, 6, 2, -8, 'slate'],
  ],
  sites: [
    { id: 'A', name: 'Foundry', x: -19, z: -13, radius: 4.6 },
    { id: 'B', name: 'Silo', x: 19, z: -13, radius: 4.6 },
  ],
  spawns: {
    attackers: [
      { x: -3, z: 17.5 },
      { x: 0, z: 18 },
      { x: 3, z: 17.5 },
      { x: -7, z: 16.5 },
    ],
    defenders: [
      { x: -6, z: -17 },
      { x: 0, z: -17.5 },
      { x: 6, z: -17 },
      { x: -14, z: -15.5 },
      { x: 14, z: -15.5 },
    ],
  },
  // Waypoint graph: [x, z] nodes and [a, b] edges (undirected). Bots BFS through it.
  waypoints: [
    [0, 17], // 0 attacker spawn
    [-10, 14], // 1
    [10, 14], // 2
    [-20, 10], // 3 A lane low
    [20, 10], // 4 B lane low
    [-20, 0], // 5 A lane
    [20, 0], // 6 B lane
    [-20, -9], // 7 A approach
    [20, -9], // 8 B approach
    [-19, -13], // 9 site A
    [19, -13], // 10 site B
    [0, 10], // 11 mid low
    [0, 5], // 12 mid
    [0, -5], // 13 mid high (through doors)
    [0, -11], // 14 mid top
    [-7, -8], // 15 connector west
    [7, -8], // 16 connector east
    [-6, -16], // 17 defender spawn west
    [6, -16], // 18 defender spawn east
    [-14, -16], // 19 A hold
    [14, -16], // 20 B hold
    [-15, -4], // 21 A lane hold
    [15, -4], // 22 B lane hold
    [0, -16], // 23 defender spawn mid
  ],
  edges: [
    [0, 1], [0, 2], [0, 11],
    [1, 3], [1, 11], [2, 4], [2, 11],
    [3, 5], [4, 6],
    [5, 7], [5, 21], [6, 8], [6, 22],
    [7, 9], [7, 21], [8, 10], [8, 22],
    [9, 19], [10, 20],
    [11, 12], [12, 13], [13, 14],
    [13, 15], [13, 16], [14, 15], [14, 16],
    [15, 21], [15, 17], [16, 22], [16, 18],
    [14, 23], [17, 23], [18, 23],
    [17, 19], [18, 20], [19, 21], [20, 22],
    [9, 15], [10, 16],
  ],
};

// The nearest waypoint to a point, by index.
export function nearestWaypoint(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < MAP.waypoints.length; i += 1) {
    const w = MAP.waypoints[i];
    const d = (w[0] - x) * (w[0] - x) + (w[1] - z) * (w[1] - z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// Breadth-first shortest path of waypoint indices from `from` to `to`.
export function findPath(from, to) {
  if (from === to) return [to];
  const prev = new Array(MAP.waypoints.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const [a, b] of MAP.edges) {
      const next = a === cur ? b : b === cur ? a : -1;
      if (next === -1 || prev[next] !== -1) continue;
      prev[next] = cur;
      if (next === to) {
        const path = [to];
        let node = to;
        while (node !== from) {
          node = prev[node];
          path.unshift(node);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [to];
}
