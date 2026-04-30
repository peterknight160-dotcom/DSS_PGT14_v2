//Module for database variables and intitialising postgres pool -Vin

const { Pool } = require('pg');

const db = new Pool({
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT || 5432,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
});

const USERS_TABLE = 'public.users';

async function verifyDatabaseConnection() {
    await db.query('SELECT NOW()');
    console.log('Postgres connected')
};

module.exports = { db, USERS_TABLE, verifyDatabaseConnection }