const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { sendError } = require('../../shared/response');
const { detectFileType } = require('../../shared/security/fileSniffing');

// Reuses Phase 04's avatar-upload VALIDATION approach (multer, type/size limits, the same
// error-translation wrapper shape, and Phase 10's content-sniffing) — but deliberately does NOT
// reuse its storage location or public static-serving strategy. Avatars are low-sensitivity by
// design; a sick-leave certificate is medical documentation, arguably the most sensitive artifact
// in the system after bank details (Phase 04). Storing it outside backend/uploads/ (which app.js
// serves unauthenticated via express.static) and serving it only through the authenticated
// GET /leaves/attachments/:userId/:filename route in routes.js is the point, not an oversight —
// see the isolation test in tests/integration.
const ATTACHMENT_DIR = path.join(__dirname, '..', '..', '..', 'leave-attachments');

// [RECOMMENDATION] Neither source specifies a max attachment size. Slightly larger than Phase
// 04's avatar limit since a scanned certificate is typically bigger than a profile photo.
const ATTACHMENT_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']);

function userAttachmentDir(userId) {
  const dir = path.join(ATTACHMENT_DIR, userId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Phase 10 — Security Hardening, item 7. memoryStorage, not diskStorage — see avatarUpload.js's
// header for why content-sniffing requires the buffer be fully available before anything is
// written to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ATTACHMENT_MAX_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('UNSUPPORTED_FILE_TYPE'));
    }
    cb(null, true);
  },
});

function rejectUnsupportedType(res) {
  return sendError(
    res,
    400,
    'VALIDATION_ERROR',
    'Unsupported file type. Only PNG, JPEG, GIF, WebP, or PDF files are allowed.'
  );
}

// Same error-translation shape and content-sniffing discipline as Phase 04's singleAvatarUpload —
// see that file's docstring. Filename is crypto.randomUUID() + the SNIFFED extension, never the
// client's originalname or a Date.now() timestamp.
function singleAttachmentUpload(req, res, next) {
  upload.single('attachment')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return sendError(
          res,
          400,
          'VALIDATION_ERROR',
          `Attachment must be ${ATTACHMENT_MAX_SIZE_BYTES / (1024 * 1024)}MB or smaller.`
        );
      }
      return rejectUnsupportedType(res);
    }
    if (!req.file) return next();

    const detected = detectFileType(req.file.buffer);
    if (!detected || !ALLOWED_MIME_TYPES.has(detected.mimeType)) {
      return rejectUnsupportedType(res);
    }

    const filename = `${crypto.randomUUID()}${detected.ext}`;
    fs.writeFileSync(path.join(userAttachmentDir(req.user.id), filename), req.file.buffer);
    req.file.filename = filename;
    return next();
  });
}

module.exports = { singleAttachmentUpload, ATTACHMENT_DIR, ATTACHMENT_MAX_SIZE_BYTES };
