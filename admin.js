const revealBtn = document.getElementById('reveal-btn');
const resetBtn  = document.getElementById('reset-btn');
const pcEl      = document.getElementById('admin-player-count');
const statusEl  = document.getElementById('admin-status');

async function post(action) {
  const res = await fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action })
  });
  return res.json();
}

async function poll() {
  try {
    const res  = await fetch('/api/state');
    const data = await res.json();
    pcEl.textContent = data.playerCount ?? 0;
    if (data.revealed) {
      revealBtn.disabled = true;
      revealBtn.textContent = 'Answers Revealed';
      statusEl.textContent  = 'Reveal sent to all players.';
    }
  } catch (_) {
    statusEl.textContent = 'Error connecting to API.';
  }
}

revealBtn.addEventListener('click', async () => {
  revealBtn.disabled = true;
  statusEl.textContent = 'Sending…';
  await post('reveal');
  statusEl.textContent = 'Reveal sent!';
});

resetBtn.addEventListener('click', async () => {
  if (!confirm('Reset the game? This clears all connections.')) return;
  statusEl.textContent = 'Resetting…';
  await post('reset');
  revealBtn.disabled = false;
  revealBtn.textContent = 'Reveal Answers';
  statusEl.textContent  = 'Game reset. Players must refresh.';
});

poll();
setInterval(poll, 2000);
