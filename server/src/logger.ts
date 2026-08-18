import fs from 'node:fs';
import path from 'node:path';
import { config, isProduction } from './config';

/**
 * 集中式日志系统（零第三方依赖）：
 *  - 控制台：实时输出。error/warn 走 stderr，其余走 stdout；开发模式带 ANSI 颜色。
 *  - 文件：按天滚动落盘到 logs/yunfan-YYYY-MM-DD.log。日志先入内存缓冲，再定时批量写盘
 *    （LOG_FLUSH_MS，默认 1s），以保证“定时写盘”、降低 IO 次数；进程正常退出或捕获到异常时
 *    强制立即刷盘，避免缓冲丢失。保留最近 LOG_MAX_DAYS 天（默认 14），过期自动清理。
 * 设计取舍：不引入 winston/pino 等库，降低供应链与安装风险，且完全可控；对本地排查与演示足够。
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type LogLevel = keyof typeof LEVELS;

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const MAX_DAYS = Math.max(1, Number(process.env.LOG_MAX_DAYS ?? 14));
const FLUSH_MS = Math.max(200, Number(process.env.LOG_FLUSH_MS ?? 1000));
const USE_COLOR = !isProduction && Boolean(process.stdout.isTTY);

interface LogRecord {
  ts: string;
  level: LogLevel;
  ns: string;
  msg: string;
  meta?: unknown;
}

const buffer: LogRecord[] = [];
let flushTimer: NodeJS.Timeout | null = null;
let lastPrunedDate = '';

const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};
const RESET = '\x1b[0m';

function localDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function stringifyMeta(meta: unknown): string {
  if (meta instanceof Error) return `${meta.name}: ${meta.message}`;
  if (typeof meta === 'string') return meta;
  try {
    return JSON.stringify(meta);
  } catch {
    return String(meta);
  }
}

function consoleLine(r: LogRecord): string {
  const t = r.ts.slice(11, 23); // HH:MM:SS.mmm
  const head = `${t} ${r.level.toUpperCase().padEnd(5)} [${r.ns}]`;
  const headColored = USE_COLOR ? `${COLORS[r.level]}${head}${RESET}` : head;
  const meta = r.meta !== undefined ? ` | ${stringifyMeta(r.meta)}` : '';
  return `${headColored} ${r.msg}${meta}`;
}

function fileLine(r: LogRecord): string {
  const meta = r.meta !== undefined ? ` | ${stringifyMeta(r.meta)}` : '';
  return `${r.ts} ${r.level.toUpperCase()} [${r.ns}] ${r.msg}${meta}`;
}

function ensureDirAndPrune(date: string): void {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    /* 忽略：目录已存在或权限问题交由下方写盘报错暴露 */
  }
  if (date === lastPrunedDate) return;
  lastPrunedDate = date;
  try {
    const cutoff = Date.now() - MAX_DAYS * 86400000;
    for (const f of fs.readdirSync(LOG_DIR)) {
      if (!f.startsWith('yunfan-') || !f.endsWith('.log')) continue;
      const ds = f.slice('yunfan-'.length, -'.log'.length);
      const t = Date.parse(`${ds}T00:00:00`);
      if (!Number.isNaN(t) && t < cutoff) {
        try {
          fs.rmSync(path.join(LOG_DIR, f));
        } catch {
          /* 忽略单文件删除失败 */
        }
      }
    }
  } catch {
    /* 忽略读取失败 */
  }
}

/** 把缓冲日志批量写盘（定时写盘的核心）。同步写入，保证异常退出不丢日志。 */
export function flushLogs(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  if (buffer.length === 0) return;
  const records = buffer.splice(0, buffer.length);
  const date = localDate();
  ensureDirAndPrune(date);
  const text = records.map(fileLine).join('\n') + '\n';
  try {
    fs.appendFileSync(path.join(LOG_DIR, `yunfan-${date}.log`), text);
  } catch (err) {
    process.stderr.write(`[logger] 写盘失败: ${(err as Error).message}\n`);
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setInterval(flushLogs, FLUSH_MS);
  if (typeof flushTimer.unref === 'function') flushTimer.unref();
}

class Logger {
  constructor(public readonly ns: string = 'app') {}

  private emit(level: LogLevel, msg: string, meta?: unknown): void {
    const threshold = (LEVELS as Record<string, number>)[config.logLevel] ?? LEVELS.info;
    if (LEVELS[level] < threshold) return;
    const rec: LogRecord = { ts: new Date().toISOString(), level, ns: this.ns, msg, meta };
    const line = consoleLine(rec);
    if (level === 'error' || level === 'warn') process.stderr.write(line + '\n');
    else process.stdout.write(line + '\n');
    buffer.push(rec);
    scheduleFlush();
  }

  debug(msg: string, meta?: unknown): void {
    this.emit('debug', msg, meta);
  }
  info(msg: string, meta?: unknown): void {
    this.emit('info', msg, meta);
  }
  warn(msg: string, meta?: unknown): void {
    this.emit('warn', msg, meta);
  }
  error(msg: string, meta?: unknown): void {
    this.emit('error', msg, meta);
    flushLogs();
  }

  /** 派生带命名空间的子 logger，便于按模块区分日志来源。 */
  child(ns: string): Logger {
    return new Logger(this.ns ? `${this.ns}:${ns}` : ns);
  }
}

export const logger = new Logger('app');

// 退出/异常时强制刷盘，避免缓冲日志丢失。
let exitHandlersBound = false;
function bindExitHandlers(): void {
  if (exitHandlersBound) return;
  exitHandlersBound = true;
  process.on('exit', () => flushLogs());
  process.on('SIGINT', () => {
    flushLogs();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    flushLogs();
    process.exit(0);
  });
  process.on('uncaughtException', (err) => {
    logger.error('uncaughtException', err);
    flushLogs();
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandledRejection', reason);
  });
}
bindExitHandlers();

export default logger;
