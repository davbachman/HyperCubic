# HyperCube Agent Guide

## Purpose
This repository is a browser game: a first-person neon maze on the 3D cube-cells (faces) of a 4D hypercube (tesseract).  
The player controls camera-relative room rotations and traverses L-shaped wall holes when the shuttle L-shape matches exactly.

## Stack
- Runtime: Vite + ES modules
- Rendering: Three.js + postprocessing bloom
- Tests: Vitest
- Language: plain JavaScript (no TypeScript)

## Runbook
- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Tests: `npm test`

## Directory Map
- `/Users/davidbachman/Documents/HyperCube/src/main.js`
  - App bootstrap, render loop, fullscreen toggle, test hooks on `window`.
- `/Users/davidbachman/Documents/HyperCube/src/game/topology.js`
  - Tesseract room IDs, room colors, wall adjacency, wall vectors, wall bases.
- `/Users/davidbachman/Documents/HyperCube/src/game/maze.js`
  - Per-run maze generation, hole orientations, exit placement.
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
- `/Users/davidbachman/Documents/HyperCube/tests`
  - Topology, maze, orientation tests.

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
- Non-exit wall pairs use reciprocal normal holes with horizontal-mirrored orientation:
  - reciprocal `h = -h`, `v = v`.
- Exit is one-way:
  - one `EXIT` wall on `W+`
  - reciprocal side is `NONE` (solid wall from neighbor side).

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
- Rotationally equivalent L-shapes are intentionally not accepted unless exact.
- Traverse animation:
  - shuttle/camera stay fixed
  - current room translates away, then next room translates in.
- Exit traversal transitions to `WIN`.

## Debug and Automation Hooks
- `window.render_game_to_text()` returns JSON state for automation.
- `window.advanceTime(ms)` advances deterministic simulation steps.
- Use these hooks when debugging controls/alignment and when writing integration checks.

## Invariants You Should Preserve
- Topology reciprocity:
  - crossing a wall and crossing its reciprocal returns to origin room/wall.
- Maze reciprocity:
  - normal holes are mirrored exactly (`h` flipped only).
- Exit invariant:
  - exactly one `EXIT` in red room and exactly one reciprocal `NONE`.
- Topology destination invariant:
  - every wall state's `toRoomId/toWallKey` must match `getNeighbor`.

## Known Intentional Design Decisions
- V1 maze is randomized once per run and can be unsolvable.
- Room transitions apply a discrete transport step so left-turn movement combinatorics match tesseract face transport.
- Opposite-color pairs like `X+` (yellow) and `X-` (blue) are opposite tesseract cells, not direct neighbors.

## Common Pitfalls
- Do not select front wall by screen-center only; this breaks turn/combinatorics expectations.
- Do not modify wall destination links independently from topology.
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
