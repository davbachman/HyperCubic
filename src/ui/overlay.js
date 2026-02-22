export function createOverlay(root) {
  root.innerHTML = `
    <section id="start-panel" class="overlay-panel">
      <h1 id="title">HyperCube Shuttle Maze</h1>
      <p id="subtitle">Align the shuttle exactly with a wall hole and traverse the tesseract rooms.</p>
      <ul id="controls">
        <li><strong>Left / Right</strong>: rotate room 90°</li>
        <li><strong>Up / Down</strong>: rotate room 90°</li>
        <li><strong>Space</strong>: traverse aligned hole</li>
        <li><strong>Mobile</strong>: swipe to rotate, tap to move</li>
        <li><strong>F</strong>: toggle fullscreen</li>
        <li><strong>Enter or Space</strong>: start</li>
      </ul>
      <p id="credits">By David Bachman and GPT 5.3 codex</p>
    </section>
    <section id="win-panel" class="overlay-panel">
      <h1 id="title">Exit Reached</h1>
      <p id="subtitle">The shuttle passed through the one-way white gate in the red room.</p>
    </section>
    <button id="restart-button" type="button">Restart Game</button>
    <div id="room-chip" class="overlay-panel"></div>
    <div id="status-chip" class="overlay-panel"></div>
  `;

  const startPanel = root.querySelector('#start-panel');
  const winPanel = root.querySelector('#win-panel');
  const restartButton = /** @type {HTMLButtonElement} */ (root.querySelector('#restart-button'));
  const roomChip = root.querySelector('#room-chip');
  const statusChip = root.querySelector('#status-chip');

  restartButton.addEventListener('click', () => {
    window.location.reload();
  });

  function setMode(mode) {
    const playing = mode !== 'START';
    startPanel.style.display = mode === 'START' ? 'block' : 'none';
    winPanel.style.display = mode === 'WIN' ? 'block' : 'none';
    restartButton.style.display = playing ? 'block' : 'none';
    roomChip.style.display = playing ? 'block' : 'none';
    statusChip.style.display = playing ? 'block' : 'none';
  }

  function setRoom({ roomId, colorName, colorHex }) {
    roomChip.textContent = `${roomId} · ${colorName.toUpperCase()}`;
    roomChip.style.borderColor = `#${colorHex.toString(16).padStart(6, '0')}`;
    roomChip.style.boxShadow = `0 0 22px #${colorHex.toString(16).padStart(6, '0')}66`;
  }

  function setStatus(text, isPositive = false) {
    statusChip.textContent = text;
    statusChip.style.color = isPositive ? '#9cf8d0' : '#ffe5ad';
  }

  return {
    setMode,
    setRoom,
    setStatus,
  };
}
