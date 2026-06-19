const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;

let elSearch, elSearchResults, elPersonHeader, elTable, elTbody;
let searchTimer = null;
let percentileChart = null;

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
    `?select=id,first_name,last_name,competitor_count` +
    `&competitor_count=gt.0` +
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
        const meta = `Events: ${p.competitor_count}`;
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
      // 1. Person
      const personRes = await fetchWithAuth(
        `${SUPABASE_URL}/rest/v1/person?id=eq.${personId}&select=id,first_name,last_name`
      );
      const personArr = await personRes.json();
      if (!Array.isArray(personArr) || !personArr.length) {
        elPersonHeader.innerHTML = '<em>Person not found.</em>';
        return;
      }
      const person = personArr[0];
      const name = `${person.first_name || ''} ${person.last_name || ''}`.trim() || 'Unknown';
      elPersonHeader.innerHTML = `<h3 style="margin-bottom:12px;">${name}</h3>`;
  
      // 2. Competitor IDs for this person
      const compRes = await fetchWithAuth(
        `${SUPABASE_URL}/rest/v1/competitor?person_id=eq.${personId}&select=id`
      );
      const competitors = await compRes.json();
      const competitorIds = (competitors || []).map(c => c.id);
  
      if (!competitorIds.length) {
        elPersonHeader.innerHTML += '<p><em>No event results found.</em></p>';
        return;
      }
  
      // 3. Pull from standings view — has everything pre-joined
      const competitorFilter = competitorIds.map(id => `"${id}"`).join(',');
      const standingsRes = await fetchWithAuth(
        `${SUPABASE_URL}/rest/v1/standings` +
        `?competitor_id=in.(${competitorFilter})` +
        `&select=entry_id,event_id,event_date,course_name,class_name,total_time_ms,is_dnf,position,percentile` +
        `&order=event_date.desc`
      );
      const rows = await standingsRes.json();
  
      if (!Array.isArray(rows) || !rows.length) {
        elPersonHeader.innerHTML += '<p><em>No event results found.</em></p>';
        return;
      }
  
      // 4. We need event name too — fetch it separately
      const uniqueEventIds = [...new Set(rows.map(r => r.event_id))];
      const eventFilter = uniqueEventIds.map(id => `"${id}"`).join(',');
      const eventRes = await fetchWithAuth(
        `${SUPABASE_URL}/rest/v1/event?id=in.(${eventFilter})&select=id,name`
      );
      const events = await eventRes.json();
      const eventNameById = Object.fromEntries((events || []).map(e => [e.id, e.name]));
  
      // 5. Update header to match columns we have
      const thead = elTable.querySelector('thead');
      thead.innerHTML = `
        <tr>
          <th>Date</th>
          <th>Event</th>
          <th>Course</th>
          <th>Class</th>
          <th>Total Time</th>
          <th>Place</th>
          <th>Percentile</th>
        </tr>`;
  
    renderPercentileChart(rows);

      // 6. Render rows
      rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML =
          `<td>${r.event_date || ''}</td>` +
          `<td>${eventNameById[r.event_id] || ''}</td>` +
          `<td>${r.course_name || ''}</td>` +
          `<td>${r.class_name || ''}</td>` +
          `<td>${r.is_dnf ? 'DNF' : formatTime(r.total_time_ms)}</td>` +
          `<td>${r.is_dnf ? '—' : (r.position || '')}</td>` +
          `<td>${r.is_dnf || r.percentile == null ? '—' : (r.percentile * 100).toFixed(0) + '%'}</td>`;
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

function renderPercentileChart(rows) {
    const wrap = document.getElementById('percentileChartWrap');
    const canvas = document.getElementById('percentileChart');
  
    // Destroy any chart from a previous person.
    if (percentileChart) {
      percentileChart.destroy();
      percentileChart = null;
    }
  
    // Filter out DNFs and rows missing percentile, and sort ASC by date for the chart.
    const points = (rows || [])
      .filter(r => !r.is_dnf && r.percentile != null && r.event_date)
      .map(r => ({
        date: r.event_date,
        pct: Number(r.percentile) * 100, // stored as 0-1
        event_id: r.event_id,
        course_name: r.course_name,
        class_name: r.class_name,
        position: r.position,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  
    if (!points.length) {
      wrap.style.display = 'none';
      return;
    }
  
    wrap.style.display = '';
  
    percentileChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: points.map(p => p.date),
        datasets: [{
          label: 'Top % finish',
          data: points.map(p => p.pct),
          tension: 0.25,
          pointRadius: 5,
          pointHoverRadius: 7,
        }],
      },
      options: {
        responsive: true,
        scales: {
          y: {
            min: 0,
            max: 100,
            title: { display: true, text: 'Top % finish (higher is better)' },
          },
          x: {
            title: { display: true, text: 'Event date' },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const p = points[ctx.dataIndex];
                const cls = p.class_name ? ` — ${p.class_name}` : '';
                const pos = p.position ? ` (P${p.position})` : '';
                return `${p.pct.toFixed(0)}%${cls}${pos}`;
              },
            },
          },
        },
      },
    });
  }