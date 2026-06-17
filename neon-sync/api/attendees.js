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

  const { eventId } = req.query

  const { data, error } = await supabase
    .from('event_attendees')
    .select('first_name, last_name, course, class_name, date_of_birth')
    .eq('neon_event_id', eventId)

  if (error) {
    console.error(error)
    return res.status(500).send('Query failed')
  }

  res.json(data)
}