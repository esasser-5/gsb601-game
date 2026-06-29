/*
 * Supabase schema (run in SQL editor at supabase.com/dashboard):
 *
 * create table connections (
 *   id uuid default gen_random_uuid() primary key,
 *   session_id text not null,
 *   player_id text not null,
 *   can_id text not null,
 *   clue_id text not null,
 *   created_at timestamptz default now(),
 *   unique(session_id, player_id, can_id)
 * );
 *
 * create table game_state (
 *   session_id text primary key,
 *   revealed boolean default false,
 *   player_count int default 0,
 *   updated_at timestamptz default now()
 * );
 *
 * -- In Supabase dashboard: Database → Replication → enable realtime for both tables
 */

const SESSION_ID = 'gsb601-2025';

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
  { id: 'clydesdales',        label: 'Clydesdales',        img: 'clydesdales.jpg' },
  { id: 'michael-jackson',    label: 'Michael Jackson',    img: 'michael-jackson.jpg' },
  { id: 'bo-jackson',         label: 'Bo Jackson',         img: 'bojackson.jpg' },
  { id: 'mean-joe-greene',    label: 'Mean Joe Greene',    img: 'mean-joe-greene.jpg' },
  { id: 'construction-worker',label: 'Construction Worker',img: 'construction-worker.jpg' },
  { id: 'machu-picchu',       label: 'Machu Picchu',       img: 'machu-picchu.jpg' },
];

// ── State ──────────────────────────────────────────────────────────────────
let connections = {};   // { canId: clueId }
let revealed = false;
let supabase = null;
let playerId = getOrCreatePlayerId();
let channel = null;

// ── Drag state ─────────────────────────────────────────────────────────────
let dragging = null;  // { fromCol, fromId, startX, startY }

// ── DOM refs ───────────────────────────────────────────────────────────────
const svg       = document.getElementById('line-svg');
const dragLine  = document.getElementById('drag-line');
const colCans   = document.getElementById('col-cans');
const colClues  = document.getElementById('col-clues');
const pcEl      = document.getElementById('player-count');
const revOverlay = document.getElementById('reveal-overlay');
const scoreText  = document.getElementById('score-text');

// ── Init ───────────────────────────────────────────────────────────────────
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

