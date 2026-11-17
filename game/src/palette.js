// The look plan, in one place. EMBERLINE is a dusk desert-industrial yard: warm sand
// and rust against cool steel and slate, one ember-orange accent for everything that
// matters (the bomb sites, the HUD accent, tracers). The same names are the CSS custom
// properties in index.html, so the page and the 3D scene share one palette.
export const PALETTE = {
  canvas: '#1a1512', // dusk sky / fog
  sand: '#b98a56', // ground, warm sand
  sandDark: '#8a6a45', // ground variation
  rust: '#a34d2d', // containers, site A accent
  steel: '#4a5560', // walls, site B accent
  steelDark: '#333c45', // crates, trim
  slate: '#232a31', // roofs, dark cover
  ink: '#f2ead9', // text, light surfaces
  muted: '#9a8f7d', // secondary text
  accent: '#ff7a1a', // ember orange: bomb, HUD accent, tracers
  ally: '#3fae8a', // friendly markers
  enemy: '#e5484d', // hostile markers
};

export function hex(name) {
  return PALETTE[name];
}
