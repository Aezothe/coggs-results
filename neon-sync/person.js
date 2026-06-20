import { formatTime, escapeHtml } from '../lib/format.js';
const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;

let elSearch, elSearchResults, elPersonHeader, elTable, elTbody;
let searchTimer = null;
let percentileChart = null;

// ============================================================
//  COLUMN CONFIG — edit this to change what shows in the table
// ============================================================
// Each column has:
//   key      - matches the field on the standings row (and used in `select=`)
//   label    - column header text
//   render   - (row) => string/HTML for the cell (DNF handling, formatting, etc.)
//   align    - 'left' (default) or 'right'
//   extraFields - any extra DB fields this column reads from (besides `key`)
// To add a column: add an entry. To remove: delete it. That's it.
const COLUMNS = [
  {
    key: 'event_date',
    label: 'Date',
    render: r => r.event_date || '',
  },
  {
    key: 'event_id',                 // we use this to look up the name
    label: 'Event',
    extraFields: [],                 // event name comes from a separate fetch
    render: (r, ctx) => ctx.eventNameById[r.event_id] || '',
  },
  {
    key: 'course_name',
    label: 'Course',
    render: r => r.course_name || '',
  },
  {
    key: 'class_name',
    label: 'Class',
    render: r => r.class_name || '',
  },
  {
    key: 'total_time_ms',
    label: 'Total Time',
    extraFields: ['is_dnf'],
    render: r => r.is_dnf ? 'DNF' : formatTime(r.total_time_ms),
  },
  {
    key: 'position',
    label: 'Place',
    extraFields: ['is_dnf'],
    render: r => r.is_dnf ? '—' : (r.position || ''),
  },
  {
    key: 'percentile',
    label: 'Percentile',
    extraFields: ['is_dnf'],
    render: r => (r.is_dnf || r.percentile == null)
      ? '—'
      : (r.percentile * 100).toFixed(0) + '%',
  },
];

// Fields the standings fetch needs to ask for. Always include entry_id as a key.
function buildSelectClause() {
  const fields = new Set(['entry_id']);
  for (const col of COLUMNS) {
    if (col.key) fields.add(col.key);
    for (const f of (col.extraFields || [])) fields.add(f);
  }
  return [...fields].join(',');
}

async function fetchWithAuth(url) {
  return fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
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

  const params = new URLSearchParams(window.location.search);
  const initialPersonId = params.get('person');
  if (initialPersonId) loadPersonResults(initialPersonId);
});

