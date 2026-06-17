import 'dotenv/config'
import axios from 'axios'
import { createClient } from '@supabase/supabase-js'

// ---- Supabase ----
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function mapAttendees(rows) {
  return rows.map(a => ({
    neon_attendee_id: String(a.attendeeId),

    neon_account_id: a.accountId || null,
    neon_registrant_account_id: a.registrantAccountId || null,
    neon_registration_id: a.registrationId || null,
    neon_event_id: a._eventId || null,

    event_name: a.eventName || a._eventName || null,

    first_name: clean(a.firstName) || null,
    last_name: clean(a.lastName) || null,

    // ✅ fixed DOB handling
    date_of_birth: formatDob(a.dob),

    // custom fields (unchanged)
    course: getCustomFieldValue(a.attendeeCustomFields, 'Course'),
    class_name: getCustomFieldValue(a.attendeeCustomFields, 'Class'),

    registration_status: a.registrationStatus || null,
    registration_date: a.registrationDate || null,
    marked_attended: a.markedAttended ?? null,

    updated_at: new Date().toISOString()
  }))
}
``

async function upsertRegistrations(rows) {
  const { error } = await supabase
    .from('event_registrations')
    .upsert(rows, {
      onConflict: 'neon_registration_id'
    })

  if (error) throw error
}

function formatDob(dob) {
  if (!dob || !dob.year || !dob.month || !dob.day) return null

  const year = dob.year.padStart(4, '0')
  const month = dob.month.padStart(2, '0')
  const day = dob.day.padStart(2, '0')

  return `${year}-${month}-${day}`  // ISO format
}

function getCustomFieldValue(customFields, fieldName) {
  const field = (customFields || []).find(f => f.name === fieldName)
  if (!field) return null

  if (field.optionValues && field.optionValues.length > 0) {
    return field.optionValues[0].name || null
  }

  return field.value || null
}

async function attachMemberIdsToAttendees(attendees) {
  const accountIds = [...new Set(
    attendees
      .map(a => a.neon_account_id)
      .filter(Boolean)
  )]

  if (accountIds.length === 0) {
    return attendees.map(a => ({ ...a, member_id: null }))
  }

  const { data: members, error } = await supabase
    .from('members')
    .select('id, neon_account_id')
    .in('neon_account_id', accountIds)

  if (error) throw error

  const memberMap = Object.fromEntries(
    (members || []).map(m => [m.neon_account_id, m.id])
  )

  return attendees.map(a => ({
    ...a,
    member_id: memberMap[a.neon_account_id] || null
  }))
}

async function attachMemberIds(registrations) {
  const accountIds = registrations.map(r => r.neon_account_id)

  const { data: members } = await supabase
    .from('members')
    .select('id, neon_account_id')
    .in('neon_account_id', accountIds)

  const map = Object.fromEntries(
    members.map(m => [m.neon_account_id, m.id])
  )

  return registrations.map(r => ({
    ...r,
    member_id: map[r.neon_account_id] || null
  }))
}

function getEventId(event) {
  return event.id ?? event.eventId ?? event['Event ID'] ?? null
}

function getEventName(event) {
  return event.name ?? event.eventName ?? event.title ?? null
}

async function fetchEvents() {
  const res = await axios.get('https://api.neoncrm.com/v2/events', {
    auth: {
      username: process.env.NEON_ORG_ID,
      password: process.env.NEON_API_KEY
    },
    headers: {
      Accept: 'application/json'
    }
  })

  const events = res.data.events || []

  console.log(`Fetched ${events.length} events`)
  console.log('Sample event object:', JSON.stringify(events[0], null, 2))

  return events
}



