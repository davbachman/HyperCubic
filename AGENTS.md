# HyperCube Agent Guide

## Purpose
This repository is a browser game: a first-person neon maze on the 3D cube-cells (cells) of a 4D hypercube (tesseract).  
The player controls camera-relative room rotations and traverses L-shaped wall holes when the shuttle L-shape matches exactly.

## Stack
- Runtime: Vite + ES modules
- Rendering: Three.js + postprocessing bloom
- Audio: WebAudio (procedural synth cues + ambient pulse)
- Tests: Vitest
- Language: plain JavaScript (no TypeScript)
- Deploy: GitHub Pages via GitHub Actions

## Runbook
- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Preview build: `npm run preview`
- Tests: `npm test`

## Directory Map
- `/Users/davidbachman/Documents/HyperCube/src/main.js`
  - App bootstrap, render loop, fullscreen toggle, `?seed=` support, test hooks on `window`.
- `/Users/davidbachman/Documents/HyperCube/src/audio/soundscape.js`
  - Procedural Tron-style audio (idle pulse, turns, traverse, swap pulse, misalign, win cue).
- `/Users/davidbachman/Documents/HyperCube/src/game/topology.js`
  - Tesseract room IDs, room colors, wall adjacency, wall vectors, wall bases.
- `/Users/davidbachman/Documents/HyperCube/src/game/maze.js`
  - Solver-backed deterministic maze generation, hole orientations, exit placement, difficulty search.
- `/Users/davidbachman/Documents/HyperCube/src/game/mazeEvaluator.js`
  - State-space evaluator/solver and transport-consistent reciprocal hole mapping helpers.
- `/Users/davidbachman/Documents/HyperCube/src/game/orientation.js`
  - Discrete 90 degree orientation matrices and vector transforms.
- `/Users/davidbachman/Documents/HyperCube/src/game/Game.js`
  - Core state machine, controls, alignment logic, traverse animation, win logic.
- `/Users/davidbachman/Documents/HyperCube/src/render/scene.js`
  - Camera, lights, fog, bloom composer.
- `/Users/davidbachman/Documents/HyperCube/src/render/room.js`
  - Room mesh, black walls, neon edges, rails, L-hole cutouts and outlines.
- `/Users/davidbachman/Documents/HyperCube/src/render/shuttle.js`
  - Three-arm pearly-white shuttle mesh.
- `/Users/davidbachman/Documents/HyperCube/src/ui/overlay.js`
  - Start/help panel, room chip, alignment/status chip, win panel.
- `/Users/davidbachman/Documents/HyperCube/vite.config.js`
  - Vite config including GitHub Pages project-site `base` path.
- `/Users/davidbachman/Documents/HyperCube/.github/workflows/deploy-pages.yml`
  - GitHub Actions workflow that builds and deploys `dist/` to GitHub Pages.
- `/Users/davidbachman/Documents/HyperCube/tests`
  - Topology, orientation, transport, maze generation, and maze evaluator tests.

## Game Model (Current)
- Rooms are the 8 tesseract cells: `W+`, `W-`, `X+`, `X-`, `Y+`, `Y-`, `Z+`, `Z-`.
- Each room has 6 walls (all axes except its fixed axis, both signs).
- Neighbor rule is topology-driven and implemented in `getNeighbor(roomId, wallKey)`.
- Colors are fixed:
  - `W+` red (exit room)
  - `W-` orange
  - `X+` yellow
  - `X-` blue
  - `Y+` green
  - `Y-` pink
  - `Z+` purple
  - `Z-` violet
- Non-exit wall pairs use reciprocal normal holes with transport-consistent orientation:
  - reciprocal orientation is derived from traversal transport + wall basis conventions (not a fixed `h`-flip rule).
- Exit is one-way:
  - one `EXIT` wall on `W+`
  - reciprocal side is `NONE` (solid wall from neighbor side).
