const SESSION = 'gsb601-2025';

async function redis(...args) {
  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const res = await fetch(`${url}/${args.map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const { result } = await res.json();
  return result;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const [revealed, playerCount, connections] = await Promise.all([
      redis('GET', `${SESSION}:revealed`),
      redis('SCARD', `${SESSION}:players`),
      redis('HGETALL', `${SESSION}:connections`)
    ]);

    // HGETALL via REST returns an array [field, val, field, val, ...]
    let connObj = {};
    if (Array.isArray(connections)) {
      for (let i = 0; i < connections.length; i += 2) {
        connObj[connections[i]] = connections[i + 1];
      }
    }

    return res.status(200).json({
      revealed: !!revealed,
      playerCount: playerCount ?? 0,
      connections: connObj
    });
  }

  if (req.method === 'POST') {
    const { action, playerId, canId, clueId } = req.body ?? {};

    if (action === 'join') {
      await redis('SADD', `${SESSION}:players`, playerId);
      await redis('EXPIRE', `${SESSION}:players`, '7200');
      return res.status(200).json({ ok: true });
    }
    if (action === 'leave') {
      await redis('SREM', `${SESSION}:players`, playerId);
      return res.status(200).json({ ok: true });
    }
    if (action === 'connect') {
      await redis('HSET', `${SESSION}:connections`, `${playerId}:${canId}`, clueId);
      await redis('EXPIRE', `${SESSION}:connections`, '7200');
      return res.status(200).json({ ok: true });
    }
    if (action === 'reveal') {
      await redis('SET', `${SESSION}:revealed`, '1');
      await redis('EXPIRE', `${SESSION}:revealed`, '7200');
      return res.status(200).json({ ok: true });
    }
    if (action === 'reset') {
      await Promise.all([
        redis('DEL', `${SESSION}:revealed`),
        redis('DEL', `${SESSION}:connections`),
        redis('DEL', `${SESSION}:players`)
      ]);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'Unknown action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
