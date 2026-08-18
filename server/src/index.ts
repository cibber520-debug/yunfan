import { createApp } from './app';
import { config } from './config';
import { createRepository } from './repository';
import { createLlmClient } from './services/llmClient';
import { logger } from './logger';

async function main(): Promise<void> {
  const repository = await createRepository();
  const llm = createLlmClient();
  if (config.llm.enabled) {
    logger.info(`大模型已启用：${config.llm.model} @ ${config.llm.baseUrl}`);
  } else {
    logger.info('大模型未启用（未配置 DEEPSEEK_API_KEY 或 USE_LLM=false），推荐将回退本地引擎。');
  }
  const app = createApp(repository, llm);

  app.listen(config.port, config.host, () => {
    logger.info('云帆志愿后端已启动', { host: config.host, port: config.port, dataSource: config.dataSource });
    logger.info('接口：GET /api/v1/reference-data  POST /api/v1/rank-lookup  POST /api/v1/recommendations/generate');
    logger.info('认证：POST /api/v1/auth/send-code|register|login|logout  GET /api/v1/auth/me  GET/PUT /api/v1/profile');
  });
}

main().catch((err) => {
  logger.error('后端启动失败', err);
  process.exit(1);
});