// ---------- Search ----------
async function searchPersons(q) {
  q = (q || '').trim();
  if (q.length < 2) { elSearchResults.innerHTML = ''; return; }
  const pattern = `*${q}*`;

  const url = `${SUPABASE_URL}/rest/v1/person_summary`
    + `?select=id,first_name,last_name,competitor_count,event_count`
    + `&competitor_count=gt.0`
    + `&or=(first_name.ilike.${encodeURIComponent(pattern)},`
    + `last_name.ilike.${encodeURIComponent(pattern)})`
    + `&limit=30`;

  try {
    const res = await fetchWithAuth(url);
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) {
      elSearchResults.innerHTML = 'No matches.';
      return;
    }
    elSearchResults.innerHTML = '';
    data.forEach(p => {
      const btn = document.createElement('button');
      btn.style.cssText = 'display:block; margin:4px 0; padding:6px 10px; text-align:left; width:100%; max-width:500px; cursor:pointer;';
      const name = `${p.first_name || ''} ${p.last_name || ''}`.trim();
      const meta = `Events: ${p.event_count ?? '?'}`;
      btn.innerHTML = `<b>${name}</b> <span style="color:#666">${meta}</span>`;
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
    const person = await fetchPerson(personId);
    if (!person) { elPersonHeader.innerHTML = 'Person not found.'; return; }
    const name = `${person.first_name || ''} ${person.last_name || ''}`.trim() || 'Unknown';
    elPersonHeader.innerHTML = `<h2>${name}</h2>`;

    const competitorIds = await fetchCompetitorIds(personId);
    if (!competitorIds.length) {
      elPersonHeader.innerHTML += '<p>No event results found.</p>';
      return;
    }

    const rows = await fetchStandings(competitorIds);
    if (!rows.length) {
      elPersonHeader.innerHTML += '<p>No event results found.</p>';
      return;
    }

    const eventNameById = await fetchEventNames(rows);
    const ctx = { eventNameById };

    renderHeader();
    renderRows(rows, ctx);
    renderPercentileChart(rows);

    elTable.style.display = '';
  } catch (err) {
    elPersonHeader.innerHTML = 'Error: ' + err.message;
  }
}

// ---------- Data fetchers (small & single-purpose) ----------
async function fetchPerson(personId) {
  const res = await fetchWithAuth(
    `${SUPABASE_URL}/rest/v1/person?id=eq.${personId}&select=id,first_name,last_name`
  );
  const arr = await res.json();
  return Array.isArray(arr) && arr.length ? arr[0] : null;
}

async function fetchCompetitorIds(personId) {
  const res = await fetchWithAuth(
    `${SUPABASE_URL}/rest/v1/competitor?person_id=eq.${personId}&select=id`
  );
  const arr = await res.json();
  return (arr || []).map(c => c.id);
}

async function fetchStandings(competitorIds) {
  const filter = competitorIds.map(id => `"${id}"`).join(',');
  const url = `${SUPABASE_URL}/rest/v1/standings`
    + `?competitor_id=in.(${filter})`
    + `&select=${buildSelectClause()}`
    + `&order=event_date.desc`;
  const res = await fetchWithAuth(url);
  const arr = await res.json();
  return Array.isArray(arr) ? arr : [];
}

async function fetchEventNames(rows) {
  const ids = [...new Set(rows.map(r => r.event_id).filter(Boolean))];
  if (!ids.length) return {};
  const filter = ids.map(id => `"${id}"`).join(',');
  const res = await fetchWithAuth(
    `${SUPABASE_URL}/rest/v1/event?id=in.(${filter})&select=id,name`
  );
  const events = await res.json();
  return Object.fromEntries((events || []).map(e => [e.id, e.name]));
}

// ---------- Render ----------
function renderHeader() {
  const thead = elTable.querySelector('thead');
  thead.innerHTML = '<tr>' + COLUMNS.map(c => {
    const align = c.align === 'right' ? ' style="text-align:right"' : '';
    return `<th${align}>${escapeHtml(c.label)}</th>`;
  }).join('') + '</tr>';
}

function renderRows(rows, ctx) {
  elTbody.innerHTML = '';
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = COLUMNS.map(c => {
      const align = c.align === 'right' ? ' style="text-align:right"' : '';
      const value = c.render(r, ctx);
      return `<td${align}>${value ?? ''}</td>`;
    }).join('');
    elTbody.appendChild(tr);
  }
}

// ---------- Chart (unchanged) ----------
function renderPercentileChart(rows) {
  if (percentileChart) { percentileChart.destroy(); percentileChart = null; }

  let wrap = document.getElementById('percentileChartWrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'percentileChartWrap';
    wrap.style.maxWidth = '800px';
    wrap.style.margin = '16px 0';
    wrap.innerHTML = `
      <h3 style="margin-bottom:4px;">Finish percentile over time</h3>
      <canvas id="percentileChart" height="120"></canvas>
      <p style="font-size:0.85em; color:#666; margin-top:4px;">
        Higher is better. 100% = won the class. DNF events are not plotted.
      </p>`;
    const tableWrap = document.querySelector('.table-wrap');
    if (tableWrap && tableWrap.parentNode) tableWrap.parentNode.insertBefore(wrap, tableWrap);
    else document.body.appendChild(wrap);
  }

  const canvas = document.getElementById('percentileChart');
  if (!canvas) return;

  const points = (rows || [])
    .filter(r => !r.is_dnf && r.percentile != null && r.event_date)
    .map(r => ({
      date: r.event_date,
      pct: Number(r.percentile) * 100,
      class_name: r.class_name,
      position: r.position,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!points.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';

  if (typeof Chart === 'undefined') {
    console.warn('Chart.js not loaded — skipping percentile chart.');
    return;
  }

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
        y: { min: 0, max: 100, title: { display: true, text: 'Top % finish (higher is better)' } },
        x: { title: { display: true, text: 'Event date' } },
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