import 'dotenv/config'
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ---- Config ----
const EVENT_ID = process.argv[2]
const OUTPUT_FILE = `event_${EVENT_ID}.csv`

// ---- Helpers ----
function safe(val) {
  return val ? `"${val}"` : '""'
}

// ---- Main export ----
async function run() {
  console.log(`Fetching attendees for event ${EVENT_ID}...`)

  const { data, error } = await supabase
    .from('event_attendees')
    .select('*')
    .eq('neon_event_id', EVENT_ID)

  if (error) {
    console.error('Supabase query error:', error)
    process.exit(1)
  }

  console.log(`Got ${data.length} attendees`)

  // Optional: filter out junk/test data
  const attendees = data.filter(a =>
    a.first_name &&
    a.last_name &&
    a.first_name.toLowerCase() !== 'test'
  )

  // Sort by last name
  attendees.sort((a, b) =>
    a.last_name.localeCompare(b.last_name)
  )

  // ---- CSV format ----
  const headers = [
    'FirstName',
    'LastName',
    'YearOfBirth',
    'CourseClass'
  ]
  
  const lines = [headers.join(',')]

  for (const a of attendees) {
    const year = a.date_of_birth
      ? a.date_of_birth.split('-')[0]
      : ''

    const courseClass = [a.course, a.class_name]
    .filter(Boolean)
    .join(' ')   // <-- space delimiter

    const line = [
    safe(a.first_name),
    safe(a.last_name),
    safe(year),
    safe(courseClass)
    ].join(',')

    lines.push(line)
  }

  fs.writeFileSync(OUTPUT_FILE, lines.join('\n'))

  console.log(`✅ CSV written: ${OUTPUT_FILE}`)
}

// ---- Run ----
run().catch(err => {
  console.error('Export failed:', err)
  process.exit(1)
})