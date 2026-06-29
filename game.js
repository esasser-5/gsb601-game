const CORRECT_PAIRS = {
  'budweiser':  'clydesdales',
  'pepsi':      'michael-jackson',
  'gatorade':   'bo-jackson',
  'coca-cola':  'mean-joe-greene',
  'diet-coke':  'construction-worker',
  'inca-kola':  'machu-picchu'
};

const CANS = [
  { id: 'budweiser',  label: 'Budweiser',  img: 'budweiser.jpg' },
  { id: 'pepsi',      label: 'Pepsi',      img: 'pepsi.jpg' },
  { id: 'gatorade',   label: 'Gatorade',   img: 'gatorade.jpg' },
  { id: 'coca-cola',  label: 'Coca-Cola',  img: 'coca-cola.jpg' },
  { id: 'diet-coke',  label: 'Diet Coke',  img: 'diet-coke.jpg' },
  { id: 'inca-kola',  label: 'Inca Kola',  img: 'inca-kola.jpg' },
];

const CLUES = [
  { id: 'clydesdales',         label: 'Clydesdales',         img: 'clydesdales.jpg' },
  { id: 'michael-jackson',     label: 'Michael Jackson',     img: 'michael-jackson.jpg' },
  { id: 'bo-jackson',          label: 'Bo Jackson',          img: 'bo-jackson.jpg' },
  { id: 'mean-joe-greene',     label: 'Mean Joe Greene',     img: 'mean-joe-greene.jpg' },
  { id: 'construction-worker', label: 'Construction Worker', img: 'construction-worker.jpg' },
  { id: 'machu-picchu',        label: 'Machu Picchu',        img: 'machu-picchu.jpg' },
];

// ── State ──────────────────────────────────────────────────────────────────
let myConnections = {};   // { canId: clueId }
let allConnections = {};  // { 'playerId:canId': clueId } from server
let revealPhase = 0;      // 0=playing, 1=show all lines, 2=show correct lines
let dragging = null;
let playerId = getOrCreatePlayerId();
let timerRafId = null;
let timerStart = null;

// ── Canvas setup ───────────────────────────────────────────────────────────
const canvas = document.getElementById('line-canvas');
const ctx    = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  redrawAll();
}

// ── DOM refs ───────────────────────────────────────────────────────────────
const colCans      = document.getElementById('col-cans');
const colClues     = document.getElementById('col-clues');
const pcEl         = document.getElementById('player-count');
const countdownEl  = document.getElementById('countdown');
const revealBanner = document.getElementById('reveal-banner');

// ── Helpers ────────────────────────────────────────────────────────────────
function getOrCreatePlayerId() {
  let id = localStorage.getItem('gsb601-player-id');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('gsb601-player-id', id); }
  return id;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dotCenter(dotEl) {
  const r = dotEl.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function getDot(type, id) {
  return document.querySelector(`.dot[data-type="${type}"][data-id="${id}"]`);
}

function formatTime(ms) {
  const s = Math.ceil(ms / 1000);
  return `0:${String(s).padStart(2, '0')}`;
}

// ── Build UI ───────────────────────────────────────────────────────────────
function buildColumns() {
  shuffle(CLUES).forEach(clue => colClues.appendChild(makeCard(clue, 'clue')));
  CANS.forEach(can => colCans.appendChild(makeCard(can, 'can')));
}

function makeCard(item, type) {
  const card = document.createElement('div');
  card.className = 'card';

  const img = document.createElement('img');
  img.src = item.img;
  img.alt = item.label;
  img.draggable = false;

  const label = document.createElement('div');
  label.className = 'card-label';
  label.textContent = item.label;

  const dot = document.createElement('div');
  dot.className = 'dot';
  dot.dataset.id = item.id;
  dot.dataset.type = type;

  card.appendChild(img);
  card.appendChild(label);
  card.appendChild(dot);
  return card;
}

// ── Canvas drawing ─────────────────────────────────────────────────────────
function drawLine(x1, y1, x2, y2, color, alpha, width, dashed) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width ?? 3;
  ctx.lineCap = 'round';
  ctx.setLineDash(dashed ? [10, 6] : []);
  ctx.globalAlpha = alpha ?? 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
}

function redrawAll() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (revealPhase === 0) {
    // Normal play: draw only my connections in amber
    Object.entries(myConnections).forEach(([canId, clueId]) => {
      const a = dotCenter(getDot('can', canId));
      const b = dotCenter(getDot('clue', clueId));
      if (a && b) drawLine(a.x, a.y, b.x, b.y, '#e8a020', 1, 3, false);
    });

  } else {
    // Phase 1 & 2: draw all students' connections overlaid

    // Build aggregate: unique (canId, clueId) pairs with who made them
    const aggregate = new Map(); // key: 'canId|clueId' → { canId, clueId, mine }
    Object.entries(allConnections).forEach(([key, clueId]) => {
      const colon = key.indexOf(':');
      const pid   = key.slice(0, colon);
      const canId = key.slice(colon + 1);
      const pairKey = `${canId}|${clueId}`;
      if (!aggregate.has(pairKey)) {
        aggregate.set(pairKey, { canId, clueId, mine: pid === playerId });
      } else if (pid === playerId) {
        aggregate.get(pairKey).mine = true;
      }
    });

    aggregate.forEach(({ canId, clueId, mine }) => {
      const canDot  = getDot('can', canId);
      const clueDot = getDot('clue', clueId);
      if (!canDot || !clueDot) return;
      const a = dotCenter(canDot), b = dotCenter(clueDot);
      const alpha = mine ? 0.7 : 0.35;
      drawLine(a.x, a.y, b.x, b.y, '#e8a020', alpha, 3, false);
    });

    if (revealPhase === 2) {
      // Layer correct pairs in green on top
      Object.entries(CORRECT_PAIRS).forEach(([canId, clueId]) => {
        const canDot  = getDot('can', canId);
        const clueDot = getDot('clue', clueId);
        if (!canDot || !clueDot) return;
        const a = dotCenter(canDot), b = dotCenter(clueDot);
        drawLine(a.x, a.y, b.x, b.y, '#22c55e', 1, 4, false);
      });
    }
  }

  // Active drag line
  if (dragging) {
    drawLine(dragging.startX, dragging.startY, dragging.currentX, dragging.currentY, '#e8a020', 0.75, 3, true);
  }
}

