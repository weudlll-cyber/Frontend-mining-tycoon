/**
File: src/utils/duration-format.js
Purpose: One duration formatter for every countdown and duration label in the
  frontend (board, lobby, admin, trading, farming).
Role in system:
- Replaces the per-module copies that each re-implemented the same unit math.
  Call sites pick an explicit style instead of sharing one compromise, so
  every visible string stays exactly what that place showed before.
Styles (`options.style`):
- 'clock'   "mm:ss" (minutes unbounded) or, with `hours: true`, "HH:MM:SS".
- 'compact' unit parts without spaces: "1h 5m", "2m 05s", "42s", "3d 4h".
- 'long'    spaced units for sentences: "2 d 03 h", "1 h 05 min", "45 s".
Compact options: largest / smallest unit ('d' | 'h' | 'm' | 's'), minLeading
  (the leading unit is never smaller than this), parts (max units shown),
  pad (true or a list of units padded to two digits when they are not the
  leading part), keepZeroMinor (show "1h 0m" instead of "1h"), round
  ('floor' | 'round'), signed (prefix "+"/"-").
Common option: fallback - returned for null/undefined/''/non-finite input;
  when omitted such input counts as 0. Negative input counts as 0 unless
  `signed` is set.
Security notes: returns plain strings; callers render them with textContent.
*/

const UNIT_ORDER = ['d', 'h', 'm', 's'];
const UNIT_SECONDS = { d: 86400, h: 3600, m: 60, s: 1 };
const COMPACT_LABELS = { d: 'd', h: 'h', m: 'm', s: 's' };
const LONG_LABELS = { d: ' d', h: ' h', m: ' min', s: ' s' };

function pad2(value) {
  return String(value).padStart(2, '0');
}

function readSeconds(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatClock(total, withHours) {
  if (withHours) {
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    return `${pad2(hours)}:${pad2(minutes)}:${pad2(total % 60)}`;
  }
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

function shouldPad(pad, unit) {
  return Array.isArray(pad) ? pad.includes(unit) : Boolean(pad);
}

function formatUnits(total, options, labels) {
  const {
    largest = 'd',
    smallest = 's',
    minLeading = smallest,
    parts = 2,
    pad = false,
    keepZeroMinor = true,
    round = 'floor',
  } = options;
  const units = UNIT_ORDER.slice(
    UNIT_ORDER.indexOf(largest),
    UNIT_ORDER.indexOf(smallest) + 1
  );

  if (parts === 1) {
    // One unit only, rounded within that unit: 5400 s -> "2h".
    const unit =
      units.find((key) => total >= UNIT_SECONDS[key]) ?? units.at(-1);
    const value =
      round === 'round'
        ? Math.round(total / UNIT_SECONDS[unit])
        : Math.floor(total / UNIT_SECONDS[unit]);
    return `${value}${labels[unit]}`;
  }

  let leading = units.findIndex((key) => total >= UNIT_SECONDS[key]);
  if (leading === -1) leading = units.length - 1;
  leading = Math.min(leading, units.indexOf(minLeading));

  let remaining = total;
  const pieces = [];
  units.slice(leading, leading + parts).forEach((unit, index) => {
    const value = Math.floor(remaining / UNIT_SECONDS[unit]);
    remaining -= value * UNIT_SECONDS[unit];
    if (index > 0 && value === 0 && !keepZeroMinor) return;
    const text = index > 0 && shouldPad(pad, unit) ? pad2(value) : value;
    pieces.push(`${text}${labels[unit]}`);
  });
  return pieces.join(' ');
}

/**
 * Format a duration in seconds. See the file header for styles and options.
 * @param {number|string|null|undefined} seconds
 * @param {object} [options]
 * @returns {string}
 */
export function formatDuration(seconds, options = {}) {
  const { style = 'compact', fallback, signed = false } = options;
  const numeric = readSeconds(seconds);
  if (numeric === null && fallback !== undefined) return fallback;
  const value = numeric ?? 0;
  const sign = signed ? (value < 0 ? '-' : '+') : '';
  const magnitude = signed ? Math.abs(value) : Math.max(0, value);
  const total =
    options.round === 'round' ? Math.round(magnitude) : Math.floor(magnitude);

  if (style === 'clock') return formatClock(total, options.hours === true);
  if (style === 'long') {
    // The last minute counts down in seconds; above that seconds are noise.
    return formatUnits(
      total,
      { pad: true, smallest: total < 60 ? 's' : 'm' },
      LONG_LABELS
    );
  }
  return `${sign}${formatUnits(total, options, COMPACT_LABELS)}`;
}
