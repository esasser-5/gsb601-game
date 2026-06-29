const SESSION_ID = 'gsb601-2025';

const revealBtn   = document.getElementById('reveal-btn');
const resetBtn    = document.getElementById('reset-btn');
const pcEl        = document.getElementById('admin-player-count');
const statusEl    = document.getElementById('admin-status');

let supabase = null;

async function init() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    statusEl.textContent = '⚠ Supabase not configured — add credentials to supabase-config.js';
    revealBtn.disabled = true;
    return;
  }

  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Ensure row exists
  await supabase.from('game_state').upsert(
    { session_id: SESSION_ID, revealed: false, player_count: 0 },
    { onConflict: 'session_id', ignoreDuplicates: true }
  );

  // Subscribe to live player count + reveal state
  supabase
    .channel('admin-room')
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'game_state',
      filter: `session_id=eq.${SESSION_ID}`
    }, payload => {
      updateUI(payload.new);
    })
    .subscribe();

  // Load current state
  const { data } = await supabase
    .from('game_state')
    .select('revealed, player_count')
    .eq('session_id', SESSION_ID)
    .single();

  if (data) updateUI(data);
}

function updateUI(state) {
  pcEl.textContent = state.player_count ?? 0;
  if (state.revealed) {
    revealBtn.disabled = true;
    revealBtn.textContent = 'Answers Revealed';
    statusEl.textContent = 'Reveal has been sent to all players.';
  }
}

revealBtn.addEventListener('click', async () => {
  if (!supabase) return;
  revealBtn.disabled = true;
  statusEl.textContent = 'Sending reveal…';
  const { error } = await supabase
    .from('game_state')
    .update({ revealed: true, updated_at: new Date().toISOString() })
    .eq('session_id', SESSION_ID);
  if (error) {
    statusEl.textContent = 'Error: ' + error.message;
    revealBtn.disabled = false;
  }
});

resetBtn.addEventListener('click', async () => {
  if (!supabase) return;
  if (!confirm('Reset the game? This clears all connections and hides the reveal.')) return;
  statusEl.textContent = 'Resetting…';
  await Promise.all([
    supabase.from('connections').delete().eq('session_id', SESSION_ID),
    supabase.from('game_state').update({ revealed: false, updated_at: new Date().toISOString() }).eq('session_id', SESSION_ID)
  ]);
  revealBtn.disabled = false;
  revealBtn.textContent = 'Reveal Answers';
  statusEl.textContent = 'Game reset. Players must refresh their page.';
});

init();
