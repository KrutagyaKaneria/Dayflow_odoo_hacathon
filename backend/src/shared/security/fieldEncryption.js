/**
 * Phase 10 — Security Hardening, item 4. Application-layer field encryption for the
 * highest-sensitivity data in the system: Bank Details (account_number, pan_no, uan_no — Phase
 * 04 flagged these as `[RECOMMENDATION pending Phase 10 hardening]` plaintext-with-DB-access-
 * controls-only, deliberately not solved at the time).
 *
 * AES-256-GCM, key from FIELD_ENCRYPTION_KEY (config/env.js — required, no hardcoded fallback).
 * Ciphertext is stored as `<iv>:<authTag>:<ciphertext>`, all base64, in the same VARCHAR(255)
 * column the plaintext used to occupy — no schema/migration change at all: the encrypted form of
 * an account number, PAN, or UAN (short values) comfortably fits within 255 characters even with
 * the IV/authTag overhead, so this is a value-shape change made entirely at the application
 * layer (see employees/service.js), not a column-type change.
 *
 * [RECOMMENDATION] Neither source document requires field-level encryption; this is a Phase 10
 * hardening default, not a discovered requirement. No key-rotation or re-encryption tooling is
 * built this phase — rotating FIELD_ENCRYPTION_KEY makes existing encrypted rows unreadable.
 */
const crypto = require('crypto');
const { config } = require('../../config/db');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // GCM-recommended IV length

function getKey() {
  const key = Buffer.from(config.fieldEncryptionKey, 'base64');
  if (key.length !== 32) {
    throw new Error('FIELD_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256) — see .env.example.');
  }
  return key;
}

// Returns null for null/undefined input (never encrypts an absent value into a spurious string,
// and never throws on a legitimately-empty Bank Details field).
function encryptField(plaintext) {
  if (plaintext == null) return null;
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

function decryptField(stored) {
  if (stored == null) return null;
  const parts = String(stored).split(':');
  if (parts.length !== 3) {
    // Defensive: a value that doesn't match the <iv>:<authTag>:<ciphertext> shape is not
    // something this function encrypted — fail loudly rather than silently returning garbage,
    // since a Bank Details field displayed wrong is a real-money-adjacent mistake.
    throw new Error('Value is not in the expected encrypted-field format.');
  }
  const [ivB64, authTagB64, ciphertextB64] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]);
  return plaintext.toString('utf8');
}

module.exports = { encryptField, decryptField };