- Maze generation is solver-backed and deterministic by seed:
  - start room / exit wall / hole orientations are searched for solvability and difficulty target (`22+` steps default, with fallback clamp).

## Controls and State
- Start: `Enter` or `Space`.
- Rotate:
  - `ArrowLeft` -> 90 degree yaw one way
  - `ArrowRight` -> 90 degree yaw opposite way
  - `ArrowUp` / `ArrowDown` -> 90 degree pitch steps
- Traverse: `Space` when aligned and front wall is passable.
- Fullscreen: `F`.
- Modes:
  - `START`, `PLAYING`, `ROTATING`, `TRAVERSING`, `WIN`.

## Alignment and Traversal Rules
- Front wall selection is camera-facing based:
  - choose the visible wall with highest dot between wall normal and camera forward.
  - this avoids side-wall selection drift from screen-center heuristics.
- Shuttle-vs-hole match is strict equality of `(h, v)` signs in wall basis.
- Alignment is evaluated in the shuttle frame using the current traversal transport orientation.
- Rotationally equivalent L-shapes are intentionally not accepted unless exact.
- Traverse animation:
  - shuttle/camera stay fixed
  - current room translates away, then next room translates in.
- Exit traversal transitions to `WIN`.
- Under transport holonomy, the reciprocal wall is not guaranteed to appear after a simple 180 degree turn.

## Debug and Automation Hooks
- `window.render_game_to_text()` returns JSON state for automation.
  - includes front-wall destination IDs and orientation signatures (`view`, `transport`, effective).
- `window.advanceTime(ms)` advances deterministic simulation steps.
- `?seed=<uint32>` URL param forces deterministic maze generation for debugging/browser parity checks.
- Use these hooks when debugging controls/alignment and when writing integration checks.

## Invariants You Should Preserve
- Topology reciprocity:
  - crossing a wall and crossing its reciprocal returns to origin room/wall.
- Maze reciprocity:
  - normal-hole reciprocal orientations must match the transport-consistent mapping for the directed wall pair.
- Exit invariant:
  - exactly one `EXIT` in red room and exactly one reciprocal `NONE`.
- Topology destination invariant:
  - every wall state's `toRoomId/toWallKey` must match `getNeighbor`.

## Known Intentional Design Decisions
- V1 maze generation is solver-backed, deterministic by seed, and always returns a solvable maze.
- Difficulty target defaults to `22+` shortest keypresses with in-budget fallback clamping (`22` -> `16` -> best feasible).
- Holonomy-rich solutions are preferred but not strictly required for acceptance.
- Room transitions apply a discrete transport step so left-turn movement combinatorics match tesseract face transport.
- Reciprocal hole orientations are transport-consistent so aligned traversals remain geometrically reversible across room boundaries.
- Audio cues are procedural (no audio assets) and browser gesture-gated until first keypress.
- Opposite-color pairs like `X+` (yellow) and `X-` (blue) are opposite tesseract cells, not direct neighbors.

## Common Pitfalls
- Do not select front wall by screen-center only; this breaks turn/combinatorics expectations.
- Do not modify wall destination links independently from topology.
- Do not assume reciprocal wall visibility after traversal is a 180 degree turn; under holonomy it may require a different turn sequence.
- Be careful with orientation-sign conventions in `getWallVector` and `getWallBasis`; many behaviors depend on them.
- Avoid committing generated artifacts unless explicitly requested:
  - `/Users/davidbachman/Documents/HyperCube/dist`
  - `/Users/davidbachman/Documents/HyperCube/output`
  - `.DS_Store` files

## Minimum Validation Before Hand-off
- Run `npm test`.
- Run `npm run build`.
- Perform at least one manual or Playwright run that verifies:
  - turning changes front-wall target as expected
  - aligned `Space` traverses to `frontWall.toRoomId`
  - one-way exit behavior still holds.
- When debugging holonomy/reciprocity issues, prefer a fixed `?seed=` and compare `render_game_to_text()` states across browsers.
