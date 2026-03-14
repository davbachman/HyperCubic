# HyperCubic

First-person neon maze game played on the cube-cells of a 4D hypercube (tesseract). Rotate the room, align the shuttle's L-shape with the wall opening, and traverse to reach the exit.

Created by David Bachman with GPT-5 Codex

To learn more about David Bachman and his work visit https://pzacad.pitzer.edu/~dbachman/ and subscribe to his AI substack *Entropy Bonus* at https://profbachman.substack.com

## Play Online

GitHub Pages: [https://davbachman.github.io/HyperCubic/](https://davbachman.github.io/HyperCubic/)

If GitHub Pages has just been enabled, the first deployment may take a minute or two.

## How to Play

- Start: `Enter` or `Space`
- Rotate room:
  - `ArrowLeft`
  - `ArrowRight`
  - `ArrowUp`
  - `ArrowDown`
- Traverse through the front wall hole: `Space` (only when aligned)
- Fullscreen: `F`

### Goal

- Reach the red room (`W+`) and find the one-way `EXIT`.
- You can only traverse a wall when the shuttle L-shape exactly matches the wall's L-shaped hole.
- The front wall is selected by camera direction, so turning changes which wall you target.

## Audio

- The game uses synthesized audio (WebAudio).
- Your browser may require a first keypress (`Enter`/`Space`) before sound starts.

## Run Locally

```bash
npm install
npm run dev
```

Open the local Vite URL shown in the terminal.

## Build / Test

```bash
npm test
npm run build
```
