import { config } from '../config';
import type { Repository } from './types';
import { SeedRepository } from './seed';

/**
 * 根据配置创建存储实现。
 * - DATA_SOURCE=seed（默认）：返回写死数据，无需数据库。
 * - DATA_SOURCE=postgres：动态加载 PostgresRepository（避免在无数据库环境下加载 pg 连接）。
 */
export async function createRepository(): Promise<Repository> {
  if (config.dataSource === 'postgres') {
    const { PostgresRepository } = await import('./postgres');
    return new PostgresRepository();
  }
  return new SeedRepository();
}
