import { readFile } from 'node:fs/promises';
import { pool } from '../src/db/pool';

async function main(): Promise<void> {
  const schema = await readFile(new URL('../src/db/auth-schema.sql', import.meta.url), 'utf8');
  await pool.query(schema);
  console.log('认证数据表迁移完成');
  await pool.end();
}

main().catch(async (error) => {
  console.error('认证数据表迁移失败：', error);
  try {
    await pool.end();
  } catch {
    // ignore shutdown error
  }
  process.exit(1);
});
