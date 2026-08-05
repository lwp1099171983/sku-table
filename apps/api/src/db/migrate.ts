import { readdir, readFile } from 'node:fs/promises'
import { pool } from './client.js'

const migrationsUrl = new URL('./migrations/', import.meta.url)

async function migrate() {
  const client = await pool.connect()

  try {
    await client.query(`
      create table if not exists schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      )
    `)

    const files = (await readdir(migrationsUrl))
      .filter((file) => file.endsWith('.sql'))
      .sort()

    for (const file of files) {
      const version = file.replace(/\.sql$/, '')
      const applied = await client.query('select 1 from schema_migrations where version = $1', [version])
      if (applied.rowCount) {
        continue
      }

      const sql = await readFile(new URL(file, migrationsUrl), 'utf8')
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('insert into schema_migrations (version) values ($1)', [version])
        await client.query('COMMIT')
        console.log(`数据库迁移完成：${version}`)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }

    console.log('数据库迁移检查完成。')
  } finally {
    client.release()
    await pool.end()
  }
}

void migrate().catch((error) => {
  console.error('数据库迁移失败。', error)
  process.exitCode = 1
})
