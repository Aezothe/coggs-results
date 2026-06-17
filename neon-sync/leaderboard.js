const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;

// ---------- State ----------
const AppState = {
    leaderboard: [],
    stages: [],
    stageTimes: {},   // entry_id → { stageName: bestMs }
    sectorTimes: {},  // entry_id → { stageName: { sectorName: bestMs } }
    stagePlace: {},
    sectorPlace: {},
    showStages: true,
    showSectors: true,
    currentEventId: null,
  };

// DOM refs
let elToggleStages, elToggleSectors, elCourseFilter, elClassFilter, elEventSelect, elTable;

// ---------- Fetch helpers ----------
async function fetchWithAuth(url) {
  return fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
}

// PostgREST pagination via limit/offset query params
async function fetchAllPaged(urlBase, pageSize = 1000) {
  const all = [];
  let offset = 0;

  while (true) {
    const url = `${urlBase}${urlBase.includes('?') ? '&' : '?'}limit=${pageSize}&offset=${offset}`;
    const res = await fetchWithAuth(url);
    const json = await res.json();

    if (!Array.isArray(json)) {
      console.error('API error for', url, json);
      throw new Error('API returned non-array JSON');
    }

    all.push(...json);

    if (json.length < pageSize) break;
    offset += pageSize;
  }

  return all;
}

function setVisibility(stagesVisible, sectorsVisible) {
    if (sectorsVisible && !stagesVisible) stagesVisible = true;
    if (!stagesVisible) sectorsVisible = false;
  
    AppState.showStages = stagesVisible;
    AppState.showSectors = sectorsVisible;
  
    elToggleStages.innerText = stagesVisible ? 'Hide Stages' : 'Show Stages';
    elToggleSectors.innerText = sectorsVisible ? 'Hide Sectors' : 'Show Sectors';
  
    renderTable();
  }

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
    elToggleStages = document.getElementById('toggleStages');
    elToggleSectors = document.getElementById('toggleSectors');
    elCourseFilter = document.getElementById('courseFilter');
    elClassFilter = document.getElementById('classFilter');
    elEventSelect = document.getElementById('eventSelect');
    elTable = document.getElementById('leaderboard');
  
    if (!elToggleStages || !elToggleSectors) {
      console.error('Missing toggle buttons (toggleStages / toggleSectors)');
      return;
    }
    if (!elCourseFilter || !elClassFilter || !elTable) {
      console.error('Missing filters/table (courseFilter / classFilter / leaderboard)');
      return;
    }
    if (!elEventSelect) {
      console.error('Missing event selector (eventSelect)');
      return;
    }
  
    // ---- these two lines replace the old onclick blocks ----
    elToggleStages.onclick = () => {
        const next = !AppState.showStages;
        setVisibility(next, next ? AppState.showSectors : false);
      };
    elToggleSectors.onclick = () => setVisibility(AppState.showStages, !AppState.showSectors);
  
    elCourseFilter.onchange = renderTable;
    elClassFilter.onchange = renderTable;
  
    loadEvents().catch(console.error);
  });

// ---------- Event selector ----------
async function loadEvents() {
  const url = `${SUPABASE_URL}/rest/v1/event?select=id,name,event_date&order=event_date.desc`;
  const res = await fetchWithAuth(url);
  const events = await res.json();

  elEventSelect.innerHTML = '';
  events.forEach(e => {
    const label = `${e.event_date || ''} ${e.name || ''}`.trim();
    elEventSelect.add(new Option(label, e.id));
  });

  AppState.currentEventId = localStorage.getItem('event_id') || events[0]?.id || null;
  if (AppState.currentEventId) {
    elEventSelect.value = AppState.currentEventId;
    await loadAllForEvent(AppState.currentEventId);
  }

  elEventSelect.onchange = async () => {
    AppState.currentEventId = elEventSelect.value;
    localStorage.setItem('event_id', AppState.currentEventId);
    await loadAllForEvent(AppState.currentEventId);
  };
}

// ---------- Load everything for an event ----------
async function loadAllForEvent(eventId) {
  leaderboard = [];
  stages = [];
  AppState.stageTimes = {};
  AppState.sectorTimes = {};
  AppState.stagePlace = {};
  AppState.sectorPlace = {};

  const segmentsUrl =
    `${SUPABASE_URL}/rest/v1/segment` +
    `?event_id=eq.${eventId}&select=id,name,kind,parent_segment_id,ordinal`;

  // Pull ALL results rows for the event (long format)
  // IMPORTANT: include segment_kind, stage_name, split_name, time_ms for stage/sector mapping.
  const resultsUrlBase =
    `${SUPABASE_URL}/rest/v1/results` +
    `?event_id=eq.${eventId}` +
    `&select=entry_id,event_id,first_name,last_name,course_name,class_name,total_time_ms,is_dnf,segment_kind,stage_name,split_name,time_ms`;

  const [segRes] = await Promise.all([ fetchWithAuth(segmentsUrl) ]);
  const segmentRows = await segRes.json();
  buildStructure(segmentRows);

  const resultRows = await fetchAllPaged(resultsUrlBase, 1000);

  buildFromResultsRows(resultRows);

  buildPlacesByCohort();
  populateFilters();
  renderTable();
}

