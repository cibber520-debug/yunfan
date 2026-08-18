import pg from 'pg';
import { config } from '../config';
import { logger } from '../logger';

/**
 * PostgreSQL 连接池（仅在 DATA_SOURCE=postgres 时被加载与使用）。
 * 全部连接经连接池复用，遵循“最小权限 + 只读快照”的设计：
 * 在线查询只读 data_version 指向的 active 版本数据集。
 */
export const pool = new pg.Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  max: config.db.max,
});

pool.on('error', (err) => {
  // 连接池内部错误（如空闲连接断开）不应导致进程退出，仅记录。
  logger.error(`[pg] 连接池异常: ${err.message}`);
});
