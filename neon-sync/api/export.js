import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function safe(val) {
  if (val === null || val === undefined || val === '') return ''
  return String(val)
}

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

function buildCsv(rows) {
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

  for (const a of rows) {
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

  return lines.join('\n')
}

export default async function handler(req, res) {
  const token = req.headers['x-admin-token']

  if (token !== process.env.ADMIN_SECRET) {
    return res.status(401).send('Unauthorized')
  }

  const { eventId } = req.query

  if (!eventId) {
    return res.status(400).send('Missing eventId')
  }

  const { data, error } = await supabase
    .from('event_attendees')
    .select('*')
    .eq('neon_event_id', eventId)

  if (error) {
    console.error(error)
    return res.status(500).send('Query failed')
  }

  // Filter junk + sort
  const attendees = (data || [])
    .filter(a =>
      a.first_name &&
      a.last_name &&
      a.first_name.toLowerCase() !== 'test'
    )
    .sort((a, b) => a.last_name.localeCompare(b.last_name))

  const csv = buildCsv(attendees)

  res.setHeader('Content-Type', 'text/csv')
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=event_${eventId}.csv`
  )
  res.send(csv)
}