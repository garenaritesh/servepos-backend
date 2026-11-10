
import { Pool } from 'pg'

let pool

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured')
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 1,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000
    })
  }

  return pool
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'application/json')

  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed'
    })
  }

  try {
    const db = getPool()
    await db.query('SELECT 1')

    return res.status(200).json({
      ok: true,
      service: 'ServePOS Sync API',
      status: 'ready',
      database: 'connected'
    })
  } catch (error) {
    console.error('ServePOS health check failed:', error)

    return res.status(503).json({
      ok: false,
      service: 'ServePOS Sync API',
      status: 'not ready',
      database: 'disconnected'
    })
  }
}
