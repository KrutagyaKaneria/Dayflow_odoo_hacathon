/**
 * Phase 10 — Security Hardening, item 7. Content-sniffing for uploaded files: multer's
 * `fileFilter` only sees the client-supplied `Content-Type` header (and the client-supplied
 * filename for its extension) — both are attacker-controlled and prove nothing about what's
 * actually in the file. This module inspects the first bytes of the uploaded buffer against
 * known magic-byte signatures and returns the REAL type, which callers then check against their
 * allow-list instead of trusting the declared mimetype.
 */
const SIGNATURES = [
  { mimeType: 'image/png', ext: '.png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mimeType: 'image/jpeg', ext: '.jpg', bytes: [0xff, 0xd8, 0xff] },
  { mimeType: 'image/gif', ext: '.gif', bytes: [0x47, 0x49, 0x46, 0x38] }, // "GIF8" (87a or 89a)
  { mimeType: 'application/pdf', ext: '.pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // "%PDF-"
];

function matchesAt(buffer, offset, bytes) {
  if (buffer.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i += 1) {
    if (buffer[offset + i] !== bytes[i]) return false;
  }
  return true;
}

function isWebp(buffer) {
  // RIFF????WEBP — bytes 0-3 "RIFF", bytes 8-11 "WEBP", with a 4-byte chunk-size field between.
  return (
    matchesAt(buffer, 0, [0x52, 0x49, 0x46, 0x46]) && matchesAt(buffer, 8, [0x57, 0x45, 0x42, 0x50])
  );
}

// Returns { mimeType, ext } for a recognized signature, or null if the buffer's actual content
// doesn't match any known type — a mismatch against the declared type is treated as a rejection
// by callers, not silently accepted under the declared type.
function detectFileType(buffer) {
  if (isWebp(buffer)) return { mimeType: 'image/webp', ext: '.webp' };
  for (const sig of SIGNATURES) {
    if (matchesAt(buffer, 0, sig.bytes)) return { mimeType: sig.mimeType, ext: sig.ext };
  }
  return null;
}

module.exports = { detectFileType };
