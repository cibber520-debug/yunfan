import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { config } from './config';
import { ServiceError, statusForCode } from './errors';
import { logger } from './logger';
import type { Repository } from './repository/types';
import { ReferenceService } from './services/referenceService';
import { RankService } from './services/rankService';
import { RecommendationService } from './services/recommendationService';
import { createReferenceRouter } from './routes/reference';
import { createRankRouter } from './routes/rank';
import { createRecommendationRouter } from './routes/recommendation';
import { createAuthRouter } from './routes/auth';
import { createProfileRouter } from './routes/profile';
import { AuthService } from './auth/authService';
import { SmtpVerificationMailer } from './auth/mailer';
import { ConsoleSmsSender } from './auth/smsSender';
import { SessionService } from './auth/sessionService';
import type { LlmClient } from './services/llmClient';

export function createApp(repository: Repository, llm: LlmClient | null = null): Express {
  const app = express();
  app.set('trust proxy', config.trustProxy);

  // CORS：仅允许配置白名单中的前端来源；本地默认允许 127.0.0.1 与 localhost 两种开发地址。
  app.use(
    cors({
      origin(origin, callback) {
        if (origin === undefined || config.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  // 请求日志：request id 仅进日志，绝不作为指标标签（遵循方案可观测性约束）。
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = Math.random().toString(36).slice(2, 10);
    (req as Request & { requestId?: string }).requestId = requestId;
    const startedAt = Date.now();
    logger.debug('收到请求', { requestId, method: req.method, url: req.originalUrl });
    res.on('finish', () => {
      const ms = Date.now() - startedAt;
      logger.info('请求完成', {
        requestId,
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        ms,
      });
    });
    next();
  });

  const referenceService = new ReferenceService(repository);
  const rankService = new RankService(repository);
  const recommendationService = new RecommendationService(repository, llm);
  const sessionService = new SessionService();
  const authService = new AuthService(new SmtpVerificationMailer(), new ConsoleSmsSender(), sessionService);

  const api = express.Router();
  api.get('/health', (_req, res) => {
    res.json({ status: 'ok', dataSource: config.dataSource, time: new Date().toISOString() });
  });
  api.use(createReferenceRouter(referenceService));
  api.use(createRankRouter(rankService));
  api.use(createRecommendationRouter(recommendationService));
  api.use(createAuthRouter(authService, sessionService));
  api.use(createProfileRouter(authService, sessionService));
  app.use('/api/v1', api);

  app.use((req: Request, res: Response) => {
    const requestId = (req as Request & { requestId?: string }).requestId;
    logger.warn('未匹配路由', { requestId, method: req.method, url: req.originalUrl });
    res.status(404).json({ code: 'NOT_FOUND', message: '接口不存在' });
  });

  // 统一错误处理：业务错误按 code 推导 HTTP 状态；未预期错误降级为 TEMPORARY_FAILURE。
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ServiceError) {
      logger.warn('业务错误', { code: err.code, message: err.message, field: err.field });
      res.status(statusForCode(err.code)).json({
        code: err.code,
        message: err.message,
        ...(err.field !== undefined ? { field: err.field } : {}),
      });
      return;
    }
    logger.error('未处理异常', err);
    res.status(500).json({ code: 'TEMPORARY_FAILURE', message: '服务暂时不可用，请稍后重试' });
  });

  return app;
}
