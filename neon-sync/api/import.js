import { runImport } from '../src/import-entries.js'

export default async function handler(req, res) {
  return res.json({ ok: true, logs: ['test log'] })
}

export default async function handler(req, res) {
  const token = req.headers['x-admin-token']

  if (token !== process.env.ADMIN_SECRET) {
    return res.status(401).send('Unauthorized')
  }

  try {
    // Capture console logs
    let logs = []

    const originalLog = console.log
    console.log = (...args) => {
      logs.push(args.join(' '))
      originalLog(...args)
    }

    const result = await runImport()

    // restore console
    console.log = originalLog

    res.json({
      success: true,
      logs,
      result
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({
      success: false,
      error: err.message
    })
  }
}