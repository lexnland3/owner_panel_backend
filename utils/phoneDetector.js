/**
 * Phone Number Detection Engine
 * Catches all common ways someone might try to share a phone number:
 *   - Raw digits: 9876543210
 *   - With spaces: 98765 43210
 *   - With dashes: 987-654-3210
 *   - International: +91 9876543210, +1-800-555-1234
 *   - In words: "call me at nine eight seven six"
 *   - Spaced out: 9 8 7 6 5 4 3 2 1 0
 *   - Mixed: 98 765-43210
 *   - WhatsApp style: wa.me/919876543210
 *   - Hidden in text: "my number is 9876543210 contact me"
 */

// Map of number words to digits
const WORD_MAP = {
  'zero':0,'one':1,'two':2,'three':3,'four':4,'five':5,
  'six':6,'seven':7,'eight':8,'nine':9,'ten':10,
  'oh':0,'nought':0,
};

// Replace number words with digits for analysis
function wordToDigit(text) {
  return text.toLowerCase().replace(
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|oh|nought|ten)\b/g,
    (m) => WORD_MAP[m] ?? m
  );
}

// Strip non-alphanumeric to get digit sequences
function extractDigitBlocks(text) {
  // Replace all separators (spaces, dashes, dots, brackets, slashes) between digits
  const cleaned = text
    .replace(/[+\-.()\s\/\\|_,]+/g, '')   // remove separators
    .replace(/[^\d]/g, ' ')                // replace non-digits with space
    .trim();
  return cleaned.split(/\s+/).filter(Boolean);
}

const PHONE_PATTERNS = [
  // International format: +91-9876543210, +1 (800) 555-1234
  /\+\d[\d\s\-().]{7,14}\d/,
  // Indian mobile: 10 digits starting with 6-9
  /\b[6-9]\d{9}\b/,
  // Any 8+ continuous digits (catches partial phone numbers like 987642134)
  /\d{8,}/,
  // Digits with separators totalling 10+: 987-654-3210
  /\b\d{3}[\s\-.]?\d{3}[\s\-.]?\d{4}\b/,
  // Digits with separators: 98765 43210
  /\b\d{5}[\s\-.]?\d{5}\b/,
  // WhatsApp links
  /wa\.me\/\d+/i,
  // Any block of 8+ spaced single digits
  /(?:\d[\s,]+){7,}\d/,
];

/**
 * Returns { blocked: bool, reason: string }
 */
function detectPhone(text) {
  if (!text || typeof text !== 'string') return { blocked: false };

  const original = text;

  // Check 1: direct pattern match on original text
  for (const re of PHONE_PATTERNS) {
    if (re.test(original)) {
      return {
        blocked: true,
        reason: 'Message blocked: phone numbers are not allowed in chat. Please use the platform to communicate.',
      };
    }
  }

  // Check 2: after stripping separators, check for 10+ digit runs
  const stripped = original.replace(/[\s\-.()+\/\\|_,]/g, '');
  if (/\d{8,}/.test(stripped)) {
    return {
      blocked: true,
      reason: 'Message blocked: phone numbers are not allowed in chat.',
    };
  }

  // Check 3: spaced single digits (e.g. "9 8 7 6 5 4 3 2 1 0")
  const singleDigits = original.match(/\b\d\b/g);
  if (singleDigits && singleDigits.length >= 8) {
    return {
      blocked: true,
      reason: 'Message blocked: sharing phone numbers in segments is not allowed.',
    };
  }

  // Check 4: number words spelling out a phone number
  const wordified = wordToDigit(original);
  if (wordified !== original.toLowerCase()) {
    // text had number words — re-run digit checks
    const wStripped = wordified.replace(/[\s\-.()+\/\\|_,]/g, '');
    if (/\d{8,}/.test(wStripped)) {
      return {
        blocked: true,
        reason: 'Message blocked: spelling out phone numbers is also not allowed.',
      };
    }
    const wSingles = wordified.match(/\b\d\b/g);
    if (wSingles && wSingles.length >= 6) {
      return {
        blocked: true,
        reason: 'Message blocked: spelling out phone numbers is not allowed.',
      };
    }
  }

  return { blocked: false };
}

module.exports = { detectPhone };
