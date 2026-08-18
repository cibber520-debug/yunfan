import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** 包装 async 路由处理函数，自动把异常交给 Express 错误中间件。 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
