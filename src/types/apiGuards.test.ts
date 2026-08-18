import { describe, expect, it } from 'vitest';
import referenceDataJson from '../data/mock/reference-data.json';
import recommendationsJson from '../data/mock/recommendations.json';
import rankLookupJson from '../data/mock/rank-lookup.json';
import { isGenerateRecommendationResponse, isRankLookupCatalog, isRankLookupResponse, isRecommendationCatalogResponse, isReferenceDataResponse } from './apiGuards';

describe('API DTO 运行时结构校验', () => {
  it('接受版本化 Mock 数据目录', () => {
    expect(isReferenceDataResponse(referenceDataJson)).toBe(true);
    expect(isRankLookupCatalog(rankLookupJson)).toBe(true);
    expect(isRecommendationCatalogResponse(recommendationsJson)).toBe(true);
  });

  it('拒绝缺失关键字段或未知梯度的响应', () => {
    expect(isReferenceDataResponse({ ...referenceDataJson, optionCatalog: {} })).toBe(false);
    expect(isRankLookupResponse({ dataVersion: 'v1', updatedAt: 'now', provinceRank: 1, rankSegment: 'x', source: 'UNKNOWN' })).toBe(false);
    expect(isGenerateRecommendationResponse({
      dataVersion: 'v1',
      updatedAt: 'now',
      generatedAt: 'now',
      disclaimer: 'x',
      profile: {},
      items: [],
      strictItems: [],
    })).toBe(false);
  });
});
