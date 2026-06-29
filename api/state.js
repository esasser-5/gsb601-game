const { kv } = require('@vercel/kv');

const SESSION = 'gsb601-2025';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const [revealed, playerCount, connections] = await Promise.all([
      kv.get(`${SESSION}:revealed`),
      kv.scard(`${SESSION}:players`),
      kv.hgetall(`${SESSION}:connections`)
    ]);
    return res.status(200).json({
      revealed: !!revealed,
      playerCount: playerCount ?? 0,
      connections: connections ?? {}
    });
  }

  if (req.method === 'POST') {
    const { action, playerId, canId, clueId } = req.body ?? {};

    if (action === 'join') {
      await kv.sadd(`${SESSION}:players`, playerId);
      await kv.expire(`${SESSION}:players`, 7200);
      return res.status(200).json({ ok: true });
    }
    if (action === 'leave') {
      await kv.srem(`${SESSION}:players`, playerId);
      return res.status(200).json({ ok: true });
    }
    if (action === 'connect') {
      await kv.hset(`${SESSION}:connections`, { [`${playerId}:${canId}`]: clueId });
      await kv.expire(`${SESSION}:connections`, 7200);
      return res.status(200).json({ ok: true });
    }
    if (action === 'reveal') {
      await kv.set(`${SESSION}:revealed`, '1', { ex: 7200 });
      return res.status(200).json({ ok: true });
    }
    if (action === 'reset') {
      await Promise.all([
        kv.del(`${SESSION}:revealed`),
        kv.del(`${SESSION}:connections`),
        kv.del(`${SESSION}:players`)
      ]);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'Unknown action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
