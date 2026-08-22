-- Migration: widen_bank_details_encrypted_columns
-- Phase 10 — Security Hardening, item 4 (Bank Details encryption at rest).
--
-- pan_no and uan_no were VARCHAR(50), sized for plaintext (PAN is always 10 characters; UAN is
-- always 12 digits). The encrypted form stored by shared/security/fieldEncryption.js is
-- `<iv>:<authTag>:<ciphertext>`, all base64 — a fixed ~42-character overhead (16-char IV +
-- 24-char authTag + 2 colons) on top of the ciphertext itself, which overflows VARCHAR(50) for
-- any real PAN/UAN value. account_number is already VARCHAR(255) (Phase 04) and needs no change;
-- widening pan_no/uan_no to match keeps all three encrypted columns the same width.

ALTER TABLE "employee_bank_details" ALTER COLUMN "pan_no" TYPE VARCHAR(255);
ALTER TABLE "employee_bank_details" ALTER COLUMN "uan_no" TYPE VARCHAR(255);
