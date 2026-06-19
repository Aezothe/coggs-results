import 'dotenv/config'
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ---- Config ----
const EVENT_ID = process.argv[2]
if (!EVENT_ID) {
  console.error('Usage: node export-sitiming.js <eventId>')
  process.exit(1)
}

const OUTPUT_FILE = `event_${EVENT_ID}.csv`

// ---- Helpers ----
function safe(val) {
  if (val === null || val === undefined || val === '') return ''
  return String(val)
}

// Convert YYYY-MM-DD to SiTiming's M/D/YYYY format
function formatSiTimingDob(iso) {
  if (!iso) return ''
  const [year, month, day] = iso.split('-')
  if (!year || !month || !day) return ''
  return `${Number(month)}/${Number(day)}/${year}`
}

function buildGenderDob(gender, iso) {
  const dob = formatSiTimingDob(iso)
  const g = gender ? String(gender).trim().toUpperCase().slice(0, 1) : ''
  if (!dob) return ''
  return `${g}${dob}`
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

  // Filter out junk/test data
  const attendees = data.filter(a =>
    a.first_name &&
    a.last_name &&
    a.first_name.toLowerCase() !== 'test'
  )

  // Sort by last name
  attendees.sort((a, b) => a.last_name.localeCompare(b.last_name))

  const headers = [
    'BibNumber',
    'NumberCompetitors',
    'CardNumbers',
    'MembershipNumbers',
    'Forenames',
    'Surnames',
    'Name (Free Format)',
    'Category',
    'Club',
    'Country',
    'CourseClass',
    'StartTime',
    'StartTimePreference',
    'EnvelopeNumber',
    'NonCompetitive',
    'Seeded',
    'NotUsed',
    'Handicap',
    'RegistrationNotes',
    'EntrySystemIDs',
    'Eligibility',
    'SocialMedia',
    'GenderDOB',
    'NotUsed',
    'NotUsed',
    'NotUsed',
    'NotUsed'
  ]

  const lines = [headers.join(',')]

  for (const a of attendees) {
    const courseClass = [a.course, a.class_name]
      .filter(Boolean)
      .join(' ')

    const fullName = [a.first_name, a.last_name]
      .filter(Boolean)
      .join(' ')

    const row = [
      safe(''),                                         // BibNumber
      safe(1),                                          // NumberCompetitors
      safe(''),                                         // CardNumbers
      safe(''),                                         // MembershipNumbers
      safe(a.first_name),                               // Forenames
      safe(a.last_name),                                // Surnames
      safe(fullName),                                   // Name (Free Format)
      safe(''),                                         // Category
      safe(''),                                         // Club
      safe(''),                                         // Country
      safe(courseClass),                                // CourseClass
      safe(''),                                         // StartTime
      safe(''),                                         // StartTimePreference
      safe(''),                                         // EnvelopeNumber
      safe('N'),                                        // NonCompetitive
      safe(''),                                         // Seeded
      safe(''),                                         // NotUsed
      safe(''),                                         // Handicap
      safe(''),                                         // RegistrationNotes
      safe(''),                                         // EntrySystemIDs
      safe(''),                                         // Eligibility
      safe(''),                                         // SocialMedia
      safe(buildGenderDob(a.gender, a.date_of_birth)),  // GenderDOB
      safe(''),                                         // NotUsed
      safe(''),                                         // NotUsed
      safe(''),                                         // NotUsed
      safe('')                                          // NotUsed
    ]

    lines.push(row.join(','))
  }

  fs.writeFileSync(OUTPUT_FILE, lines.join('\n'))
  console.log(`CSV written: ${OUTPUT_FILE}`)
}

run().catch(err => {
  console.error('Export failed:', err)
  process.exit(1)
})