import { config } from '../config';
import { LlmError } from '../errors';

export type LlmRole = 'system' | 'user' | 'assistant';

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface LlmClient {
  /** 调用大模型，返回文本（可能是 JSON 字符串）。失败时抛出 LlmError。 */
  complete(messages: LlmMessage[], options?: { temperature?: number }): Promise<string>;
}

/**
 * 创建大模型客户端。
 *
 * - 默认对接 DeepSeek OpenAI 兼容接口（base url 可配），模型名来自 LLM_MODEL。
 * - 当 USE_LLM=false 或未配置 DEEPSEEK_API_KEY 时返回 null，调用方应回退到本地引擎。
 */
export function createLlmClient(): LlmClient | null {
  const { llm } = config;
  if (!llm.enabled) return null;
  return {
    async complete(messages, options) {
      const base = llm.baseUrl.replace(/\/$/, '');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), llm.timeoutMs);
      try {
        const res = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${llm.apiKey}`,
          },
          body: JSON.stringify({
            model: llm.model,
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
            temperature: options?.temperature ?? 0.7,
            response_format: { type: 'json_object' },
            stream: false,
          }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new LlmError(`LLM 接口返回 ${res.status}: ${text.slice(0, 200)}`);
        }
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = data.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || content.trim().length === 0) {
          throw new LlmError('LLM 返回内容为空');
        }
        return content;
      } catch (err) {
        if (err instanceof LlmError) throw err;
        if (err instanceof Error && err.name === 'AbortError') {
          throw new LlmError(`LLM 请求超时（>${Math.round(llm.timeoutMs / 1000)}s）`, err);
        }
        throw new LlmError(`LLM 请求失败: ${(err as Error).message}`, err);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
