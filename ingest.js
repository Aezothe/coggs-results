import 'dotenv/config';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';

const FULL_REBUILD = true;

// Tune
const UPSERT_CHUNK_SIZE = 1000;
const SEGMENT_TIME_CHUNK_SIZE = 500;
const SEGMENT_TIME_FLUSH_AT = 20000;
const DELETE_CHUNK_SIZE = 200;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const COURSE_NAMES = process.env.COURSE_NAMES
  ? process.env.COURSE_NAMES.split(',').map(s => s.trim()).sort((a, b) => b.length - a.length)
  : null;

const EVENT_ID = process.env.EVENT_ID;
const FILE = process.env.RESULTS_FILE;
const RACE_TYPE = (process.env.RACE_TYPE || '').toLowerCase();

if (!EVENT_ID) throw new Error('EVENT_ID missing from .env');
if (!FILE) throw new Error('RESULTS_FILE missing from .env');
if (!['downhill', 'enduro'].includes(RACE_TYPE)) {
  throw new Error('RACE_TYPE must be "downhill" or "enduro" in .env');
}

// ---------- helpers ----------
function slug(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function parseTimeToMs(t) {
  if (t == null) return null;
  const str = String(t).trim();
  if (!str) return null;
  if (str.startsWith('+')) return null;

  if (/^[0-9]+(\.[0-9]+)?$/.test(str)) {
    const sec = Number(str);
    if (Number.isNaN(sec)) return null;
    return Math.round(sec * 1000);
  }

  const parts = str.split(':');
  if (parts.length === 2) {
    const m = Number(parts[0]);
    const s = Number(parts[1]);
    if (Number.isNaN(m) || Number.isNaN(s)) return null;
    return Math.round((m * 60 + s) * 1000);
  }
  if (parts.length === 3) {
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    const s = Number(parts[2]);
    if ([h, m, s].some(Number.isNaN)) return null;
    return Math.round((h * 3600 + m * 60 + s) * 1000);
  }

  return null;
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchAllPaged(query, pageSize = 1000) {
  let from = 0;
  const all = [];
  while (true) {
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

function classifyCell(rawValue) {
  const raw = (rawValue ?? '').toString().trim();
  if (!raw) return { shouldInsert: false, time_ms: null, status: 'missing' };

  const upper = raw.toUpperCase();
  if (upper.includes('DNF')) return { shouldInsert: true, time_ms: null, status: 'dnf' };
  if (upper.includes('DSQ')) return { shouldInsert: true, time_ms: null, status: 'dsq' };
  if (upper.includes('DNS')) return { shouldInsert: true, time_ms: null, status: 'dns' };

  const ms = parseTimeToMs(raw);
  if (ms == null) return { shouldInsert: true, time_ms: null, status: 'invalid' };

  return { shouldInsert: true, time_ms: ms, status: 'ok' };
}

const STATUS_PRIORITY = { ok: 4, dsq: 3, dnf: 3, dns: 3, invalid: 2, missing: 1 };

function betterSegmentTimeRow(a, b) {
  if (!a) return b;
  if (!b) return a;
  const pa = STATUS_PRIORITY[a.status || 'missing'] || 0;
  const pb = STATUS_PRIORITY[b.status || 'missing'] || 0;
  if (pb > pa) return b;
  if (pa > pb) return a;
  if (a.time_ms == null && b.time_ms != null) return b;
  if (b.time_ms == null && a.time_ms != null) return a;
  if (a.time_ms != null && b.time_ms != null) return b.time_ms < a.time_ms ? b : a;
  return a;
}

async function flushSegmentTimes(buffer) {
  if (!buffer.length) return;
  const dedup = new Map();
  for (const row of buffer) {
    const key = `${row.attempt_id}|${row.segment_id}`;
    dedup.set(key, betterSegmentTimeRow(dedup.get(key), row));
  }
  const rows = Array.from(dedup.values());
  console.log(`⬆️  Upserting segment_time rows: ${rows.length} (deduped from ${buffer.length})`);
  for (const batch of chunkArray(rows, SEGMENT_TIME_CHUNK_SIZE)) {
    const { error } = await supabase
      .from('segment_time')
      .upsert(batch, { onConflict: 'attempt_id,segment_id' });
    if (error) throw error;
  }
  buffer.length = 0;
}

async function fetchAllAttemptIdsForEvent(eventId) {
  const attempts = await fetchAllPaged(
    supabase.from('attempt').select('id').eq('event_id', eventId)
  );
  return attempts.map(a => a.id);
}

async function clearEventData(eventId) {
  console.log('🔁 Clearing event data before ingest...');
  {
    const segIds = await fetchAllPaged(
      supabase.from('segment').select('id').eq('event_id', eventId)
    );
    const ids = segIds.map(s => s.id);
    for (const batch of chunkArray(ids, DELETE_CHUNK_SIZE)) {
      const { error } = await supabase.from('course_segment').delete().in('segment_id', batch);
      if (error) throw error;
    }
  }
  const attemptIds = await fetchAllAttemptIdsForEvent(eventId);
  for (const batch of chunkArray(attemptIds, DELETE_CHUNK_SIZE)) {
    const { error } = await supabase.from('segment_time').delete().in('attempt_id', batch);
    if (error) throw error;
  }
  for (const tbl of ['attempt', 'entry_identity', 'entry', 'segment', 'course', 'class']) {
    const { error } = await supabase.from(tbl).delete().eq('event_id', eventId);
    if (error) throw error;
  }
  console.log('✅ Event cleared');
}

// ========== COLUMN DISCOVERY ==========

function discoverTimeColumns(headers, dataRows, ccIdx) {
  const penaltyRegex = /^Penalty (.+)$/;
  const stages = [];
  for (let i = 0; i < headers.length; i++) {
    const m = headers[i].match(penaltyRegex);
    if (m) stages.push({ name: m[1].trim(), colIdx: i });
  }
  console.log(`Penalty stages: ${stages.map(s => s.name).join(', ') || '(none)'}`);

  if (RACE_TYPE === 'enduro') return discoverEnduro(headers, stages);
  return discoverDownhill(headers, stages, dataRows, ccIdx);
}

function discoverEnduro(headers, stages) {
  
  const runRegex  = /^(.+?) Run ([0-9]+) Time$/;
  const secRegex  = /^(.+?) Sector ([0-9]+) Time$/;
  const bestRegex = /^(.+?) Best Time$/;
  const posRegex  = / Pos$/;

  const timeCols = [];
  let pending = [];   // sectors waiting to be assigned to a run
  let maxRun = 1;

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (posRegex.test(h) || h.startsWith('Penalty ')) continue;

    // Best Time → end-of-stage marker, discard leftover pending
    if (bestRegex.test(h)) { pending = []; continue; }

    // <Stage> Run N Time
    const rm = h.match(runRegex);
    if (rm) {
      const stageName = rm[1].trim();
      const runNo = Number(rm[2]);
      maxRun = Math.max(maxRun, runNo);

      // flush pending sectors for this stage → belong to this run
      for (const ps of pending) {
        if (ps.stageName === stageName) {
          timeCols.push({ colIdx: ps.colIdx, stageName, type: 'sector', runNo, sectorNo: ps.sectorNo });
        }
      }
      pending = [];
      timeCols.push({ colIdx: i, stageName, type: 'stage_run', runNo, sectorNo: null });
      continue;
    }

    // <Stage> Sector N Time
    const sm = h.match(secRegex);
    if (sm) {
      pending.push({ colIdx: i, stageName: sm[1].trim(), sectorNo: Number(sm[2]) });
      continue;
    }
  }

  // If no penalty columns, derive stage list from timeCols
  const finalStages = stages.length > 0
    ? stages
    : [...new Set(timeCols.map(tc => tc.stageName))].map(name => ({ name, colIdx: null }));

  console.log(`Enduro: ${finalStages.length} stages, ${timeCols.length} time cols, maxRun=${maxRun}`);
  return { stages: finalStages, timeCols, maxRun };
}

function discoverDownhill(headers, stages, dataRows, ccIdx) {
  // Find sector region: after TotalStageRuns/NotUsed, before Penalty columns
  const penaltyStart = headers.findIndex(h => h.startsWith('Penalty '));
  const endIdx = penaltyStart >= 0 ? penaltyStart : headers.length;

  let startIdx = headers.indexOf('TotalStageRuns');
  if (startIdx >= 0) startIdx++;
  else startIdx = 33;
  while (startIdx < endIdx && headers[startIdx] === 'NotUsed') startIdx++;

  // Find all <Name> Time columns in the sector region
  const timeRegex = /^(.+) Time$/;
  const candidates = [];
  for (let i = startIdx; i < endIdx; i++) {
    const m = headers[i].match(timeRegex);
    if (m) candidates.push({ colIdx: i, name: m[1].trim() });
  }

  if (!candidates.length) {
    console.log('Downhill: no sector columns found');
    return { stages, timeCols: [], maxRun: 1, sectorGroups: [] };
  }

  // Which courses have data in each column?
  function extractCourse(cc) {
    if (!cc) return null;
    if (COURSE_NAMES) {
      const match = COURSE_NAMES.find(cn => cc.startsWith(cn + ' ') || cc === cn);
      return match || null;
    }
    return cc.trim().split(/\s+/)[0] || null;
  }

  for (const c of candidates) {
    c.courses = new Set();
    for (const row of dataRows) {
      if (!(row[c.colIdx] || '').trim()) continue;
      const course = extractCourse((row[ccIdx] || '').trim());
      if (course) c.courses.add(course);
    }
  }

  // Group consecutive candidates by course-set signature
  const groups = [];
  let current = null;
  for (const c of candidates) {
    const sig = [...c.courses].sort().join('|') || '__empty__';
    if (!current || current.sig !== sig) {
      current = { sig, sectors: [] };
      groups.push(current);
    }
    current.sectors.push(c);
  }

  // Map groups → stages by penalty-column order
  const timeCols = [];
  const sectorGroups = [];

  for (let g = 0; g < groups.length && g < stages.length; g++) {
    const group = groups[g];
    const stageName = stages[g].name;
    const sGroup = [];

    for (let s = 0; s < group.sectors.length; s++) {
      const sec = group.sectors[s];
      const sectorNo = s + 1;
      sGroup.push({ colIdx: sec.colIdx, sectorNo });
      timeCols.push({
        colIdx: sec.colIdx,
        stageName,
        type: 'sector',
        runNo: 1,
        sectorNo,
        sectorName: sec.name
      });
    }
    sectorGroups.push(sGroup);
  }

  console.log(`Downhill: ${stages.length} stages, ${groups.length} sector groups, ${timeCols.length} sector cols`);
  return { stages, timeCols, maxRun: 1, sectorGroups };
}

// Downhill: auto-detect which stage each course rides
function buildCourseStageMap(dataRows, stages, sectorGroups, ccIdx) {
  const courseToStage = new Map();
  const allCourses = new Set();

  function extractCourse(cc) {
    if (!cc) return null;
    if (COURSE_NAMES) {
      const match = COURSE_NAMES.find(cn => cc.startsWith(cn + ' ') || cc === cn);
      return match || cc;
    }
    return cc.trim().split(/\s+/)[0] || null;
  }

  // Pass 1: courses with sector data → assign by group position
  for (const row of dataRows) {
    const cc = (row[ccIdx] || '').trim();
    const courseName = extractCourse(cc);
    if (!courseName) continue;
    allCourses.add(courseName);
    if (courseToStage.has(courseName)) continue;

    for (let g = 0; g < sectorGroups.length && g < stages.length; g++) {
      if (sectorGroups[g].some(sec => (row[sec.colIdx] || '').trim())) {
        courseToStage.set(courseName, stages[g].name);
        console.log(`📍 "${courseName}" → "${stages[g].name}" (sector data in group ${g})`);
        break;
      }
    }
  }

  // Pass 2: unmapped courses → assign to remaining stage(s)
  const assigned = new Set(courseToStage.values());
  const unassigned = stages.filter(s => !assigned.has(s.name));
  const unmapped = [...allCourses].filter(c => !courseToStage.has(c));

  if (unmapped.length > 0 && unassigned.length === 1) {
    for (const c of unmapped) {
      courseToStage.set(c, unassigned[0].name);
      console.log(`📍 "${c}" → "${unassigned[0].name}" (only remaining stage)`);
    }
  } else if (unmapped.length > 0) {
    // Fallback: COURSE_STAGE_MAP env var  e.g. "Cat 3:Candyland,Cat 4:Risky Business"
    const mapStr = process.env.COURSE_STAGE_MAP;
    if (mapStr) {
      for (const pair of mapStr.split(',')) {
        const [course, stage] = pair.split(':').map(s => s.trim());
        if (course && stage) courseToStage.set(course, stage);
      }
    }
    const still = [...allCourses].filter(c => !courseToStage.has(c));
    if (still.length) {
      throw new Error(
        `Cannot auto-map courses to stages.\n` +
        `  Unmapped: [${still.join(', ')}]\n` +
        `  Unassigned stages: [${unassigned.map(s => s.name).join(', ')}]\n` +
        `  Set COURSE_STAGE_MAP=Course1:Stage1,Course2:Stage2 in .env`
      );
    }
  }

  return courseToStage;
}

// ========== MAIN ==========
async function run() {
  console.time('ingest');

  if (FULL_REBUILD) await clearEventData(EVENT_ID);

  // Pre-fetch competitor identities
  const nameIds = await fetchAllPaged(
    supabase.from('competitor_identity').select('competitor_id,id_value').eq('id_type', 'name')
  );
  const competitorByName = new Map(nameIds.map(r => [r.id_value, r.competitor_id]));

  // ---- CSV (array mode to handle duplicate column names) ----
  const rawCsv = fs.readFileSync(FILE, 'utf8');
  const allRows = parse(rawCsv, {
    bom: true,
    delimiter: ',',
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true
  });

  const headers = allRows[0];
  const dataRows = allRows.slice(1);
  console.log('Parsed rows:', dataRows.length);
  if (!dataRows.length) return;

  if (headers.length < 5) {
    console.error('❌ CSV header too short. Check RESULTS_FILE / delimiter.');
    process.exit(1);
  }

  // Known column indices
  const COL = {};
  for (const name of ['BibNumber','CardNumbers','Name (Free Format)','CourseClass','RaceTime']) {
    COL[name] = headers.indexOf(name);
  }

  // ---- Discover columns ----
  const discovery = discoverTimeColumns(headers, dataRows, COL['CourseClass']);
  const { stages, timeCols, maxRun } = discovery;
  const sectorGroups = discovery.sectorGroups || [];

  if (!stages.length) {
    console.error('❌ No stages found (check Penalty columns in CSV).');
    process.exit(1);
  }
  console.log(`Stages: ${stages.map(s=>s.name).join(', ')}  |  timeCols: ${timeCols.length}  |  maxRun: ${maxRun}`);

  // ---- Upsert stage segments ----
  const stageSegRows = stages.map((s, i) => ({
    event_id: EVENT_ID,
    key: `stage:${slug(s.name)}`,
    name: s.name,
    kind: 'stage',
    parent_segment_id: null,
    ordinal: i + 1
  }));
  if (stageSegRows.length) {
    const { error } = await supabase.from('segment').upsert(stageSegRows, { onConflict: 'event_id,key' });
    if (error) throw error;
  }

  // Fetch stage IDs
  const stageSegs = await fetchAllPaged(
    supabase.from('segment').select('id,key').eq('event_id', EVENT_ID).eq('kind', 'stage')
  );
  const stageKeyToId = Object.fromEntries(stageSegs.map(s => [s.key, s.id]));

  // ---- Upsert sector segments (deduped from timeCols) ----
  const sectorDefsMap = new Map();
  for (const tc of timeCols) {
    if (tc.type !== 'sector') continue;
    const sectorName = tc.sectorName || `Sector ${tc.sectorNo}`;
    const key = `split:${slug(tc.stageName)}:${slug(sectorName)}`;
    if (!sectorDefsMap.has(key)) {
      sectorDefsMap.set(key, {
        key,
        name: sectorName,
        stageKey: `stage:${slug(tc.stageName)}`,
        ordinal: tc.sectorNo
      });
    }
  }

  const sectorSegRows = Array.from(sectorDefsMap.values())
    .map(s => ({
      event_id: EVENT_ID,
      key: s.key,
      name: s.name,
      kind: 'split',
      parent_segment_id: stageKeyToId[s.stageKey] || null,
      ordinal: s.ordinal
    }))
    .filter(r => r.parent_segment_id);

  if (sectorSegRows.length) {
    const { error } = await supabase.from('segment').upsert(sectorSegRows, { onConflict: 'event_id,key' });
    if (error) throw error;
  }

  // Fetch all segment IDs
  const segData = await fetchAllPaged(
    supabase.from('segment').select('id,key').eq('event_id', EVENT_ID)
  );
  const keyToSegId = Object.fromEntries(segData.map(s => [s.key, s.id]));

  // ---- Parse riders ----
  const parsedRiders = [];
  const courseNames = new Set();
  const classNames  = new Set();
  let skippedNoName = 0, skippedNoCard = 0;

  for (const row of dataRows) {
    const card = (row[COL['CardNumbers']] || '').trim();
    const name = (row[COL['Name (Free Format)']] || '').trim();
    if (!name) { skippedNoName++; continue; }
    if (!card) skippedNoCard++;

    const normName = normalizeName(name);
    const bib = (row[COL['BibNumber']] || '').trim() || null;

    const courseClassRaw = (row[COL['CourseClass']] || '').trim();
    let courseName = null, className = null;
    if (courseClassRaw) {
      if (COURSE_NAMES) {
        const match = COURSE_NAMES.find(cn =>
          courseClassRaw.startsWith(cn + ' ') || courseClassRaw === cn
        );
        if (match) {
          courseName = match;
          className = courseClassRaw.slice(match.length).trim() || null;
        } else {
          courseName = courseClassRaw;
        }
      } else {
        const parts = courseClassRaw.trim().split(/\s+/);
        courseName = parts[0] || null;
        className  = parts.slice(1).join(' ') || null;
      }
    }

    if (courseName) courseNames.add(courseName);
    if (className)  classNames.add(className);

    parsedRiders.push({ card, name, normName, bib, courseName, className, dataRow: row });
  }
  console.log({ skippedNoName, skippedNoCard, parsed: parsedRiders.length, totalRows: dataRows.length });

  // ---- Course→Stage map (downhill only) ----
  let courseStageMap = null;
  if (RACE_TYPE === 'downhill') {
    courseStageMap = buildCourseStageMap(dataRows, stages, sectorGroups, COL['CourseClass']);
    console.log('Course → Stage:', Object.fromEntries(courseStageMap));
  }

  // ---- Upsert courses / classes ----
  for (const batch of chunkArray(Array.from(courseNames).map(n => ({ event_id: EVENT_ID, name: n })), UPSERT_CHUNK_SIZE)) {
    const { error } = await supabase.from('course').upsert(batch, { onConflict: 'event_id,name' });
    if (error) throw error;
  }
  for (const batch of chunkArray(Array.from(classNames).map(n => ({ event_id: EVENT_ID, name: n })), UPSERT_CHUNK_SIZE)) {
    const { error } = await supabase.from('class').upsert(batch, { onConflict: 'event_id,name' });
    if (error) throw error;
  }

  const courses = await fetchAllPaged(supabase.from('course').select('id,name').eq('event_id', EVENT_ID));
  const classes = await fetchAllPaged(supabase.from('class').select('id,name').eq('event_id', EVENT_ID));
  const courseIdByName = Object.fromEntries(courses.map(r => [r.name, r.id]));
  const classIdByName  = Object.fromEntries(classes.map(r => [r.name, r.id]));

  // ---- Competitors ----
  const competitorIdByNormName = new Map();
  for (const p of parsedRiders) {
    if (competitorIdByNormName.has(p.normName)) continue;
    let competitor_id = competitorByName.get(p.normName);
    if (!competitor_id) {
      const safe = p.name || 'Unknown Rider';
      const [first, ...rest] = safe.split(' ');
      const last = rest.join(' ') || null;
      const { data: comp, error: e2 } = await supabase
        .from('competitor').insert({ first_name: first || null, last_name: last }).select('id').single();
      if (e2) throw e2;
      const { error: e3 } = await supabase
        .from('competitor_identity').insert({ competitor_id: comp.id, id_type: 'name', id_value: p.normName });
      if (e3) throw e3;
      competitor_id = comp.id;
      competitorByName.set(p.normName, competitor_id);
    }
    competitorIdByNormName.set(p.normName, competitor_id);
  }

  // ---- Entries ----
  const entryUpserts = parsedRiders.map(p => ({
    event_id: EVENT_ID,
    competitor_id: competitorIdByNormName.get(p.normName),
    course_id: p.courseName ? courseIdByName[p.courseName] : null,
    class_id:  p.className  ? classIdByName[p.className]  : null,
    bib: p.bib
  }));
  for (const batch of chunkArray(entryUpserts, UPSERT_CHUNK_SIZE)) {
    const { error } = await supabase.from('entry').upsert(batch, { onConflict: 'event_id,competitor_id' });
    if (error) throw error;
  }

  const entries = await fetchAllPaged(
    supabase.from('entry').select('id,competitor_id').eq('event_id', EVENT_ID)
  );
  const competitorIds = Array.from(new Set(entryUpserts.map(e => e.competitor_id)));
  console.log('competitorIds:', competitorIds.length);
  const entryIdByCompetitorId = {};
  for (const e of entries) entryIdByCompetitorId[e.competitor_id] = e.id;

  // ---- Entry identity (SI cards) ----
  const eiUpserts = parsedRiders
    .filter(p => p.card)
    .map(p => {
      const compId  = competitorIdByNormName.get(p.normName);
      const entryId = entryIdByCompetitorId[compId];
      return { event_id: EVENT_ID, entry_id: entryId, id_type: 'si_card', id_value: p.card };
    })
    .filter(x => x.entry_id);
  for (const batch of chunkArray(eiUpserts, UPSERT_CHUNK_SIZE)) {
    const { error } = await supabase.from('entry_identity').upsert(batch, { onConflict: 'event_id,id_type,id_value' });
    if (error) throw error;
  }

  // ---- Attempts ----
  const attemptUpserts = [];
  for (const compId of competitorIds) {
    const entry_id = entryIdByCompetitorId[compId];
    if (!entry_id) continue;
    for (let runNo = 1; runNo <= maxRun; runNo++) {
      attemptUpserts.push({ event_id: EVENT_ID, entry_id, attempt_no: runNo });
    }
  }
  for (const batch of chunkArray(attemptUpserts, UPSERT_CHUNK_SIZE)) {
    const { error } = await supabase.from('attempt').upsert(batch, { onConflict: 'event_id,entry_id,attempt_no' });
    if (error) throw error;
  }

  const attempts = await fetchAllPaged(
    supabase.from('attempt').select('id,entry_id,attempt_no').eq('event_id', EVENT_ID)
  );
  console.log('attempts fetched:', attempts.length);
  const attemptIdByEntryAndNo = new Map();
  for (const a of attempts) attemptIdByEntryAndNo.set(`${a.entry_id}:${a.attempt_no}`, a.id);
  console.log('attempt map size:', attemptIdByEntryAndNo.size);

  // ---- Segment times ----
  const segmentTimeBuffer = [];

  for (const p of parsedRiders) {
    const compId   = competitorIdByNormName.get(p.normName);
    const entry_id = entryIdByCompetitorId[compId];
    if (!entry_id) continue;

    if (RACE_TYPE === 'enduro') {
      // ── Enduro: write run times + sector times from discovered columns ──
      for (const tc of timeCols) {
        const raw = (p.dataRow[tc.colIdx] || '').toString();
        const { shouldInsert, time_ms, status } = classifyCell(raw);
        if (!shouldInsert) continue;

        const attempt_id = attemptIdByEntryAndNo.get(`${entry_id}:${tc.runNo}`);
        if (!attempt_id) continue;

        let segment_id;
        if (tc.type === 'stage_run') {
          segment_id = keyToSegId[`stage:${slug(tc.stageName)}`];
        } else if (tc.type === 'sector') {
          const sn = tc.sectorName || `Sector ${tc.sectorNo}`;
          segment_id = keyToSegId[`split:${slug(tc.stageName)}:${slug(sn)}`];
        }
        if (!segment_id) continue;

        segmentTimeBuffer.push({ attempt_id, segment_id, time_ms, status });
      }

    } else {
      // ── Downhill: 1 stage per course, 1 run ──
      const stageName = courseStageMap ? courseStageMap.get(p.courseName) : null;
      if (!stageName) continue;

      const attempt_id = attemptIdByEntryAndNo.get(`${entry_id}:1`);
      if (!attempt_id) continue;

      // Sector times (only for sectors belonging to this course's stage)
      for (const tc of timeCols) {
        if (tc.stageName !== stageName || tc.type !== 'sector') continue;
        const raw = (p.dataRow[tc.colIdx] || '').toString();
        const { shouldInsert, time_ms, status } = classifyCell(raw);
        if (!shouldInsert) continue;

        const sn = tc.sectorName || `Sector ${tc.sectorNo}`;
        const segment_id = keyToSegId[`split:${slug(tc.stageName)}:${slug(sn)}`];
        if (!segment_id) continue;
        segmentTimeBuffer.push({ attempt_id, segment_id, time_ms, status });
      }

      // RaceTime → stage time (works for both sector and no-sector courses)
      const rtRaw = (p.dataRow[COL['RaceTime']] || '').toString();
      const rt = classifyCell(rtRaw);
      if (rt.shouldInsert) {
        const segment_id = keyToSegId[`stage:${slug(stageName)}`];
        if (segment_id) {
          segmentTimeBuffer.push({ attempt_id, segment_id, time_ms: rt.time_ms, status: rt.status });
        }
      }
    }

    if (segmentTimeBuffer.length >= SEGMENT_TIME_FLUSH_AT) {
      await flushSegmentTimes(segmentTimeBuffer);
    }
  }

  await flushSegmentTimes(segmentTimeBuffer);

  // ---- Seed course_segment ----
  {
    const { error } = await supabase.rpc('seed_course_segments', { p_event_id: EVENT_ID });
    if (error) throw error;
    console.log('✅ course_segment seeded');
  }

  console.timeEnd('ingest');
  console.log('Done ✅');
}

run().catch(err => console.error('Fatal error:', err));
