import { describe, expect, it } from 'vitest';
import { ruleConstraints, uiConfig } from '../config';
import { createReadyDraft, readyProvince } from '../test/mockDraft';
import { createMockServices } from './mock';

describe('确定性 Mock 服务', () => {
  const { rankService, recommendationService } = createMockServices();

  it('依据参考数据反查已就绪省份的位次', async () => {
    const result = await rankService.reverseLookup({
      province: readyProvince.code,
      examType: readyProvince.examType,
      score: 612,
    });
    expect(result).toMatchObject({ provinceRank: 15230, source: 'REFERENCE_DATA' });
    expect(result.dataVersion).toBeTruthy();
  });

  it('覆盖配置梯度、配置托底数量，并包含展示快照', async () => {
    const result = await recommendationService.generate(createReadyDraft());
    const tierCodes = uiConfig.recommendation.tiers.map((tier) => tier.code);
    const cushionTier = uiConfig.recommendation.tiers.find((tier) => tier.isCushion);

    expect(result.items.map((item) => item.tier)).toEqual(expect.arrayContaining(tierCodes));
    expect(result.items.filter((item) => item.tier === cushionTier?.code)).toHaveLength(ruleConstraints.minimumCushionCount);
    expect(result.profile).toMatchObject({
      province: readyProvince.code,
      provinceName: readyProvince.name,
      examType: readyProvince.examType,
    });
    expect(result.profile.examTypeLabel).toBeTruthy();
    expect(result.items.some((item) => item.predicted && item.confidence === .6)).toBe(true);
    expect(result.disclaimer).toContain('预测非承诺');
    expect(result.degradation).toBeNull();
  });

  it('地域排斥导致 L1 仍不完整时进入 L2，并保留黑名单硬约束', async () => {
    const draft = createReadyDraft();
    draft.preferences.rejectedRegions = ['大湾区'];
    const result = await recommendationService.generate(draft);
    expect(result.degradation?.level).toBe('L2');
    expect(result.items.every((item) => !item.majorName.includes('土木工程'))).toBe(true);
  });

  it('候选仅从当前省份与考试模式的数据集生成', async () => {
    const draft = createReadyDraft();
    draft.basic.examType = 'NEW_33';
    await expect(recommendationService.generate(draft)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: expect.stringContaining('无法形成完整梯度'),
    });
  });

  it('未就绪省份不会生成伪造推荐', async () => {
    const draft = createReadyDraft();
    draft.basic.province = 'NOT_READY';
    await expect(recommendationService.generate(draft)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: expect.stringContaining('请先完成'),
    });
  });
});