// ---------- Build stage/sector hierarchy ----------
function buildStructure(rows) {
  const stageRows = rows.filter(r => r.kind === 'stage');
  const splitRows = rows.filter(r => r.kind === 'split');

  stageRows.sort((a, b) => (a.ordinal ?? 999) - (b.ordinal ?? 999));

  const splitsByParent = {};
  for (const s of splitRows) {
    if (!s.parent_segment_id) continue;
    (splitsByParent[s.parent_segment_id] ||= []).push(s);
  }
  for (const parentId of Object.keys(splitsByParent)) {
    splitsByParent[parentId].sort((a, b) => (a.ordinal ?? 999) - (b.ordinal ?? 999));
  }

  AppState.stages = stageRows.map(st => ({
    id: st.id,
    name: st.name,
    sectors: (splitsByParent[st.id] || []).map(sec => ({
      name: sec.name,
      ordinal: sec.ordinal
    }))
  }));
}

// ---------- Build leaderboard + best times from results rows ----------
function buildFromResultsRows(rows) {
  const byEntry = new Map();

  AppState.stageTimes = {};
  AppState.sectorTimes = {};

  for (const r of rows) {
    const eid = r.entry_id;
    if (!eid) continue;

    // Dedup leaderboard rows by entry_id
    if (!byEntry.has(eid)) {
      byEntry.set(eid, {
        entry_id: r.entry_id,
        event_id: r.event_id,
        first_name: r.first_name,
        last_name: r.last_name,
        course_name: r.course_name,
        class_name: r.class_name,
        total_time_ms: r.total_time_ms,
        is_dnf: r.is_dnf
      });
    }

    // Best stage time
    if (r.segment_kind === 'stage' && r.stage_name && r.time_ms != null) {
      AppState.stageTimes[eid] ||= {};
      const cur = AppState.stageTimes[eid][r.stage_name];
      AppState.stageTimes[eid][r.stage_name] = (cur == null) ? r.time_ms : Math.min(cur, r.time_ms);
    }

    // Best sector time
    if (r.segment_kind === 'split' && r.stage_name && r.split_name && r.time_ms != null) {
      AppState.sectorTimes[eid] ||= {};
      AppState.sectorTimes[eid][r.stage_name] ||= {};
      const cur = AppState.sectorTimes[eid][r.stage_name][r.split_name];
      AppState.sectorTimes[eid][r.stage_name][r.split_name] = (cur == null) ? r.time_ms : Math.min(cur, r.time_ms);
    }
  }

  AppState.leaderboard = Array.from(byEntry.values());

  // Sort: finishers first, then total time
  AppState.leaderboard.sort((a, b) => {
    const ad = !!a.is_dnf;
    const bd = !!b.is_dnf;
    if (ad !== bd) return ad ? 1 : -1;
    const at = a.total_time_ms ?? Number.MAX_SAFE_INTEGER;
    const bt = b.total_time_ms ?? Number.MAX_SAFE_INTEGER;
    if (at !== bt) return at - bt;
    // stable tie-break
    const al = (a.last_name || '').localeCompare(b.last_name || '');
    if (al !== 0) return al;
    return (a.first_name || '').localeCompare(b.first_name || '');
  });
}

// ---------- Places ----------
function computePlaces(pairs) {
  const sorted = pairs
    .filter(p => p.time_ms != null)
    .sort((a, b) => a.time_ms - b.time_ms);

  const placeByEntry = {};
  let lastTime = null;
  let lastPlace = 0;

  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i].time_ms;
    if (lastTime === null || t !== lastTime) {
      lastPlace = i + 1;
      lastTime = t;
    }
    placeByEntry[sorted[i].entry_id] = lastPlace;
  }
  return placeByEntry;
}

function cohortKeyForRow(row) {
  const c = row.course_name || '';
  const k = row.class_name || '';
  return `${c}||${k}`;
}

function buildPlacesByCohort() {
  AppState.stagePlace = {};
  AppState.sectorPlace = {};

  const cohortEntries = {};
  for (const r of AppState.leaderboard) {
    const key = cohortKeyForRow(r);
    (cohortEntries[key] ||= []).push(r.entry_id);
  }

  for (const key of Object.keys(cohortEntries)) {
    AppState.stagePlace[key] = {};
    AppState.sectorPlace[key] = {};
    const entryIds = cohortEntries[key];

    for (const st of AppState.stages) {
      const stagePairs = entryIds.map(eid => ({
        entry_id: eid,
        time_ms: AppState.stageTimes[eid]?.[st.name] ?? null
      }));
      AppState.stagePlace[key][st.name] = computePlaces(stagePairs);

      AppState.sectorPlace[key][st.name] = {};
      for (const sec of st.sectors) {
        const secPairs = entryIds.map(eid => ({
          entry_id: eid,
          time_ms: AppState.sectorTimes[eid]?.[st.name]?.[sec.name] ?? null
        }));
        AppState.sectorPlace[key][st.name][sec.name] = computePlaces(secPairs);
      }
    }
  }
}

