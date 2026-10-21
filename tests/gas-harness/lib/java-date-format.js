/* =============================================================================
   lib/java-date-format.js  -  how Google formats dates (Utilities.formatDate)

   WHAT THIS FILE IS
     A helper for the fake Apps Script in fake-gas.js. Google's
     Utilities.formatDate(date, timeZone, pattern) uses Java's date patterns,
     for example "yyyy-MM-dd" or "d MMM yyyy, HH:mm". This file turns a date
     into text the same way, in any time zone (Asia/Kolkata for this project).

   HOW TO USE IT
     const { formatJavaDate, zoneParts } = require('./lib/java-date-format');
     formatJavaDate(new Date(), 'Asia/Kolkata', "yyyy-MM-dd'T'HH:mm:ss")

   WHAT IT READS / WRITES
     Nothing on disk. Pure calculation.

   KNOWN LIMITS
     The rarely used week fields (w, W) are approximations. Everything this
     project uses (years, months, days, hours, minutes, seconds, milliseconds,
     day names, time-zone offsets, quoted text) behaves like Java.
   ============================================================================= */
'use strict';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Names Java prints for the "z" pattern letter, for the zones we care about.
const ZONE_NAMES = {
  'Asia/Kolkata': ['IST', 'India Standard Time'],
  'Asia/Calcutta': ['IST', 'India Standard Time'],
  UTC: ['UTC', 'Coordinated Universal Time'],
  'Etc/UTC': ['UTC', 'Coordinated Universal Time'],
  GMT: ['GMT', 'Greenwich Mean Time'],
  'Etc/GMT': ['GMT', 'Greenwich Mean Time']
};

const formatterCache = new Map();

/* "GMT", "UTC", "GMT+05:30", "UTC-3" ... -> minutes east of Greenwich, or null
   when the name is a region such as Asia/Kolkata (looked up with Intl). */
function fixedOffsetMinutes(tz) {
  if (/^(UTC|GMT|Z|Etc\/UTC|Etc\/GMT|Etc\/UCT|UCT|Etc\/Zulu|Zulu)$/i.test(tz)) return 0;
  const m = /^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/i.exec(tz);
  if (!m) return null;
  const minutes = Number(m[2]) * 60 + Number(m[3] || 0);
  return m[1] === '-' ? -minutes : minutes;
}

/* The calendar fields of instant `ms` as seen in time zone `tz`.
   Returns null when the zone name is unknown (Java then quietly uses GMT). */
function zoneParts(ms, tz) {
  let offset = fixedOffsetMinutes(tz);
  if (offset === null) {
    let fmt = formatterCache.get(tz);
    if (!fmt) {
      try {
        fmt = new Intl.DateTimeFormat('en-US', {
          timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
          hour: 'numeric', minute: 'numeric', second: 'numeric'
        });
      } catch (e) {
        return null;
      }
      formatterCache.set(tz, fmt);
    }
    const p = {};
    for (const part of fmt.formatToParts(new Date(ms))) p[part.type] = part.value;
    const wholeSecond = Math.floor(ms / 1000) * 1000;
    const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24,
      Number(p.minute), Number(p.second));
    offset = Math.round((asUtc - wholeSecond) / 60000);
  }
  const local = new Date(ms + offset * 60000);
  const startOfYear = Date.UTC(local.getUTCFullYear(), 0, 1);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
    second: local.getUTCSeconds(),
    ms: local.getUTCMilliseconds(),
    weekday: local.getUTCDay(),
    dayOfYear: Math.floor((Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - startOfYear) / 86400000) + 1,
    offset
  };
}

/* Milliseconds since 1970 for a wall-clock time in zone tz (used when a cell
   receives "2026-10-21": Sheets reads it as midnight in the sheet's zone). */
function wallClockToMs(tz, year, month, day, hour, minute, second) {
  const guess = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0);
  const parts = zoneParts(guess, tz) || { offset: 0 };
  const first = guess - parts.offset * 60000;
  const again = zoneParts(first, tz) || { offset: 0 };   // second pass handles DST edges
  return guess - again.offset * 60000;
}