// ── Drag (Pointer Events) ──────────────────────────────────────────────────
function wireDot(dot) {
  dot.addEventListener('pointerdown', e => {
    if (revealPhase > 0) return;
    e.preventDefault();
    dot.setPointerCapture(e.pointerId);
    const c = dotCenter(dot);
    dragging = {
      dot,
      type:     dot.dataset.type,
      id:       dot.dataset.id,
      startX:   c.x,
      startY:   c.y,
      currentX: c.x,
      currentY: c.y,
    };
    redrawAll();
  });

  dot.addEventListener('pointermove', e => {
    if (!dragging || dragging.dot !== dot) return;
    e.preventDefault();
    dragging.currentX = e.clientX;
    dragging.currentY = e.clientY;
    redrawAll();
  });

  dot.addEventListener('pointerup', e => {
    if (!dragging || dragging.dot !== dot) return;
    const fromDragging = dragging;
    dragging = null;

    const targetType = fromDragging.type === 'can' ? 'clue' : 'can';
    const target = findDotAtPoint(e.clientX, e.clientY, targetType);
    if (target) {
      const canId  = fromDragging.type === 'can'  ? fromDragging.id : target.dataset.id;
      const clueId = fromDragging.type === 'clue' ? fromDragging.id : target.dataset.id;
      saveConnection(canId, clueId);
    } else {
      redrawAll();
    }
  });

  dot.addEventListener('pointercancel', () => {
    dragging = null;
    redrawAll();
  });
}

function findDotAtPoint(x, y, type) {
  const HIT = 32;
  for (const dot of document.querySelectorAll(`.dot[data-type="${type}"]`)) {
    const r = dot.getBoundingClientRect();
    const cx = r.left + r.width  / 2;
    const cy = r.top  + r.height / 2;
    if (Math.abs(x - cx) <= HIT && Math.abs(y - cy) <= HIT) return dot;
  }
  return null;
}

// ── Connections ────────────────────────────────────────────────────────────
function saveConnection(canId, clueId) {
  for (const [cid, lid] of Object.entries(myConnections)) {
    if (cid === canId || lid === clueId) delete myConnections[cid];
  }
  myConnections[canId] = clueId;
  redrawAll();
  postState('connect', { canId, clueId });
}

// ── Reveal ─────────────────────────────────────────────────────────────────
function triggerReveal() {
  revealPhase = 1;
  redrawAll();
  revealBanner.textContent = 'Tap to see correct answers →';
  revealBanner.classList.add('show');
  revealBanner.addEventListener('click', advanceReveal, { once: true });
}

function advanceReveal() {
  revealPhase = 2;
  redrawAll();
  revealBanner.textContent = 'Green = correct answer';
  revealBanner.classList.add('done');
}

// ── Timer ──────────────────────────────────────────────────────────────────
function startTimerDisplay(serverTimerStart) {
  if (timerStart === serverTimerStart) return; // already running this timer
  if (timerRafId !== null) { cancelAnimationFrame(timerRafId); timerRafId = null; }
  timerStart = serverTimerStart;

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

// ── API ────────────────────────────────────────────────────────────────────
async function postState(action, extra = {}) {
  try {
    await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, playerId, ...extra })
    });
  } catch (_) {}
}

async function poll() {
  try {
    const res  = await fetch('/api/state');
    if (!res.ok) return;
    const data = await res.json();
    pcEl.textContent = `${data.playerCount} player${data.playerCount !== 1 ? 's' : ''} connected`;
    allConnections = data.connections ?? {};
    if (data.revealed && revealPhase === 0) triggerReveal();
    if (data.correct && revealPhase === 1) advanceReveal();
    if (data.timerPaused !== null && timerStart === null) {
      // Timer is paused — show frozen time
      if (timerRafId !== null) { cancelAnimationFrame(timerRafId); timerRafId = null; }
      timerStart = null;
      countdownEl.textContent = formatTime(data.timerPaused);
    } else if (data.timerStart) {
      startTimerDisplay(data.timerStart);
    }
    if (revealPhase > 0) redrawAll();
  } catch (_) {}
}

// ── Boot ───────────────────────────────────────────────────────────────────
function wireGlobalEvents() {
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('beforeunload', () => postState('leave'));
}

buildColumns();
document.querySelectorAll('.dot').forEach(wireDot);
resizeCanvas();
wireGlobalEvents();
postState('join');
poll();
setInterval(poll, 2000);
