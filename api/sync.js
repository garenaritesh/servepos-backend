
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
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000
    })
  }

  return pool
}

function setCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  )
  res.setHeader('Vary', 'Origin')
}

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'application/json')
  return res.status(status).json(body)
}

export default async function handler(req, res) {
  // CORS headers for browser and Android WebView
  setCors(req, res)

  // Handle browser CORS preflight request
  if (req.method === 'OPTIONS') {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(204).end()
  }

  // Only POST is allowed for sync operations
  if (req.method !== 'POST') {
    return send(res, 405, {
      ok: false,
      error: 'Method not allowed'
    })
  }

  const expectedToken = process.env.SERVEPOS_SYNC_TOKEN

  if (!expectedToken) {
    return send(res, 503, {
      ok: false,
      error: 'Sync service is not configured'
    })
  }

  // Verify authorization token
  const auth = req.headers.authorization || ''
  const suppliedToken = auth.startsWith('Bearer ')
    ? auth.slice(7)
    : ''

  if (!suppliedToken || suppliedToken !== expectedToken) {
    return send(res, 401, {
      ok: false,
      error: 'Unauthorized'
    })
  }

  const {
    action,
    data,
    expectedRevision = 0,
    deviceId = 'unknown-device',
    syncType = 'manual'
  } = req.body || {}

  if (!['get', 'save'].includes(action)) {
    return send(res, 400, {
      ok: false,
      error: 'Invalid action'
    })
  }

  let client

  try {
    const db = getPool()
    client = await db.connect()

    // Download cloud data
    if (action === 'get') {
      const result = await client.query(
        'SELECT data, revision, updated_at FROM servepos_cloud_data WHERE id = 1'
      )

      if (!result.rowCount) {
        return send(res, 404, {
          ok: false,
          error: 'Cloud data row is missing. Run the ServePOS SQL setup first.'
        })
      }

      return send(res, 200, {
        ok: true,
        data: result.rows[0].data,
        revision: Number(result.rows[0].revision),
        updatedAt: result.rows[0].updated_at
      })
    }

    // Validate uploaded data
    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data)
    ) {
      return send(res, 400, {
        ok: false,
        error: 'A valid data object is required'
      })
    }

    if (
      !Number.isSafeInteger(Number(expectedRevision)) ||
      Number(expectedRevision) < 0
    ) {
      return send(res, 400, {
        ok: false,
        error: 'Invalid expectedRevision'
      })
    }

    // Save cloud data with revision protection
    await client.query('BEGIN')

    const updated = await client.query(
      `UPDATE servepos_cloud_data
       SET data = $1::jsonb,
           revision = revision + 1,
           updated_at = NOW()
       WHERE id = 1 AND revision = $2
       RETURNING revision, updated_at`,
      [
        JSON.stringify(data),
        Number(expectedRevision)
      ]
    )

    // Handle revision conflict
    if (!updated.rowCount) {
      await client.query('ROLLBACK')

      const latest = await client.query(
        'SELECT data, revision, updated_at FROM servepos_cloud_data WHERE id = 1'
      )

      if (!latest.rowCount) {
        return send(res, 404, {
          ok: false,
          error: 'Cloud data row is missing'
        })
      }

      return send(res, 409, {
        ok: false,
        error: 'Revision conflict. Fetch cloud data before trying again.',
        data: latest.rows[0].data,
        revision: Number(latest.rows[0].revision),
        updatedAt: latest.rows[0].updated_at
      })
    }

    // Save sync history
    await client.query(
      `INSERT INTO servepos_sync_history
       (device_id, sync_type, revision, status)
       VALUES ($1, $2, $3, 'success')`,
      [
        String(deviceId).slice(0, 120),
        syncType === 'automatic' ? 'automatic' : 'manual',
        Number(updated.rows[0].revision)
      ]
    )

    await client.query('COMMIT')

    return send(res, 200, {
      ok: true,
      revision: Number(updated.rows[0].revision),
      updatedAt: updated.rows[0].updated_at
    })

  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK')
      } catch { }
    }

    console.error('ServePOS sync API error:', error)

    return send(res, 500, {
      ok: false,
      error: 'Server error while syncing'
    })

  } finally {
    if (client) {
      client.release()
    }
  }
}
