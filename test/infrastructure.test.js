import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const migrationDirectory = new URL('../supabase/migrations/', import.meta.url);

test('Supabase migration provisions private per-user cloud storage', async () => {
  const migrations = (await readdir(migrationDirectory)).filter((name) => name.endsWith('.sql'));
  assert.ok(migrations.length >= 1);

  const sql = await readFile(
    new URL(migrations.find((name) => name.endsWith('_create_atlas_cloud_storage.sql')), migrationDirectory),
    'utf8',
  );
  assert.match(sql, /alter table public\.atlas_documents enable row level security/i);
  assert.match(sql, /revoke all on table public\.atlas_documents from anon/i);
  assert.match(sql, /auth\.uid\(\)\) = user_id/i);
  assert.match(sql, /'atlas-note-files'.*false/s);
  assert.match(sql, /storage\.foldername\(name\).*auth\.uid\(\)/s);
  assert.match(sql, /for select to authenticated/i);
  assert.match(sql, /for insert to authenticated/i);
  assert.match(sql, /for update to authenticated/i);
});
