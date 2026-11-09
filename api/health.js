export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  return res.status(200).json({ ok: true, service: 'ServePOS Sync API', status: 'ready' })
}
