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
let myConnections = {};  // { canId: clueId }
let revealed = false;
let dragging = null;     // { fromDot, startX, startY, currentX, currentY }
let playerId = getOrCreatePlayerId();

// ── Canvas setup ───────────────────────────────────────────────────────────
const canvas = document.getElementById('line-canvas');
const ctx    = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  redrawAll();
}

// ── DOM refs ───────────────────────────────────────────────────────────────
const colCans    = document.getElementById('col-cans');
const colClues   = document.getElementById('col-clues');
const pcEl       = document.getElementById('player-count');
const revOverlay = document.getElementById('reveal-overlay');
const scoreText  = document.getElementById('score-text');

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
function drawLine(x1, y1, x2, y2, color, dashed) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.setLineDash(dashed ? [10, 6] : []);
  ctx.globalAlpha = dashed ? 0.75 : 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
}

function redrawAll() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw confirmed connections
  Object.entries(myConnections).forEach(([canId, clueId]) => {
    const canDot  = getDot('can', canId);
    const clueDot = getDot('clue', clueId);
    if (!canDot || !clueDot) return;
    const a = dotCenter(canDot), b = dotCenter(clueDot);
    let color = '#e8a020';
    if (revealed) color = CORRECT_PAIRS[canId] === clueId ? '#22c55e' : '#ef4444';
    drawLine(a.x, a.y, b.x, b.y, color, false);
  });

  // Draw active drag line
  if (dragging) {
    drawLine(dragging.startX, dragging.startY, dragging.currentX, dragging.currentY, '#e8a020', true);
  }
}

// ── Drag (Pointer Events) ──────────────────────────────────────────────────
function wireDot(dot) {
  dot.addEventListener('pointerdown', e => {
    if (revealed) return;
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

    // Find target dot
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
  const HIT = 32; // generous hit area in px
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
  // Remove any existing can→? or ?→clue connections
  for (const [cid, lid] of Object.entries(myConnections)) {
    if (cid === canId || lid === clueId) delete myConnections[cid];
  }
  myConnections[canId] = clueId;
  redrawAll();
  postState('connect', { canId, clueId });
}

// ── Reveal ─────────────────────────────────────────────────────────────────
function triggerReveal() {
  revealed = true;
  redrawAll();
  const total   = Object.keys(CORRECT_PAIRS).length;
  const correct = Object.entries(myConnections).filter(([c, l]) => CORRECT_PAIRS[c] === l).length;
  scoreText.textContent = `${correct} / ${total} correct`;
  revOverlay.classList.add('show');
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
    if (data.revealed && !revealed) triggerReveal();
  } catch (_) {}
}

// ── Boot ───────────────────────────────────────────────────────────────────
function wireGlobalEvents() {
  window.addEventListener('resize', resizeCanvas);
  revOverlay.addEventListener('click', () => revOverlay.classList.remove('show'));
  window.addEventListener('beforeunload', () => postState('leave'));

  document.getElementById('reveal-btn-game').addEventListener('click', async () => {
    if (!confirm('Reveal answers to all players?')) return;
    await postState('reveal');
    triggerReveal();
  });
}

buildColumns();
// Wire dots after they're in the DOM
document.querySelectorAll('.dot').forEach(wireDot);
resizeCanvas();
wireGlobalEvents();
postState('join');
poll();
setInterval(poll, 2000);
