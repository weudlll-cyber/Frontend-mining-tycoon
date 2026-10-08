/**
File: src/utils/schedule-time.js
Purpose: Shared time helpers for scheduled sync rounds: parse the backend
  `scheduled_start_at` / `opens_in_seconds` / `opens_at` fields, format a start
  time in the viewer's LOCAL time zone and format "opens in" countdowns.
Role in system:
- Used by the admin create form (src/admin/schedule-options.js), the lobby
  (src/lobby.js, src/ui/lobby-games.js, src/ui/lobby-game-list.js) and the
  player board (src/ui/board-update.js, src/ui/standings-status.js).
Constraints:
- The backend speaks unix seconds (UTC). Everything shown to people is local
  time via Intl/Date; nothing here decides whether a round is open (the
  backend is authoritative and answers 409 JOIN_NOT_ALLOWED_SCHEDULED).
- Pure helpers: no DOM access, `now` is injectable for tests.
Security notes: returns plain strings; callers render them with textContent.
*/

/** Unix seconds as a positive finite number, or null for anything else. */
export function normalizeUnixSeconds(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function nowUnixSeconds(nowMs = Date.now()) {
  return Math.floor(nowMs / 1000);
}

/**
 * Parse the value of an `<input type="datetime-local">` ("YYYY-MM-DDTHH:MM",
 * optionally with seconds) as LOCAL time and return unix seconds (UTC), or
 * null when the value is empty or invalid.
 */
export function parseLocalDateTimeInput(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    String(value || '').trim()
  );
  if (!match) return null;
  const [, year, month, day, hours, minutes, seconds = '0'] = match;
  // WHY: the Date constructor with numeric parts always uses the local zone,
  // unlike Date.parse which is implementation-specific for some shapes.
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    Number(seconds)
  );
  const ms = date.getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

/** Unix seconds -> "YYYY-MM-DDTHH:MM" in local time (datetime-local value). */
export function toDateTimeLocalValue(unixSeconds) {
  const date = new Date(unixSeconds * 1000);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** "HH:MM" (24 h) in local time. */
export function formatLocalTime(unixSeconds) {
  const date = new Date(unixSeconds * 1000);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** Local date and time, e.g. "Thu, 8 Oct 2026, 14:30" (locale-dependent). */
export function formatLocalDateTime(unixSeconds) {
  return new Date(unixSeconds * 1000).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Short opening label: "HH:MM" when the start is less than a day away,
 * otherwise "<short date> HH:MM" so a far-away time is not ambiguous.
 */
export function formatOpensAtShort(unixSeconds, nowMs = Date.now()) {
  const time = formatLocalTime(unixSeconds);
  if (unixSeconds - nowMs / 1000 < 86400) return time;
  const day = new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
  return `${day} ${time}`;
}

/**
 * Countdown text without the "opens in" prefix: "2 d 03 h", "1 h 05 min",
 * "5 min", "45 s". Minutes are floored and never shown as 0 while time
 * remains (the last minute counts down in seconds).
 */
export function formatOpensIn(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  if (total < 60) return `${total} s`;
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days} d ${pad2(hours)} h`;
  if (hours > 0) return `${hours} h ${pad2(minutes)} min`;
  return `${minutes} min`;
}

/**
 * The viewer's time zone for the admin date-time picker hint, e.g.
 * "Europe/Berlin (UTC+02:00)". The offset is the one at `atMs` because it
 * changes with daylight saving time.
 */
export function describeLocalTimeZone(atMs = Date.now()) {
  const name = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const offsetMinutes = -new Date(atMs).getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const offset = `UTC${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
  return name ? `${name} (${offset})` : offset;
}