function buildColumns() {
  const shuffledClues = shuffle(CLUES);
  CANS.forEach(can => {
    colCans.appendChild(makeCard(can, 'can'));
  });
  shuffledClues.forEach(clue => {
    colClues.appendChild(makeCard(clue, 'clue'));
  });
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

// ── Geometry ───────────────────────────────────────────────────────────────
function dotCenter(dotEl) {
  const r = dotEl.getBoundingClientRect();
  const sr = svg.getBoundingClientRect();
  return {
    x: r.left + r.width / 2 - sr.left,
    y: r.top  + r.height / 2 - sr.top
  };
}

function getDot(type, id) {
  return document.querySelector(`.dot[data-type="${type}"][data-id="${id}"]`);
}

// ── SVG lines ──────────────────────────────────────────────────────────────
function lineId(canId) { return `line-${canId}`; }

function upsertLine(canId, clueId, cls = '') {
  const existing = document.getElementById(lineId(canId));
  const line = existing || document.createElementNS('http://www.w3.org/2000/svg', 'line');
  if (!existing) {
    line.id = lineId(canId);
    line.classList.add('conn-line');
    svg.appendChild(line);
  }
  line.className.baseVal = 'conn-line' + (cls ? ' ' + cls : '');

  const canDot  = getDot('can', canId);
  const clueDot = getDot('clue', clueId);
  if (!canDot || !clueDot) return;

  const a = dotCenter(canDot);
  const b = dotCenter(clueDot);
  line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
  line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
}

function removeLine(canId) {
  document.getElementById(lineId(canId))?.remove();
}

function redrawAllLines() {
  Object.entries(connections).forEach(([canId, clueId]) => {
    const cls = revealed ? (CORRECT_PAIRS[canId] === clueId ? 'correct' : 'incorrect') : '';
    upsertLine(canId, clueId, cls);
  });
}

// ── Drag ───────────────────────────────────────────────────────────────────
function getEventXY(e) {
  if (e.touches) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}

function startDrag(e, dot) {
  if (revealed) return;
  e.preventDefault();
  const { x, y } = getEventXY(e);
  const sr = svg.getBoundingClientRect();
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
  const sr = svg.getBoundingClientRect();
  dragLine.setAttribute('x2', x - sr.left);
  dragLine.setAttribute('y2', y - sr.top);
}

function endDrag(e) {
  if (!dragging) return;
  dragLine.style.display = 'none';

  const { x, y } = e.changedTouches
    ? { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY }
    : { x: e.clientX, y: e.clientY };

  // Find target dot in opposite column
  const targetType = dragging.type === 'can' ? 'clue' : 'can';
  const targetDot = findDotAtPoint(x, y, targetType);

  if (targetDot) {
    const canId  = dragging.type === 'can'  ? dragging.id : targetDot.dataset.id;
    const clueId = dragging.type === 'clue' ? dragging.id : targetDot.dataset.id;
    saveConnection(canId, clueId);
  }

  dragging = null;
}

function findDotAtPoint(x, y, type) {
  const dots = document.querySelectorAll(`.dot[data-type="${type}"]`);
  for (const dot of dots) {
    const r = dot.getBoundingClientRect();
    const expandedHitSize = 30; // generous hit area
    if (x >= r.left - expandedHitSize && x <= r.right + expandedHitSize &&
        y >= r.top  - expandedHitSize && y <= r.bottom + expandedHitSize) {
      return dot;
    }
  }
  return null;
}

// ── Connections ────────────────────────────────────────────────────────────
function saveConnection(canId, clueId) {
  // Remove any existing line from this can
  if (connections[canId]) removeLine(canId);
  // Remove any existing line going TO this clue from another can
  for (const [cid, lid] of Object.entries(connections)) {
    if (lid === clueId && cid !== canId) { removeLine(cid); delete connections[cid]; }
  }
  connections[canId] = clueId;
  upsertLine(canId, clueId);

  if (supabase) persistConnection(canId, clueId);
}

async function persistConnection(canId, clueId) {
  await supabase.from('connections').upsert({
    session_id: SESSION_ID,
    player_id:  playerId,
    can_id:     canId,
    clue_id:    clueId
  }, { onConflict: 'session_id,player_id,can_id' });
}

async function loadMyConnections() {
  if (!supabase) return;
  const { data } = await supabase
    .from('connections')
    .select('can_id, clue_id')
    .eq('session_id', SESSION_ID)
    .eq('player_id', playerId);
  if (data) {
    data.forEach(({ can_id, clue_id }) => {
      connections[can_id] = clue_id;
    });
    redrawAllLines();
  }
}

// ── Reveal ─────────────────────────────────────────────────────────────────
function triggerReveal() {
  revealed = true;
  redrawAllLines();

  const total   = Object.keys(CORRECT_PAIRS).length;
  const correct = Object.entries(connections).filter(([c, l]) => CORRECT_PAIRS[c] === l).length;
  scoreText.textContent = `${correct} / ${total} correct`;
  revOverlay.classList.add('show');
}

// ── Supabase realtime ──────────────────────────────────────────────────────
async function initSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    document.getElementById('supabase-banner').style.display = 'block';
    return;
  }

  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Ensure game_state row exists
  await supabase.from('game_state').upsert(
    { session_id: SESSION_ID, revealed: false, player_count: 1 },
    { onConflict: 'session_id', ignoreDuplicates: true }
  );

  // Increment player count
  await supabase.rpc('increment_player_count', { sid: SESSION_ID }).catch(() => {
    // RPC may not exist yet — update manually
    supabase.from('game_state')
      .select('player_count')
      .eq('session_id', SESSION_ID)
      .single()
      .then(({ data }) => {
        if (data) {
          supabase.from('game_state')
            .update({ player_count: (data.player_count || 0) + 1 })
            .eq('session_id', SESSION_ID);
        }
      });
  });

  // Subscribe to game_state changes (reveal signal + player count)
  channel = supabase
    .channel('game-room')
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'game_state',
      filter: `session_id=eq.${SESSION_ID}`
    }, payload => {
      const row = payload.new;
      if (row.player_count !== undefined) {
        pcEl.textContent = `${row.player_count} player${row.player_count !== 1 ? 's' : ''} connected`;
      }
      if (row.revealed && !revealed) triggerReveal();
    })
    .subscribe();

  // Load current state
  const { data: state } = await supabase
    .from('game_state')
    .select('revealed, player_count')
    .eq('session_id', SESSION_ID)
    .single();

  if (state) {
    pcEl.textContent = `${state.player_count} player${state.player_count !== 1 ? 's' : ''} connected`;
    if (state.revealed) triggerReveal();
  }

  await loadMyConnections();

  // Decrement on leave
  window.addEventListener('beforeunload', async () => {
    const { data } = await supabase.from('game_state').select('player_count').eq('session_id', SESSION_ID).single();
    if (data && data.player_count > 0) {
      await supabase.from('game_state').update({ player_count: data.player_count - 1 }).eq('session_id', SESSION_ID);
    }
  });
}

// ── Event wiring ───────────────────────────────────────────────────────────
function wireEvents() {
  // Mouse
  document.addEventListener('mousedown', e => {
    const dot = e.target.closest('.dot');
    if (dot) startDrag(e, dot);
  });
  document.addEventListener('mousemove', moveDrag);
  document.addEventListener('mouseup', endDrag);

  // Touch
  document.addEventListener('touchstart', e => {
    const dot = e.target.closest('.dot');
    if (dot) startDrag(e, dot);
  }, { passive: false });
  document.addEventListener('touchmove', moveDrag, { passive: false });
  document.addEventListener('touchend', endDrag);

  // Resize → redraw lines
  window.addEventListener('resize', redrawAllLines);

  // Close reveal overlay on click
  revOverlay.addEventListener('click', () => revOverlay.classList.remove('show'));
}

// ── Boot ───────────────────────────────────────────────────────────────────
buildColumns();
wireEvents();
initSupabase();