function pad(value, width) {
  const s = String(Math.abs(value));
  return (value < 0 ? '-' : '') + (s.length >= width ? s : '0'.repeat(width - s.length) + s);
}

function offsetText(offset, withColon, hoursOnly) {
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  const hh = pad(Math.floor(abs / 60), 2);
  const mm = pad(abs % 60, 2);
  if (hoursOnly) return sign + hh;
  return sign + hh + (withColon ? ':' : '') + mm;
}

function zoneName(tz, p, long) {
  const known = ZONE_NAMES[tz];
  if (known) return long ? known[1] : known[0];
  if (p.offset === 0) return long ? 'Greenwich Mean Time' : 'GMT';
  return 'GMT' + offsetText(p.offset, true, false);
}

function field(letter, count, p, tz) {
  switch (letter) {
    case 'G': return 'AD';
    case 'y':
    case 'Y': return count === 2 ? pad(p.year % 100, 2) : pad(p.year, count);
    case 'M':
    case 'L':
      if (count >= 4) return MONTHS[p.month - 1];
      if (count === 3) return MONTHS[p.month - 1].slice(0, 3);
      return pad(p.month, count);
    case 'd': return pad(p.day, count);
    case 'D': return pad(p.dayOfYear, count);
    case 'E': return count >= 4 ? DAYS[p.weekday] : DAYS[p.weekday].slice(0, 3);
    case 'u': return pad(p.weekday === 0 ? 7 : p.weekday, count);
    case 'F': return pad(Math.floor((p.day - 1) / 7) + 1, count);
    case 'w': return pad(Math.floor((p.dayOfYear - 1) / 7) + 1, count);
    case 'W': return pad(Math.floor((p.day - 1) / 7) + 1, count);
    case 'a': return p.hour < 12 ? 'AM' : 'PM';
    case 'H': return pad(p.hour, count);
    case 'k': return pad(p.hour === 0 ? 24 : p.hour, count);
    case 'K': return pad(p.hour % 12, count);
    case 'h': return pad(p.hour % 12 === 0 ? 12 : p.hour % 12, count);
    case 'm': return pad(p.minute, count);
    case 's': return pad(p.second, count);
    case 'S': return pad(p.ms, count);
    case 'z': return zoneName(tz, p, count >= 4);
    case 'Z': return offsetText(p.offset, false, false);
    case 'X':
      if (p.offset === 0) return 'Z';
      if (count === 1) return offsetText(p.offset, false, true);
      return offsetText(p.offset, count >= 3, false);
    default: {
      const err = new Error(`Illegal pattern character '${letter}'`);
      err.badPattern = true;
      throw err;
    }
  }
}

/* formatJavaDate(date, tz, pattern) -> text, like Java's SimpleDateFormat.
   Returns { text, unknownZone } so the caller can warn about a bad zone. */
function formatJavaDate(ms, tz, pattern) {
  let parts = zoneParts(ms, tz);
  let unknownZone = false;
  if (!parts) {                       // Java falls back to GMT for unknown zone names
    unknownZone = true;
    parts = zoneParts(ms, 'GMT');
    tz = 'GMT';
  }
  let out = '';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "'") {
      if (pattern[i + 1] === "'") { out += "'"; i += 2; continue; }
      let j = i + 1;
      let literal = '';
      let closed = false;
      while (j < pattern.length) {
        if (pattern[j] === "'") {
          if (pattern[j + 1] === "'") { literal += "'"; j += 2; continue; }
          closed = true;
          break;
        }
        literal += pattern[j];
        j += 1;
      }
      if (!closed) {
        const err = new Error('Unterminated quote in the date pattern "' + pattern + '"');
        err.badPattern = true;
        throw err;
      }
      out += literal;
      i = j + 1;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      let j = i;
      while (j < pattern.length && pattern[j] === ch) j += 1;
      out += field(ch, j - i, parts, tz);
      i = j;
      continue;
    }
    out += ch;
    i += 1;
  }
  return { text: out, unknownZone };
}

module.exports = { formatJavaDate, zoneParts, wallClockToMs, fixedOffsetMinutes };
