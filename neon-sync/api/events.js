import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  const token = req.headers['x-admin-token']

  if (token !== process.env.ADMIN_SECRET) {
    return res.status(401).send('Unauthorized')
  }

  const { data, error } = await supabase
    .from('event_attendees')
    .select('neon_event_id, event_name')

  if (error) {
    console.error(error)
    return res.status(500).send('Query failed')
  }

  // dedupe events
  const eventsMap = {}

  for (const row of data) {
    if (!row.neon_event_id) continue

    eventsMap[row.neon_event_id] = row.event_name || row.neon_event_id
  }

  const events = Object.entries(eventsMap).map(([id, name]) => ({
    id,
    name
  }))

  // sort by name (optional but nice)
  events.sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  res.json(events)
}