export function formatTime(ms: number | null | undefined): string {
    if (ms == null) return "";
    const s = ms / 1000;
    const m = Math.floor(s / 60);
    const sec = (s % 60).toFixed(2);
    return `${m}:${sec.padStart(5, "0")}`;
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