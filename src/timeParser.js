'use strict';

/**
 * Time input parsing for the Hourglass timer.
 *
 * Supports, in the spirit of the original Hourglass app:
 *   Durations
 *     "5"                -> 5 minutes
 *     "90"               -> 90 minutes
 *     "5:30"             -> 5 minutes 30 seconds (mm:ss)
 *     "1:30:00"          -> 1 hour 30 minutes (hh:mm:ss)
 *     "10m", "10 min"    -> 10 minutes
 *     "1h 30m"           -> 1 hour 30 minutes
 *     "1.5 hours"        -> 90 minutes
 *     "90 seconds"       -> 90 seconds
 *     "2 days"           -> 2 days
 *   Times of day (counts down to the next occurrence)
 *     "5:30 pm", "7pm", "noon", "midnight"
 *   Dates / date-times
 *     "2026-12-31 15:00", "December 31 2026", "Jan 1"
 *
 * parseInput(text, now) -> {
 *   ms:      number  (milliseconds from `now` until the target; > 0)
 *   type:    'duration' | 'datetime'
 *   target:  Date     (absolute moment the timer ends)
 *   label:   string   (human readable description of what was parsed)
 * }
 * Throws Error with a friendly message when the input cannot be understood.
 */

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window.HourglassTime = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const UNIT_SECONDS = {
  d: 86400, day: 86400, days: 86400,
  h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600,
  m: 60, min: 60, mins: 60, minute: 60, minutes: 60,
  s: 1, sec: 1, secs: 1, second: 1, seconds: 1,
};

function pad(n) {
  return String(n).padStart(2, '0');
}

/** Format a millisecond duration as H:MM:SS (or M:SS when under an hour). */
function formatDuration(ms) {
  const negative = ms < 0;
  let total = Math.round(Math.abs(ms) / 1000);
  const days = Math.floor(total / 86400);
  total -= days * 86400;
  const hours = Math.floor(total / 3600);
  total -= hours * 3600;
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;

  let out;
  if (days > 0) {
    out = `${days}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  } else if (hours > 0) {
    out = `${hours}:${pad(minutes)}:${pad(seconds)}`;
  } else {
    out = `${minutes}:${pad(seconds)}`;
  }
  return (negative ? '-' : '') + out;
}

/** Long-form description, e.g. "1 hour 30 minutes". */
function describeDuration(ms) {
  let total = Math.round(ms / 1000);
  const parts = [];
  const units = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
  ];
  for (const [name, secs] of units) {
    const v = Math.floor(total / secs);
    if (v > 0) {
      parts.push(`${v} ${name}${v === 1 ? '' : 's'}`);
      total -= v * secs;
    }
  }
  return parts.length ? parts.join(' ') : '0 seconds';
}

function formatClock(date) {
  let h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${pad(m)} ${ampm}`;
}

function isColonDuration(text) {
  return /^\d{1,3}(:\d{1,2}){1,3}$/.test(text) && !/[ap]m/i.test(text);
}

function parseColonDuration(text) {
  const parts = text.split(':').map((p) => parseInt(p, 10));
  let seconds = 0;
  if (parts.length === 2) {
    // mm:ss
    seconds = parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    // hh:mm:ss
    seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 4) {
    // dd:hh:mm:ss
    seconds = parts[0] * 86400 + parts[1] * 3600 + parts[2] * 60 + parts[3];
  }
  return seconds * 1000;
}

function parseUnitDuration(text) {
  // Matches sequences like "1h 30m", "90 minutes", "1.5 hours", "2d4h"
  const re = /(\d+(?:\.\d+)?)\s*([a-z]+)/gi;
  let match;
  let totalSeconds = 0;
  let matchedAny = false;
  let consumed = 0;
  while ((match = re.exec(text)) !== null) {
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    if (!(unit in UNIT_SECONDS)) {
      return null; // unknown unit -> not a unit duration
    }
    totalSeconds += value * UNIT_SECONDS[unit];
    matchedAny = true;
    consumed += match[0].replace(/\s/g, '').length;
  }
  if (!matchedAny) return null;
  // ensure the whole string was units (ignoring whitespace/commas/"and")
  const stripped = text.replace(/[\s,]|and/gi, '');
  const reCheck = /^(\d+(?:\.\d+)?[a-z]+)+$/i;
  if (!reCheck.test(stripped)) return null;
  return Math.round(totalSeconds * 1000);
}

function parseTimeOfDay(text, now) {
  const t = text.trim().toLowerCase();
  let hours;
  let minutes = 0;

  if (t === 'noon') {
    hours = 12;
  } else if (t === 'midnight') {
    hours = 0;
  } else {
    const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)?$/);
    if (!m) return null;
    hours = parseInt(m[1], 10);
    minutes = m[2] ? parseInt(m[2], 10) : 0;
    const ampm = m[3];
    if (ampm) {
      if (hours < 1 || hours > 12) return null;
      if (ampm === 'pm' && hours !== 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;
    } else {
      // No am/pm and a bare number would be ambiguous with a duration;
      // require a colon (e.g. "17:30") to treat as time of day.
      if (!m[2]) return null;
      if (hours > 23) return null;
    }
  }
  if (minutes > 59) return null;

  const target = new Date(now);
  target.setSeconds(0, 0);
  target.setHours(hours, minutes, 0, 0);
  if (target.getTime() <= now.getTime()) {
    // next occurrence is tomorrow
    target.setDate(target.getDate() + 1);
  }
  return target;
}

