const revealBtn    = document.getElementById('reveal-btn');
const resetBtn     = document.getElementById('reset-btn');
const timerBtn     = document.getElementById('timer-btn');
const pcEl         = document.getElementById('admin-player-count');
const statusEl     = document.getElementById('admin-status');
const countdownEl  = document.getElementById('admin-countdown');

let timerRafId = null;
let timerStart = null;

async function post(action) {
  const res = await fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action })
  });
  return res.json();
}

function formatTime(ms) {
  const s = Math.ceil(ms / 1000);
  return `0:${String(s).padStart(2, '0')}`;
}

function startTimerDisplay(serverTimerStart) {
  if (timerRafId !== null) return;
  timerStart = serverTimerStart;
  timerBtn.disabled = true;

  function tick() {
    const remaining = Math.max(0, 60000 - (Date.now() - timerStart));
    if (remaining > 0) {
      countdownEl.textContent = formatTime(remaining);
      timerRafId = requestAnimationFrame(tick);
    } else {
      countdownEl.textContent = "Time's up!";
      timerRafId = null;
    }
  }
  timerRafId = requestAnimationFrame(tick);
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
    if (data.timerStart && timerRafId === null) {
      startTimerDisplay(data.timerStart);
    }
  } catch (_) {
    statusEl.textContent = 'Error connecting to API.';
  }
}

timerBtn.addEventListener('click', async () => {
  timerBtn.disabled = true;
  statusEl.textContent = 'Timer started!';
  const data = await post('timer');
  if (data.ok) {
    // Use local Date.now() as approximation; poll will sync exact value
    startTimerDisplay(Date.now());
  }
});

revealBtn.addEventListener('click', async () => {
  revealBtn.disabled = true;
  statusEl.textContent = 'Sending…';
  await post('reveal');
  statusEl.textContent = 'Reveal sent!';
});

resetBtn.addEventListener('click', async () => {
  if (!confirm('Reset the game? This clears all connections and the timer.')) return;
  statusEl.textContent = 'Resetting…';
  await post('reset');
  revealBtn.disabled = false;
  revealBtn.textContent = 'Reveal Answers';
  timerBtn.disabled = false;
  countdownEl.textContent = '';
  if (timerRafId !== null) { cancelAnimationFrame(timerRafId); timerRafId = null; }
  timerStart = null;
  statusEl.textContent = 'Game reset. Players must refresh.';
});

poll();
setInterval(poll, 2000);
