/**
 * Format a millisecond duration as a race time.
 * Adaptive hours: shows hours only when >= 1 hour.
 * @param showHundredths when false, omits the .cc suffix (whole-second display)
 */
export function formatTime(
  ms: number | null | undefined,
  showHundredths: boolean = true,
): string {
  if (ms == null) return "";
  const neg = ms < 0;
  const abs = Math.abs(ms);

  const totalSec = Math.floor(abs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const cs = Math.floor((abs % 1000) / 10);

  const ss = String(s).padStart(2, "0");
  const suffix = showHundredths ? `.${String(cs).padStart(2, "0")}` : "";

  let out: string;
  if (h > 0) {
    out = `${h}:${String(m).padStart(2, "0")}:${ss}${suffix}`;
  } else {
    out = `${m}:${ss}${suffix}`;
  }
  return neg ? `-${out}` : out;
}

/** True if the duration has a non-zero hundredths component. */
export function hasHundredths(ms: number | null | undefined): boolean {
  return ms != null && ms % 1000 !== 0;
}

  
  export function escapeHtml(s: unknown): string {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  
  export function safe(val: unknown): string {
    if (val === null || val === undefined || val === "") return "";
    return String(val);
  }
  
  export function formatSiTimingDob(iso: string | null | undefined): string {
    if (!iso) return "";
    const [year, month, day] = iso.split("-");
    if (!year || !month || !day) return "";
    return `${Number(month)}/${Number(day)}/${year}`;
  }
  
  export function buildGenderDob(
    gender: string | null | undefined,
    iso: string | null | undefined,
  ): string {
    const dob = formatSiTimingDob(iso);
    const g = gender ? String(gender).trim().toUpperCase().slice(0, 1) : "";
    if (!dob) return "";
    return `${g}${dob}`;
  }