// ---- Fetech Neon Events ----
async function fetchAttendees() {
  const events = await fetchEvents()
  let all = []

  for (const event of events) {
    const eventId = getEventId(event)
    const eventName = getEventName(event)

    if (!eventId) {
      console.log('Skipping event with no usable id')
      continue
    }

    console.log(`Fetching attendees for event ${eventId}`)

    const res = await axios.get(
      `https://api.neoncrm.com/v2/events/${eventId}/attendees`,
      {
        auth: {
          username: process.env.NEON_ORG_ID,
          password: process.env.NEON_API_KEY
        },
        headers: {
          Accept: 'application/json'
        }
      }
    )

    const batch =
      res.data.eventAttendees ||
      res.data.attendees ||
      []

    console.log(`Event ${eventId}: ${batch.length} attendees`)

    all.push(
      ...batch.map(a => ({
        ...a,
        _eventName: eventName,
        _eventId: eventId
      }))
    )

    await sleep(200)
  }

  return all
}

// ---- Neon fetch ----
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchPage(page) {
  const res = await axios.get('https://api.neoncrm.com/v2/accounts', {
    auth: {
      username: process.env.NEON_ORG_ID,
      password: process.env.NEON_API_KEY
    },
    headers: {
      Accept: 'application/json'
    },
    params: new URLSearchParams({
      userType: 'INDIVIDUAL',
      'page.currentPage': page,
      'page.pageSize': 200
    })
  })

  return res.data.accounts || []
}

async function fetchMembers() {
  let all = []
  let page = 0
  let prevFirstId = null

  while (true) {
    const res = await axios.post(
      'https://api.neoncrm.com/v2/accounts/search',
      {
        searchFields: [
          {
            field: 'Account ID',
            operator: 'NOT_BLANK'
          }
        ],
        outputFields: [
          'Account ID',
          'First Name',
          'Last Name',
          'Email 1'
        ],
        pagination: {
          currentPage: page,
          pageSize: 200
        }
      },
      {
        auth: {
          username: process.env.NEON_ORG_ID,
          password: process.env.NEON_API_KEY
        },
        headers: {
          Accept: 'application/json'
        }
      }
    )

    const batch = res.data.searchResults || res.data.results || []
    const firstId = batch[0]?.['Account ID']

    console.log(`Page ${page}: ${batch.length}, firstId=${firstId}`)

    if (firstId === prevFirstId) {
      console.log('Duplicate page detected — stopping')
      break
    }

    prevFirstId = firstId
    all.push(...batch)

    if (batch.length < 200) break

    page++
    await sleep(300)
  }

  return all
}



// ---- Transform ----
function mapMembers(accounts) {
  return accounts.map(a => ({
    neon_account_id: a['Account ID'] || null,
    first_name: clean(a['First Name']) || null,
    last_name: clean(a['Last Name']) || null,
    email: a['Email 1'] || null,
    updated_at: new Date().toISOString()
  }))
}

// ---- Insert ----
async function upsertMembers(rows) {
  const { error } = await supabase
    .from('members')
    .upsert(rows, {
      onConflict: 'neon_account_id'
    })

  if (error) {
    console.error(error)
    throw error
  }
}

async function upsertAttendees(rows) {
  const { error } = await supabase
    .from('event_attendees')
    .upsert(rows, {
      onConflict: 'neon_attendee_id'
    })

  if (error) {
    console.error('Supabase attendee upsert error:', error)
    throw error
  }
}
``

// ---- Sanitize Inputs ----
function clean(str) {
  return typeof str === 'string'
    ? str.replace(/[<>]/g, '')   // basic strip
    : str
}

// ---- Run ----
async function main() {
  console.log('Fetching members...')
  const members = await fetchMembers()

  console.log(`Got ${members.length} members`)

  const memberRows = mapMembers(members)
  await upsertMembers(memberRows)

  console.log('Fetching registration payloads...')

  const attendees = await fetchAttendees()

  console.log(`Got ${attendees.length} attendees`)

  let attendeeRows = mapAttendees(attendees)


  console.log(`Flattened ${attendeeRows.length} attendees`)

  attendeeRows = await attachMemberIdsToAttendees(attendeeRows)

  console.log('Writing attendees to Supabase...')
  await upsertAttendees(attendeeRows)

  console.log('Done.')
}

main().catch(err => {
  const status = err?.response?.status
  const data = err?.response?.data

  console.error('Request failed:', status || err.message)
  console.error('Response data:', data || null)

  process.exit(1)
})