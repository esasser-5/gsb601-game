const revealBtn      = document.getElementById('reveal-btn');
const correctBtn     = document.getElementById('correct-btn');
const resetBtn       = document.getElementById('reset-btn');
const timerBtn       = document.getElementById('timer-btn');
const timerPauseBtn  = document.getElementById('timer-pause-btn');
const timerResetBtn  = document.getElementById('timer-reset-btn');
const pcEl           = document.getElementById('admin-player-count');
const statusEl       = document.getElementById('admin-status');
const countdownEl    = document.getElementById('admin-countdown');

let timerRafId  = null;
let timerStart  = null;
let timerPaused = null; // ms remaining when paused

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

function stopRaf() {
  if (timerRafId !== null) { cancelAnimationFrame(timerRafId); timerRafId = null; }
}

function startTimerDisplay(serverTimerStart) {
  if (timerStart === serverTimerStart) return; // already running this timer
  stopRaf();
  timerStart  = serverTimerStart;
  timerPaused = null;
  timerBtn.style.display      = 'none';
  timerPauseBtn.style.display = '';
  timerPauseBtn.textContent   = 'Pause';
  timerResetBtn.style.display = '';

  function tick() {
    const remaining = Math.max(0, 60000 - (Date.now() - timerStart));
    countdownEl.textContent = remaining > 0 ? formatTime(remaining) : "Time's up!";
    if (remaining > 0) timerRafId = requestAnimationFrame(tick);
    else timerRafId = null;
  }
  timerRafId = requestAnimationFrame(tick);
}

function showPausedDisplay(remainingMs) {
  stopRaf();
  timerPaused = remainingMs;
  timerStart  = null;
  countdownEl.textContent     = formatTime(remainingMs);
  timerPauseBtn.textContent   = 'Resume';
  timerPauseBtn.style.display = '';
  timerResetBtn.style.display = '';
  timerBtn.style.display      = 'none';
}

async function poll() {
  try {
    const res  = await fetch('/api/state');
    const data = await res.json();
    pcEl.textContent = data.playerCount ?? 0;

    if (data.revealed) {
      revealBtn.disabled = true;
      revealBtn.textContent = 'Answers Revealed';
      correctBtn.style.display = '';
      statusEl.textContent = 'Reveal sent to all players.';
    }

    if (data.timerPaused !== null && timerPaused === null && timerStart === null) {
      showPausedDisplay(data.timerPaused);
    } else if (data.timerStart !== null && data.timerStart !== timerStart) {
      startTimerDisplay(data.timerStart);
    }
  } catch (_) {
    statusEl.textContent = 'Error connecting to API.';
  }
}

timerBtn.addEventListener('click', async () => {
  statusEl.textContent = 'Timer started!';
  await post('timer');
  startTimerDisplay(Date.now()); // poll will correct exact value within 2s
});

timerPauseBtn.addEventListener('click', async () => {
  if (timerPaused !== null) {
    // Resume
    await post('timer-resume');
    const newStart = Date.now() - (60000 - timerPaused);
    startTimerDisplay(newStart);
    statusEl.textContent = 'Timer resumed.';
  } else {
    // Pause
    const remaining = Math.max(0, 60000 - (Date.now() - timerStart));
    await post('timer-pause');
    showPausedDisplay(remaining);
    statusEl.textContent = 'Timer paused.';
  }
});

timerResetBtn.addEventListener('click', async () => {
  await post('timer-reset');
  stopRaf();
  timerStart = null;
  timerPaused = null;
  countdownEl.textContent     = '';
  timerBtn.style.display      = '';
  timerPauseBtn.style.display = 'none';
  timerResetBtn.style.display = 'none';
  statusEl.textContent = 'Timer reset.';
});

correctBtn.addEventListener('click', async () => {
  correctBtn.disabled = true;
  correctBtn.textContent = 'Correct Answers Shown';
  await post('correct');
  statusEl.textContent = 'Correct answers shown to all players.';
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
  correctBtn.style.display = 'none';
  correctBtn.disabled = false;
  correctBtn.textContent = 'Show Correct Answers';
  stopRaf();
  timerStart = null;
  timerPaused = null;
  countdownEl.textContent     = '';
  timerBtn.style.display      = '';
  timerPauseBtn.style.display = 'none';
  timerResetBtn.style.display = 'none';
  statusEl.textContent = 'Game reset. Players must refresh.';
});

poll();
setInterval(poll, 2000);
