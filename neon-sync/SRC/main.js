import 'dotenv/config'
import axios from 'axios'
import { createClient } from '@supabase/supabase-js'

// ---- Supabase ----
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function mapRegistrations(rows) {
  return rows.map(r => ({
    neon_registration_id: r.registrationId,
    neon_account_id: r.accountId,
    neon_event_id: r.eventId,

    event_name: r.eventName || null,
    registration_date: r.registrationDate || null
  }))
}

async function upsertRegistrations(rows) {
  const { error } = await supabase
    .from('event_registrations')
    .upsert(rows, {
      onConflict: 'neon_registration_id'
    })

  if (error) throw error
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

async function fetchEvents() {
  const res = await axios.get(
    'https://api.neoncrm.com/v2/events',
    {
      auth: {
        username: process.env.NEON_ORG_ID,
        password: process.env.NEON_API_KEY
      }
    }
  )

  return res.data.events || []
}


// ---- Fetech Neon Events ----
async function fetchRegistrations() {
  const events = await fetchEvents()
  let all = []

  for (const event of events) {
    const eventId = event.eventId

    console.log(`Fetching registrations for event ${eventId}`)

    const res = await axios.get(
      `https://api.neoncrm.com/v2/events/${eventId}/eventRegistrations`,
      {
        auth: {
          username: process.env.NEON_ORG_ID,
          password: process.env.NEON_API_KEY
        }
      }
    )

    const batch = res.data.eventRegistrations || []

    console.log(`Event ${eventId}: ${batch.length} registrations`)

    all.push(...batch)

    await sleep(200) // avoid rate limit
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

  console.log('Fetching registrations...')
  const registrations = await fetchRegistrations()

  console.log(`Got ${registrations.length} registrations`)

  let regRows = mapRegistrations(registrations)

  regRows = await attachMemberIds(regRows)

  await upsertRegistrations(regRows)

  console.log('Done.')
}

main().catch(err => {
  const status = err?.response?.status
  const data = err?.response?.data

  console.error('Request failed:', status || err.message)
  console.error('Response data:', data || null)

  process.exit(1)
})