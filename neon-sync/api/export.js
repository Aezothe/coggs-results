import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function safe(val) {
  return val ? `"${val}"` : '""'
}

function buildCsv(rows) {
  const headers = ['FirstName', 'LastName', 'YearOfBirth', 'courseClass']
  const lines = [headers.join(',')]

  for (const r of rows) {
    const year = r.date_of_birth
      ? r.date_of_birth.split('-')[0]
      : ''

    const courseClass = [r.course, r.class_name]
      .filter(Boolean)
      .join(' ')

    const line = [
      safe(r.first_name),
      safe(r.last_name),
      safe(year),
      safe(courseClass)
    ].join(',')

    lines.push(line)
  }

  return lines.join('\n')
}

export default async function handler(req, res) {
  const { eventId } = req.query

  if (!eventId) {
    return res.status(400).json({ error: 'Missing eventId' })
  }

  const { data, error } = await supabase
    .from('event_attendees')
    .select('*')
    .eq('neon_event_id', eventId)

  if (error) {
    console.error(error)
    return res.status(500).json({ error: 'Query failed' })
  }

  const csv = buildCsv(data)

  res.setHeader('Content-Type', 'text/csv')
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=event_${eventId}.csv`
  )

  res.send(csv)
}
