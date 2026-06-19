const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;

let elSearch, elSearchResults, elPersonHeader, elTable, elTbody;
let searchTimer = null;

async function fetchWithAuth(url) {
  return fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  elSearch = document.getElementById('personSearch');
  elSearchResults = document.getElementById('searchResults');
  elPersonHeader = document.getElementById('personHeader');
  elTable = document.getElementById('resultsTable');
  elTbody = elTable.querySelector('tbody');

  elSearch.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const q = e.target.value;
    searchTimer = setTimeout(() => searchPersons(q), 250);
  });

  // Allow deep-linking via ?person=<uuid>
  const params = new URLSearchParams(window.location.search);
  const initialPersonId = params.get('person');
  if (initialPersonId) loadPersonResults(initialPersonId);
});

// ---------- Search ----------
async function searchPersons(q) {
    q = (q || '').trim();
    if (q.length < 2) {
      elSearchResults.innerHTML = '';
      return;
    }
    const pattern = `*${q}*`;
    // Search person_summary so we get counts in one query
    const url =
      `${SUPABASE_URL}/rest/v1/person_summary` +
      `?select=id,first_name,last_name,member_count,attendee_count,competitor_count` +
      `&or=(first_name.ilike.${encodeURIComponent(pattern)},` +
      `last_name.ilike.${encodeURIComponent(pattern)})` +
      `&limit=30`;
  
    try {
      const res = await fetchWithAuth(url);
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) {
        elSearchResults.innerHTML = '<em>No matches.</em>';
        return;
      }
      elSearchResults.innerHTML = '';
      data.forEach(p => {
        const btn = document.createElement('button');
        btn.style.cssText = 'display:block; margin:4px 0; padding:6px 10px; text-align:left; width:100%; max-width:500px; cursor:pointer;';
        const name = `${p.first_name || ''} ${p.last_name || ''}`.trim();
        const meta = `member:${p.member_count} · attended:${p.attendee_count} · raced:${p.competitor_count}`;
        btn.innerHTML = `<strong>${name}</strong> <span style="color:#666; font-size:12px;">${meta}</span>`;
        btn.onclick = () => {
          const u = new URL(window.location);
          u.searchParams.set('person', p.id);
          window.history.replaceState({}, '', u);
          loadPersonResults(p.id);
        };
        elSearchResults.appendChild(btn);
      });
    } catch (err) {
      elSearchResults.innerHTML = 'Error: ' + err.message;
    }
  }

// ---------- Load results for one person ----------
async function loadPersonResults(personId) {
  elPersonHeader.innerHTML = 'Loading...';
  elTable.style.display = 'none';
  elTbody.innerHTML = '';

  try {
    // 1. Person record
    const personRes = await fetchWithAuth(
      `${SUPABASE_URL}/rest/v1/person?id=eq.${personId}&select=id,first_name,last_name,email,display_name`
    );
    const personArr = await personRes.json();
    if (!Array.isArray(personArr) || !personArr.length) {
      elPersonHeader.innerHTML = '<em>Person not found.</em>';
      return;
    }
    const person = personArr[0];

    // 2. All competitor IDs for this person
    const compRes = await fetchWithAuth(
      `${SUPABASE_URL}/rest/v1/competitor?person_id=eq.${personId}&select=id`
    );
    const competitors = await compRes.json();
    const competitorIds = (competitors || []).map(c => c.id);

    // Header
    const name = person.display_name ||
      `${person.first_name || ''} ${person.last_name || ''}`.trim();
    elPersonHeader.innerHTML =
      `<h3 style="margin-bottom:4px;">${name}</h3>` +
      (person.email ? `<div style="color:#666; margin-bottom:12px;">${name}</div>` : '');

    if (!competitorIds.length) {
      elPersonHeader.innerHTML += '<p><em>No event results found.</em></p>';
      return;
    }

    // 3. Pull entries for those competitors, with event + total time + DNF
    //    Use entry table joined to event via PostgREST embed.
    const competitorFilter = competitorIds.map(id => `"${id}"`).join(',');
    const entryRes = await fetchWithAuth(
      `${SUPABASE_URL}/rest/v1/entry` +
      `?competitor_id=in.(${competitorFilter})` +
      `&select=id,competitor_id,event_id,course_name,class_name,total_time_ms,is_dnf,event:event_id(id,name,event_date)`
    );
    const entries = await entryRes.json();

    if (!Array.isArray(entries) || !entries.length) {
      elPersonHeader.innerHTML += '<p><em>No event results found.</em></p>';
      return;
    }

    // 4. For each entry, fetch their place from the results view (in cohort)
    //    We compute place client-side by pulling all entries in the same
    //    event/course/class and sorting.
    const eventGroups = {};
    for (const e of entries) {
      const key = `${e.event_id}||${e.course_name || ''}||${e.class_name || ''}`;
      (eventGroups[key] ||= []).push(e);
    }

    const placeMap = {}; // entry_id -> place
    await Promise.all(Object.keys(eventGroups).map(async (key) => {
      const [eventId, course, klass] = key.split('||');
      let url = `${SUPABASE_URL}/rest/v1/entry?event_id=eq.${eventId}&select=id,total_time_ms,is_dnf`;
      if (course) url += `&course_name=eq.${encodeURIComponent(course)}`;
      if (klass)  url += `&class_name=eq.${encodeURIComponent(klass)}`;
      const r = await fetchWithAuth(url);
      const cohort = await r.json();
      if (!Array.isArray(cohort)) return;
      const sorted = cohort
        .filter(x => !x.is_dnf && x.total_time_ms != null)
        .sort((a, b) => a.total_time_ms - b.total_time_ms);
      sorted.forEach((row, i) => { placeMap[row.id] = i + 1; });
    }));

    // 5. Render rows sorted by event_date desc
    const rendered = entries
      .filter(e => e.event)
      .sort((a, b) => (b.event?.event_date || '').localeCompare(a.event?.event_date || ''));

    rendered.forEach(e => {
      const tr = document.createElement('tr');
      const place = placeMap[e.id] || '';
      tr.innerHTML =
        `<td>${e.event?.event_date || ''}</td>` +
        `<td>${e.event?.name || ''}</td>` +
        `<td>${e.course_name || ''}</td>` +
        `<td>${e.class_name || ''}</td>` +
        `<td>${e.is_dnf ? 'DNF' : formatTime(e.total_time_ms)}</td>` +
        `<td>${place}</td>`;
      elTbody.appendChild(tr);
    });

    elTable.style.display = '';
  } catch (err) {
    elPersonHeader.innerHTML = 'Error: ' + err.message;
  }
}

// ---------- Format ----------
function formatTime(ms) {
  if (ms == null) return '';
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2);
  return `${m}:${sec.padStart(5, '0')}`;
}