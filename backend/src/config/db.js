const { PrismaClient } = require('@prisma/client');
const { loadConfig } = require('./env');

const config = loadConfig();

const prisma = new PrismaClient({
  datasources: { db: { url: config.databaseUrl } },
});

async function checkDbConnection() {
  await prisma.$queryRaw`SELECT 1`;
}

module.exports = { prisma, checkDbConnection, config };
