import 'dotenv/config'
import axios from 'axios'
import { createClient } from '@supabase/supabase-js'

// ---- Supabase ----
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ---- Neon fetch ----
async function fetchMembers() {
  const res = await axios.get('https://api.neoncrm.com/v2/accounts', {
    auth: {
      username: process.env.NEON_ORG_ID,
      password: process.env.NEON_API_KEY
    },
    headers: {
      Accept: 'application/json'
    },
    params: {
      userType: 'INDIVIDUAL'
    }
  })

  return res.data.accounts
}

// ---- Transform ----
function mapMembers(accounts) {
  return accounts.map(a => ({
    neon_account_id: a.accountId,   // <-- important
    first_name: a.firstName || null,
    last_name: a.lastName || null,
    email: a.email || null
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

// ---- Run ----
async function main() {
  console.log('Fetching from Neon...')
  const accounts = await fetchMembers()

  console.log(`Got ${accounts.length} accounts`)

  // 👇 DEBUG THIS ON FIRST RUN
  console.log(JSON.stringify(accounts[0], null, 2))

  const rows = mapMembers(accounts)

  console.log('Writing to Supabase...')
  await upsertMembers(rows)

  console.log('Done.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
``