// ---------- Filters ----------
function populateFilters() {
  const courses = [...new Set(AppState.leaderboard.map(r => r.course_name).filter(Boolean))];
  const classes = [...new Set(AppState.leaderboard.map(r => r.class_name).filter(Boolean))];

  elCourseFilter.innerHTML = '<option value="">All</option>';
  elClassFilter.innerHTML = '<option value="">All</option>';

  courses.forEach(c => elCourseFilter.add(new Option(c, c)));
  classes.forEach(c => elClassFilter.add(new Option(c, c)));
}

// ---------- Render ----------
function renderTable() {
  let data = AppState.leaderboard;

  if (elCourseFilter.value) data = data.filter(r => r.course_name === elCourseFilter.value);
  if (elClassFilter.value) data = data.filter(r => r.class_name === elClassFilter.value);

  const thead = elTable.querySelector('thead');
  const tbody = elTable.querySelector('tbody');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  // Determine visible stages/sectors based on currently displayed rows
  const visibleStages = [];
  const visibleSectors = {};

  for (const st of AppState.stages) {
    let stageHasData = false;
    const sectorSet = new Set();

    for (const row of data) {
      const eid = row.entry_id;
      if (AppState.stageTimes[eid]?.[st.name] != null) stageHasData = true;

      const perStage = AppState.sectorTimes[eid]?.[st.name] || {};
      for (const sec of st.sectors) {
        if (perStage[sec.name] != null) sectorSet.add(sec.name);
      }
    }

    if (stageHasData) {
      visibleStages.push(st.name);
      visibleSectors[st.name] = st.sectors.map(s => s.name).filter(n => sectorSet.has(n));
    }
  }

  // Header rows
  const r1 = document.createElement('tr');
  const r2 = document.createElement('tr');

  ['Pos', 'Name', 'Course', 'Class', 'Total'].forEach(h => {
    const th = document.createElement('th');
    th.innerText = h;
    th.rowSpan = AppState.showStages ? 2 : 1;
    r1.appendChild(th);
  });

  if (AppState.showStages) {
    for (const stageName of visibleStages) {
      const sectors = AppState.showSectors ? (visibleSectors[stageName] || []) : [];
      const colSpan = 2 + (sectors.length * 2);

      const th = document.createElement('th');
      th.innerText = stageName;
      th.colSpan = colSpan;
      r1.appendChild(th);

      const thST = document.createElement('th');
      thST.innerText = 'Stage';
      r2.appendChild(thST);

      const thSP = document.createElement('th');
      thSP.innerText = 'Pl';
      r2.appendChild(thSP);

      if (AppState.showSectors) {
        for (const secName of sectors) {
          const thSecT = document.createElement('th');
          thSecT.innerText = secName;
          r2.appendChild(thSecT);

          const thSecP = document.createElement('th');
          thSecP.innerText = 'Pl';
          r2.appendChild(thSecP);
        }
      }
    }
  }

  thead.appendChild(r1);
  if (AppState.showStages) thead.appendChild(r2);

  // Rows
  data.forEach((row, i) => {
    const tr = document.createElement('tr');

    let html = `
      <td>${i + 1}</td>
      <td>${row.first_name} ${row.last_name}</td>
      <td>${row.course_name || ''}</td>
      <td>${row.class_name || ''}</td>
      <td>${row.is_dnf ? 'DNF' : formatTime(row.total_time_ms)}</td>
    `;

    if (AppState.showStages) {
      const cohortKey = cohortKeyForRow(row);
      const eid = row.entry_id;

      for (const stageName of visibleStages) {
        const stMs = AppState.stageTimes[eid]?.[stageName] ?? null;
        const stPl = AppState.stagePlace[cohortKey]?.[stageName]?.[eid] ?? '';

        html += `<td>${stMs == null ? '' : formatTime(stMs)}</td><td>${stPl}</td>`;

        if (AppState.showSectors) {
          for (const secName of (visibleSectors[stageName] || [])) {
            const secMs = AppState.sectorTimes[eid]?.[stageName]?.[secName] ?? null;
            const secPl = AppState.sectorPlace[cohortKey]?.[stageName]?.[secName]?.[eid] ?? '';
            html += `<td>${secMs == null ? '' : formatTime(secMs)}</td><td>${secPl}</td>`;
          }
        }
      }
    }

    tr.innerHTML = html;
    tbody.appendChild(tr);
  });
}

// ---------- Format ----------
function formatTime(ms) {
  if (ms == null) return '';
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2);
  return `${m}:${sec.padStart(5, '0')}`;
}