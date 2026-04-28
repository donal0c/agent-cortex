import postgres from 'postgres';

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('FATAL: SUPABASE_DB_URL required');
  process.exit(1);
}

const sql = postgres(connectionString, { prepare: false });

async function enableRLS() {
  const tables = ['learnings', 'learning_links', 'thoughts', 'thought_links'];

  for (const table of tables) {
    try {
      await sql.unsafe(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      console.log(`RLS enabled on ${table}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`${table}: ${msg}`);
      continue;
    }

    try {
      await sql.unsafe(`DROP POLICY IF EXISTS deny_all_anon ON ${table}`);
      await sql.unsafe(`CREATE POLICY deny_all_anon ON ${table} FOR ALL TO anon USING (false)`);
      console.log(`  deny_all_anon policy added`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  anon policy: ${msg}`);
    }

    try {
      await sql.unsafe(`DROP POLICY IF EXISTS deny_all_authenticated ON ${table}`);
      await sql.unsafe(`CREATE POLICY deny_all_authenticated ON ${table} FOR ALL TO authenticated USING (false)`);
      console.log(`  deny_all_authenticated policy added`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  authenticated policy: ${msg}`);
    }
  }

  await sql.end();
  console.log('Done - all tables locked down via RLS');
}

enableRLS().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
