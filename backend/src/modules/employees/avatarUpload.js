const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { sendError } = require('../../shared/response');
const { detectFileType } = require('../../shared/security/fileSniffing');

const UPLOAD_DIR = path.join(__dirname, '..', '..', '..', 'uploads', 'avatars');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// [RECOMMENDATION] Neither source document specifies a max avatar size or storage backend.
// 2MB / local disk is a documented default for this phase — revisit if a later phase introduces
// real object storage (S3 etc.).
const AVATAR_MAX_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

// Phase 10 — Security Hardening, item 7. memoryStorage (not diskStorage): the file must be fully
// buffered before it's trustworthy enough to write anywhere, so content-sniffing (see
// fileSniffing.js) can run against the actual bytes before a single byte reaches disk. The
// client-supplied mimetype is checked here only as a cheap early reject — the real gate is the
// magic-byte check in singleAvatarUpload below; a file that passes this but fails that is still
// rejected before disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_SIZE_BYTES },
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
    'Unsupported file type. Only PNG, JPEG, GIF, or WebP images are allowed.'
  );
}

// Wraps multer's single-file handling so a bad upload (wrong type, too large, content that
// doesn't match its declared type) reaches the client as a normal 400 error-envelope response,
// not an unhandled exception. On success, writes the validated buffer to disk under a
// cryptographically random filename (crypto.randomUUID, not the client's originalname or a
// Date.now() timestamp) with the extension taken from the SNIFFED type — never the client-
// supplied one — and sets req.file.filename so route handlers are unchanged.
function singleAvatarUpload(req, res, next) {
  upload.single('avatar')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return sendError(
          res,
          400,
          'VALIDATION_ERROR',
          `Avatar must be ${AVATAR_MAX_SIZE_BYTES / (1024 * 1024)}MB or smaller.`
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
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), req.file.buffer);
    req.file.filename = filename;
    return next();
  });
}

module.exports = { singleAvatarUpload, AVATAR_MAX_SIZE_BYTES, UPLOAD_DIR };
