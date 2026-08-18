export type ServiceErrorCode = 'INVALID_INPUT' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'CONFLICT' | 'TOO_MANY_REQUESTS' | 'TEMPORARY_FAILURE';

/**
 * 统一业务错误。HTTP 状态码由 code 推导，与前端 api/index.ts 的判定保持一致：
 * 404 -> NOT_FOUND，>=500 -> TEMPORARY_FAILURE，其余 -> INVALID_INPUT。
 */
export class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly field?: string;

  constructor(code: ServiceErrorCode, message: string, field?: string) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.field = field;
  }
}

export function serviceError(code: ServiceErrorCode, message: string, field?: string): ServiceError {
  return new ServiceError(code, message, field);
}

/**
 * 大模型调用相关错误。与业务错误分离：LLM 失败不应直接映射为 HTTP 5xx 返回给客户端，
 * 而是交由调用方（推荐服务）降级到本地引擎。
 */
export class LlmError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'LlmError';
    this.cause = cause;
  }
}

export function statusForCode(code: ServiceErrorCode): number {
  switch (code) {
    case 'INVALID_INPUT':
      return 400;
    case 'UNAUTHORIZED':
      return 401;
    case 'NOT_FOUND':
      return 404;
    case 'CONFLICT':
      return 409;
    case 'TOO_MANY_REQUESTS':
      return 429;
    case 'TEMPORARY_FAILURE':
      return 500;
    default:
      return 500;
  }
}
