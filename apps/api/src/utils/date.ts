/**
 * Malaysia (MYT) is UTC+8
 */
export function getMalaysiaDayRange(dateStr?: string) {
  // If no date provided, use today
  const baseDate = dateStr ? new Date(dateStr) : new Date();
  
  // Use UTC methods to construct the range to avoid server timezone interference
  // Assuming dateStr is "YYYY-MM-DD"
  let y: number, m: number, d: number;
  
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const parts = dateStr.split('-').map(Number);
    y = parts[0];
    m = parts[1] - 1;
    d = parts[2];
  } else {
    // For non-string or other formats, we need to be careful. 
    // If it's "now", we want "today" in Malaysia.
    // Malaysia is 8 hours ahead of UTC.
    const mytNow = new Date(new Date().getTime() + (8 * 60 * 60 * 1000));
    y = mytNow.getUTCFullYear();
    m = mytNow.getUTCMonth();
    d = mytNow.getUTCDate();
  }
  
  // MYT 00:00:00 is UTC-8h
  const start = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  start.setUTCHours(start.getUTCHours() - 8);
  
  const end = new Date(Date.UTC(y, m, d, 23, 59, 59, 999));
  end.setUTCHours(end.getUTCHours() - 8);
  
  return { start, end };
}

export function getMalaysiaTodayString() {
  const mytNow = new Date(new Date().getTime() + (8 * 60 * 60 * 1000));
  const y = mytNow.getUTCFullYear();
  const m = String(mytNow.getUTCMonth() + 1).padStart(2, '0');
  const d = String(mytNow.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