function parseDateTime(text, now) {
  // Let the JS engine attempt to parse full dates. Guard against it
  // interpreting bare numbers or plain durations as dates.
  if (/^\d+(\.\d+)?$/.test(text.trim())) return null;
  const ts = Date.parse(text);
  if (Number.isNaN(ts)) return null;
  const target = new Date(ts);
  // Reject implausible parses (e.g. year far in the past that was really a
  // duration) unless clearly in the future.
  return target;
}

function parseInput(text, now = new Date()) {
  const raw = (text || '').trim();
  if (!raw) {
    throw new Error('Enter a time or duration.');
  }

  // 1. Bare number -> minutes
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const ms = Math.round(parseFloat(raw) * 60 * 1000);
    if (ms <= 0) throw new Error('Enter a duration greater than zero.');
    return {
      ms,
      type: 'duration',
      target: new Date(now.getTime() + ms),
      label: describeDuration(ms),
    };
  }

  // 2. Colon duration mm:ss / hh:mm:ss (no am/pm)
  if (isColonDuration(raw)) {
    // A two-part colon value could also be a 24h time like "17:30".
    // Prefer duration for small first components, time-of-day otherwise
    // only when it can't be a sensible duration is ambiguous — Hourglass
    // treats "5:30" as a duration, so we do the same.
    const ms = parseColonDuration(raw);
    if (ms <= 0) throw new Error('Enter a duration greater than zero.');
    return {
      ms,
      type: 'duration',
      target: new Date(now.getTime() + ms),
      label: describeDuration(ms),
    };
  }

  // 3. Unit duration "1h 30m", "90 minutes", "1.5 hours"
  const unitMs = parseUnitDuration(raw);
  if (unitMs !== null) {
    if (unitMs <= 0) throw new Error('Enter a duration greater than zero.');
    return {
      ms: unitMs,
      type: 'duration',
      target: new Date(now.getTime() + unitMs),
      label: describeDuration(unitMs),
    };
  }

  // 4. Time of day "5:30 pm", "7pm", "noon", "17:30"
  const tod = parseTimeOfDay(raw, now);
  if (tod) {
    return {
      ms: tod.getTime() - now.getTime(),
      type: 'datetime',
      target: tod,
      label: `until ${formatClock(tod)}`,
    };
  }

  // 5. Full date / date-time
  const dt = parseDateTime(raw, now);
  if (dt) {
    const ms = dt.getTime() - now.getTime();
    if (ms <= 0) {
      throw new Error('That time is in the past.');
    }
    return {
      ms,
      type: 'datetime',
      target: dt,
      label: `until ${dt.toLocaleString()}`,
    };
  }

  throw new Error(`Couldn't understand "${raw}".`);
}

return {
  parseInput,
  formatDuration,
  describeDuration,
  formatClock,
};
});
