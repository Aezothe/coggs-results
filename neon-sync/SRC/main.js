import 'dotenv/config'
import axios from 'axios'
import { createClient } from '@supabase/supabase-js'

// ---- Supabase ----
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

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
  console.log('Fetching from Neon...')
  const accounts = await fetchMembers()

  const rows = mapMembers(accounts)

  console.log(`Got ${accounts.length} accounts`)

  console.log('Writing to Supabase...')
  await upsertMembers(rows)

  console.log('Done.')
}

main().catch(err => {
  const status = err?.response?.status
  const data = err?.response?.data

  console.error('Request failed:', status || err.message)
  console.error('Response data:', data || null)

  process.exit(1)
})