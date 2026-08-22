const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { sendError } = require('../../shared/response');

const UPLOAD_DIR = path.join(__dirname, '..', '..', '..', 'uploads', 'avatars');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// [RECOMMENDATION] Neither source document specifies a max avatar size or storage backend.
// 2MB / local disk is a documented default for this phase — revisit if a later phase introduces
// real object storage (S3 etc.).
const AVATAR_MAX_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.user.id}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: AVATAR_MAX_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('UNSUPPORTED_FILE_TYPE'));
    }
    cb(null, true);
  },
});

// Wraps multer's single-file handling so a bad upload (wrong type, too large) reaches the
// client as a normal 400 error-envelope response, not an unhandled exception — multer reports
// both failure modes via a callback error rather than throwing synchronously.
function singleAvatarUpload(req, res, next) {
  upload.single('avatar')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return sendError(
        res,
        400,
        'VALIDATION_ERROR',
        `Avatar must be ${AVATAR_MAX_SIZE_BYTES / (1024 * 1024)}MB or smaller.`
      );
    }
    return sendError(
      res,
      400,
      'VALIDATION_ERROR',
      'Unsupported file type. Only PNG, JPEG, GIF, or WebP images are allowed.'
    );
  });
}

module.exports = { singleAvatarUpload, AVATAR_MAX_SIZE_BYTES, UPLOAD_DIR };
