const MALAYSIA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

export function getMalaysiaTodayString(now = Date.now()) {
  const malaysiaNow = new Date(now + MALAYSIA_UTC_OFFSET_MS);
  const year = malaysiaNow.getUTCFullYear();
  const month = String(malaysiaNow.getUTCMonth() + 1).padStart(2, '0');
  const day = String(malaysiaNow.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function millisecondsUntilNextMalaysiaMidnight(now = Date.now()) {
  const malaysiaNow = new Date(now + MALAYSIA_UTC_OFFSET_MS);
  const nextMidnightAsUtc = Date.UTC(
    malaysiaNow.getUTCFullYear(),
    malaysiaNow.getUTCMonth(),
    malaysiaNow.getUTCDate() + 1,
  );
  return Math.max(1, nextMidnightAsUtc - malaysiaNow.getTime());
}
