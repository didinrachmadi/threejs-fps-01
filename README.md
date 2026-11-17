![EMBERLINE](https://make.fun/badge/threejs-fps-01.svg)
![Rank](https://make.fun/badge/threejs-fps-01/didinrachmadi/threejs-fps-01/rank.svg)
![Reward](https://make.fun/badge/threejs-fps-01/didinrachmadi/threejs-fps-01/reward.svg)

# EMBERLINE

A tactical round-based FPS in three.js, built for
[make.fun's threejs-fps-01 bounty](https://make.fun/bounty/threejs-fps-01).
Plant the bomb at Foundry or Silo — or eliminate the Ashen squad.
First to 5 rounds takes the match.

## The game

- **First-person combat:** mouse look, WASD movement, crouch and jump, with
  recoil and spread that punish firing on the move. Headshots deal more damage.
- **Bots that fight back:** five Ashen bots patrol routes, hold positions, and
  react to what they see and hear.
- **Rounds and economy:** buy menu between rounds (rifles, SMG, frag grenade,
  Kevlar) with money earned per round; the bomb carrier plants at Foundry or
  Silo and the defenders defuse.
- **Original map:** Cinder Yard — lanes, corners and sightlines in one
  ember-and-ash palette, with fixed-step simulation separate from rendering.

## Controls

WASD move · Mouse look · Click fire · R reload · 1/2 weapons · E plant/defuse ·
G frag grenade · B buy menu · Ctrl crouch · Space jump · Shift walk slow

## Run it

```sh
node serve.ts
```

Serves `game/` at http://localhost:8080 — open it in a desktop browser with
WebGL 2 and click to play.

Build the entry dossier (deterministic, Node 22 stdlib only):

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Layout

```
main.ts            entrypoint: game/ + screenshots/ in, dossier.json out
serve.ts           serves game/ locally for playtesting
game/index.html    single import map "three" to the vendored build
game/src/          one-job modules: world, mapdata, player, bots, weapons,
                   bomb, rounds, hud, input, audio, palette, rng
game/vendor/three/ three.js 0.187.0, vendored byte-for-byte
screenshots/       1-start.jpg (cover), 2-play.jpg, 3-buy.jpg, 4-end.jpg
vendor/            makefun-threejs.ts, the kit's dossier library, unchanged
```

## License

MIT — see `LICENSE`.
