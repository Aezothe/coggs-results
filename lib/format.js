// lib/format.js
// Shared pure formatting helpers. Safe to import from both
// Vercel API routes (Node) and browser modules.

// ---------- Time formatting ----------

/**
 * Format milliseconds as M:SS.ss (e.g. 90123 → "1:30.12").
 * Returns '' for null/undefined.
 */
export function formatTime(ms) {
    if (ms == null) return '';
    const s = ms / 1000;
    const m = Math.floor(s / 60);
    const sec = (s % 60).toFixed(2);
    return `${m}:${sec.padStart(5, '0')}`;
  }
  
  // ---------- HTML safety ----------
  
  /**
   * Minimal HTML-escape for innerHTML insertion.
   */
  export function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  
  // ---------- CSV / SiTiming helpers ----------
  
  /**
   * Coerce a value to a CSV-safe string. null/undefined/'' → ''.
   * (Does NOT quote or escape commas — callers do not currently need that.)
   */
  export function safe(val) {
    if (val === null || val === undefined || val === '') return '';
    return String(val);
  }
  
  /**
   * Convert an ISO date 'YYYY-MM-DD' to SiTiming's M/D/YYYY format.
   * Returns '' if missing or malformed.
   */
  export function formatSiTimingDob(iso) {
    if (!iso) return '';
    const [year, month, day] = iso.split('-');
    if (!year || !month || !day) return '';
    return `${Number(month)}/${Number(day)}/${year}`;
  }
  
  /**
   * Build SiTiming's combined GenderDOB cell, e.g. "M3/14/1985".
   * Empty string if no DOB.
   */
  export function buildGenderDob(gender, iso) {
    const dob = formatSiTimingDob(iso);
    const g = gender ? String(gender).trim().toUpperCase().slice(0, 1) : '';
    if (!dob) return '';
    return `${g}${dob}`;
  }