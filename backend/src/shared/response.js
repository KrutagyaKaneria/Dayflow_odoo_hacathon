/**
 * Shared response envelope helpers.
 *
 * Every endpoint in Dayflow MUST use these shapes (see shared/README.md):
 *   success: the handler's payload as-is
 *   error:   { error: { message, code } }
 */

function sendError(res, statusCode, code, message) {
  return res.status(statusCode).json({ error: { message, code } });
}

module.exports = { sendError };
