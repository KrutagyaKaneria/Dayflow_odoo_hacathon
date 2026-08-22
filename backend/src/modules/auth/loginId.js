/**
 * Login ID generation — Phase 02, Path A (admin-provisioned) only.
 *
 * Formula (design's Excalidraw Note, verbatim):
 *   [First two letters of Company Name][First two letters of first name]
 *   [First two letters of last name][Year of joining][Serial number of joining for that year]
 *
 * Worked example: "OIJODO20220001" for Odoo India, first+last name giving "JODO", year 2022,
 * serial 0001.
 *
 * Reconciling the formula text with the worked example: a literal "first two letters of company
 * name" reading of "Odoo India" would give "Od", not "OI". "OI" is the initial of each of the two
 * words ("Odoo" + "India"). This module takes first-letter-per-word for a multi-word company name
 * and literal-first-two-letters for a single-word name, which reproduces the worked example exactly
 * while still matching the formula text for the single-word case. Not stated explicitly by either
 * source document — flagged here since it's a judgment call, not a transcription.
 */

function twoLetters(str) {
  return (str || '').trim().slice(0, 2).toUpperCase();
}

function companyCode(companyName) {
  const words = (companyName || '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return twoLetters(words[0] || '');
}

/**
 * Pure function — no I/O. Serial-number computation (querying existing employee_profiles for the
 * org/year and incrementing) lives in the DB-facing provisioning flow, not here.
 *
 * TODO(D-01 / security baseline item 4): this formula is deterministic and guessable (sequential
 * serials). Not fixed in this phase — noted here per the Master Roadmap's Security Baseline §5.4,
 * to be revisited no later than Phase 10.
 */
function generateLoginId({ companyName, firstName, lastName, joinYear, serialNumber }) {
  const company = companyCode(companyName);
  const first = twoLetters(firstName);
  const last = twoLetters(lastName);
  const year = String(joinYear);
  const serial = String(serialNumber).padStart(4, '0');
  return `${company}${first}${last}${year}${serial}`;
}

module.exports = { generateLoginId, companyCode, twoLetters };
