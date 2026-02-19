import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';
import { query, testConnection } from './db.js';
import { seed } from './seed.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function init() {
  console.log('Initializing database...');

  const connected = await testConnection();
  if (!connected) {
    console.error('Could not connect to database. Check your DATABASE_URL in .env');
    process.exit(1);
  }

  // Read and run schema (strip comments, run each CREATE statement)
  const schemaPath = path.join(__dirname, 'schema.sql');
  let schema = fs.readFileSync(schemaPath, 'utf8');
  schema = schema.replace(/--[^\n]*/g, '').trim();

  const statements = schema
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    const lower = stmt.toLowerCase();
    if (lower.includes('create table') || lower.includes('create index') || lower.includes('alter table')) {
      try {
        await query(stmt + ';');
        const preview = stmt.replace(/\s+/g, ' ').substring(0, 60);
        console.log('  -', preview + '...');
      } catch (err) {
        if (err.code === '42P07' || err.code === '42710') {
          console.log('  - Already exists, skipping');
        } else {
          throw err;
        }
      }
    }
  }

  // Migration: add is_super_admin to existing users table
  try {
    await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false');
    console.log('  - Migration: is_super_admin column');
  } catch (err) {
    if (err.code !== '42701') throw err; // column already exists
  }

  await seed();
  console.log('Database initialized successfully.');
}

init().catch((err) => {
  console.error(err);
  process.exit(1);
});
