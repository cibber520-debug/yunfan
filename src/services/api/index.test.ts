import { describe, expect, it, vi } from 'vitest';
import referenceDataJson from '../../data/mock/reference-data.json';
import recommendationCatalogJson from '../../data/mock/recommendations.json';
import rankCatalogJson from '../../data/mock/rank-lookup.json';
import { createReadyDraft, readyProvince } from '../../test/mockDraft';
import { createApiServices } from '.';

function recommendationItem() {
  const candidate = recommendationCatalogJson.candidates[0];
  return {
    id: candidate.id,
    schoolName: candidate.schoolName,
    majorName: candidate.majorName,
    groupName: candidate.groupName,
    tier: candidate.tier,
    probability: candidate.probability,
    confidence: candidate.confidence,
    tags: candidate.tags,
    reason: candidate.reason,
    predicted: candidate.predicted,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('API 数据服务适配器', () => {
  it('按契约发送 GET 与 POST 请求并映射结果', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(referenceDataJson))
      .mockResolvedValueOnce(jsonResponse({
        dataVersion: rankCatalogJson.version,
        updatedAt: rankCatalogJson.updatedAt,
        provinceRank: 15230,
        rankSegment: '612 分 ≈ 15000–15300 名',
        source: 'REFERENCE_DATA',
      }))
      .mockResolvedValueOnce(jsonResponse({
        dataVersion: recommendationCatalogJson.version,
        updatedAt: recommendationCatalogJson.updatedAt,
        profile: {
          province: readyProvince.code,
          provinceName: readyProvince.name,
          examType: readyProvince.examType,
          examTypeLabel: '3+1+2（新高考）',
          totalScore: 612,
          provinceRank: 15230,
          subjects: ['PHY', 'CHE', 'BIO'],
        },
        items: [recommendationItem()],
        strictItems: [recommendationItem()],
        degradation: null,
        generatedAt: '2026-08-17T06:00:00.000Z',
        disclaimer: recommendationCatalogJson.disclaimer,
      }));
    const services = createApiServices({ baseUrl: 'https://example.test/', fetcher });

    await expect(services.referenceDataService.getReferenceData()).resolves.toMatchObject({
      version: referenceDataJson.version,
      provinces: expect.arrayContaining([expect.objectContaining({ code: readyProvince.code })]),
    });
    await expect(services.rankService.reverseLookup({ province: readyProvince.code, examType: readyProvince.examType, score: 612 })).resolves.toMatchObject({ provinceRank: 15230 });
    await expect(services.recommendationService.generate(createReadyDraft())).resolves.toMatchObject({
      profile: { provinceName: readyProvince.name, examTypeLabel: '3+1+2（新高考）' },
    });

    expect(fetcher).toHaveBeenNthCalledWith(1, 'https://example.test/api/v1/reference-data', { headers: { Accept: 'application/json' } });
    expect(fetcher).toHaveBeenNthCalledWith(2, 'https://example.test/api/v1/rank-lookup', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ province: readyProvince.code, examType: readyProvince.examType, score: 612 }),
    }));
    expect(fetcher).toHaveBeenNthCalledWith(3, 'https://example.test/api/v1/recommendations/generate', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ draft: createReadyDraft() }),
    }));
  });

  it.each([
    ['404', vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 })), 'NOT_FOUND'],
    ['5xx', vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 })), 'TEMPORARY_FAILURE'],
    ['非法 JSON', vi.fn<typeof fetch>().mockResolvedValue(new Response('{invalid', { status: 200 })), 'TEMPORARY_FAILURE'],
    ['结构不兼容', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ version: 'x' })), 'TEMPORARY_FAILURE'],
    ['网络失败', vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')), 'TEMPORARY_FAILURE'],
  ])('%s 会显式映射为服务错误', async (_label, fetcher, code) => {
    const services = createApiServices({ baseUrl: 'https://example.test', fetcher });
    await expect(services.referenceDataService.getReferenceData()).rejects.toMatchObject({ code });
  });
});
