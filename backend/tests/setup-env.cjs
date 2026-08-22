const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

if (!process.env.DATABASE_URL_TEST) {
  throw new Error(
    'DATABASE_URL_TEST is not set. Copy backend/.env.example to backend/.env first.'
  );
}

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
module.exports = {};
