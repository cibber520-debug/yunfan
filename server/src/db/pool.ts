import pg from 'pg';
import { config } from '../config';
import { logger } from '../logger';

/**
 * PostgreSQL 连接池（仅在 DATA_SOURCE=postgres 时被加载与使用）。
 * 所有连接设置边界超时，避免网络异常、长查询或锁等待无限占用 HTTP 请求。
 */
export const pool = new pg.Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  max: config.db.max,
  connectionTimeoutMillis: config.db.connectionTimeoutMs,
  query_timeout: config.db.queryTimeoutMs,
  statement_timeout: config.db.statementTimeoutMs,
  lock_timeout: config.db.lockTimeoutMs,
  idleTimeoutMillis: config.db.idleTimeoutMs,
  application_name: 'yunfan-backend',
});

pool.on('connect', () => {
  logger.debug('[pg] 已建立数据库连接');
});

pool.on('error', (err) => {
  // 连接池内部错误（如空闲连接断开）不应导致进程退出，仅记录。
  const code = (err as Error & { code?: unknown }).code;
  logger.error('[pg] 连接池异常', {
    message: err.message,
    ...(typeof code === 'string' ? { code } : {}),
  });
});
