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
let myConnections = {};
let revealed = false;
let dragging = null;
let playerId = getOrCreatePlayerId();

// ── DOM refs ───────────────────────────────────────────────────────────────
const svg        = document.getElementById('line-svg');
const dragLine   = document.getElementById('drag-line');
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

// ── Build UI ───────────────────────────────────────────────────────────────
function buildColumns() {
  shuffle(CLUES).forEach(clue => colClues.appendChild(makeCard(clue, 'clue')));
  CANS.forEach(can => colCans.appendChild(makeCard(can, 'can')));
}

function makeCard(item, type) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = item.id;
  card.dataset.type = type;

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

// ── Geometry — SVG is fixed over full viewport ─────────────────────────────
function dotCenter(dotEl) {
  const r = dotEl.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function getDot(type, id) {
  return document.querySelector(`.dot[data-type="${type}"][data-id="${id}"]`);
}

// ── SVG lines ──────────────────────────────────────────────────────────────
function lineId(canId) { return `line-${canId}`; }

function upsertLine(canId, clueId, cls = '') {
  let line = document.getElementById(lineId(canId));
  if (!line) {
    line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.id = lineId(canId);
    line.classList.add('conn-line');
    svg.appendChild(line);
  }
  line.className.baseVal = 'conn-line' + (cls ? ' ' + cls : '');
  const canDot  = getDot('can', canId);
  const clueDot = getDot('clue', clueId);
  if (!canDot || !clueDot) return;
  const a = dotCenter(canDot), b = dotCenter(clueDot);
  line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
  line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
}

function removeLine(canId) { document.getElementById(lineId(canId))?.remove(); }

function redrawAllLines() {
  Object.entries(myConnections).forEach(([canId, clueId]) => {
    const cls = revealed ? (CORRECT_PAIRS[canId] === clueId ? 'correct' : 'incorrect') : '';
    upsertLine(canId, clueId, cls);
  });
}

// ── Drag ───────────────────────────────────────────────────────────────────
function getEventXY(e) {
  return e.touches ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
                   : { x: e.clientX, y: e.clientY };
}

function startDrag(e, dot) {
  if (revealed) return;
  e.preventDefault();
  const c = dotCenter(dot);
  dragging = { type: dot.dataset.type, id: dot.dataset.id };
  dragLine.setAttribute('x1', c.x); dragLine.setAttribute('y1', c.y);
  dragLine.setAttribute('x2', c.x); dragLine.setAttribute('y2', c.y);
  dragLine.style.display = 'block';
}

function moveDrag(e) {
  if (!dragging) return;
  e.preventDefault();
  const { x, y } = getEventXY(e);
  dragLine.setAttribute('x2', x);
  dragLine.setAttribute('y2', y);
}

function endDrag(e) {
  if (!dragging) return;
  dragLine.style.display = 'none';
  const { x, y } = e.changedTouches
    ? { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY }
    : { x: e.clientX, y: e.clientY };
  const targetType = dragging.type === 'can' ? 'clue' : 'can';
  const targetDot  = findDotAtPoint(x, y, targetType);
  if (targetDot) {
    const canId  = dragging.type === 'can'  ? dragging.id : targetDot.dataset.id;
    const clueId = dragging.type === 'clue' ? dragging.id : targetDot.dataset.id;
    saveConnection(canId, clueId);
  }
  dragging = null;
}

function findDotAtPoint(x, y, type) {
  for (const dot of document.querySelectorAll(`.dot[data-type="${type}"]`)) {
    const r = dot.getBoundingClientRect();
    if (x >= r.left - 30 && x <= r.right + 30 && y >= r.top - 30 && y <= r.bottom + 30) return dot;
  }
  return null;
}

// ── Connections ────────────────────────────────────────────────────────────
function saveConnection(canId, clueId) {
  if (myConnections[canId]) removeLine(canId);
  for (const [cid, lid] of Object.entries(myConnections)) {
    if (lid === clueId && cid !== canId) { removeLine(cid); delete myConnections[cid]; }
  }
  myConnections[canId] = clueId;
  upsertLine(canId, clueId);
  postState('connect', { canId, clueId });
}

// ── Reveal ─────────────────────────────────────────────────────────────────
function triggerReveal() {
  revealed = true;
  redrawAllLines();
  const total   = Object.keys(CORRECT_PAIRS).length;
  const correct = Object.entries(myConnections).filter(([c, l]) => CORRECT_PAIRS[c] === l).length;
  scoreText.textContent = `${correct} / ${total} correct`;
  revOverlay.classList.add('show');
}

// ── API calls ──────────────────────────────────────────────────────────────
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
function wireEvents() {
  document.addEventListener('mousedown',  e => { const d = e.target.closest('.dot'); if (d) startDrag(e, d); });
  document.addEventListener('mousemove',  moveDrag);
  document.addEventListener('mouseup',    endDrag);
  document.addEventListener('touchstart', e => { const d = e.target.closest('.dot'); if (d) startDrag(e, d); }, { passive: false });
  document.addEventListener('touchmove',  moveDrag, { passive: false });
  document.addEventListener('touchend',   endDrag);
  window.addEventListener('resize', redrawAllLines);
  revOverlay.addEventListener('click', () => revOverlay.classList.remove('show'));
  window.addEventListener('beforeunload', () => postState('leave'));

  // Reveal button on main page
  document.getElementById('reveal-btn-game')?.addEventListener('click', async () => {
    if (!confirm('Reveal answers to all players?')) return;
    await postState('reveal');
    triggerReveal();
  });
}

buildColumns();
wireEvents();
postState('join');
poll();
setInterval(poll, 2000);
