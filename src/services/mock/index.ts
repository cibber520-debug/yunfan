import rankCatalogJson from '../../data/mock/rank-lookup.json';
import recommendationCatalogJson from '../../data/mock/recommendations.json';
import referenceDataJson from '../../data/mock/reference-data.json';
import { examTypeLabel, ruleConstraints, uiConfig } from '../../config';
import { isRankLookupCatalog, isRecommendationCatalogResponse, isReferenceDataResponse } from '../../types/apiGuards';
import type { CandidateDto, GenerateRecommendationResponse, RankLookupResponse } from '../../types/api';
import type { RankLookupInput, RankLookupResult, Recommendation, RecommendationResult, RecommendationService, ReferenceDataService, RankService, WizardDraft } from '../../types/domain';
import { mapRankLookup, mapRecommendation, mapReferenceData, serviceError } from '../contracts';
import type { DataServices } from '../types';

const referenceData = (() => {
  if (!isReferenceDataResponse(referenceDataJson)) throw new Error('本地引用数据格式无效');
  return referenceDataJson;
})();
const rankCatalog = (() => {
  if (!isRankLookupCatalog(rankCatalogJson)) throw new Error('本地位次数据格式无效');
  return rankCatalogJson;
})();
const recommendationCatalog = (() => {
  if (!isRecommendationCatalogResponse(recommendationCatalogJson)) throw new Error('本地推荐数据格式无效');
  return recommendationCatalogJson;
})();

const delay = async (): Promise<void> => {
  if (import.meta.env.MODE !== 'test') await new Promise<void>((resolve) => window.setTimeout(resolve, 120));
};

class MockReferenceDataService implements ReferenceDataService {
  async getReferenceData() {
    await delay();
    return mapReferenceData(referenceData);
  }
  async getProvinces() {
    return (await this.getReferenceData()).provinces;
  }
  async getMajors(): Promise<string[]> {
    return (await this.getReferenceData()).majors;
  }
  async getRegions(): Promise<string[]> {
    return (await this.getReferenceData()).regions;
  }
}

class MockRankService implements RankService {
  async reverseLookup(input: RankLookupInput): Promise<RankLookupResult> {
    await delay();
    const province = referenceData.provinces.find((item) => item.code === input.province);
    if (province === undefined || !province.ready) throw serviceError('NOT_FOUND', '该省完整参考数据建设中', 'province');
    if (input.score < 0 || input.score > province.maxScore) throw serviceError('INVALID_INPUT', `总分须为 0–${province.maxScore}`, 'score');
    const segments = rankCatalog.segments.filter((item) => item.province === input.province && item.examType === input.examType);
    if (segments.length === 0) throw serviceError('NOT_FOUND', '暂无该省该科类的位次参考数据', 'province');
    const exact = segments.find((item) => item.score === input.score);
    const response: RankLookupResponse = exact === undefined
      ? estimateRank(input, segments)
      : { dataVersion: rankCatalog.version, updatedAt: rankCatalog.updatedAt, provinceRank: exact.rank, rankSegment: `${exact.score} 分 ≈ ${exact.lower}–${exact.upper} 名`, source: 'REFERENCE_DATA' };
    return mapRankLookup(response);
  }
}

function estimateRank(input: RankLookupInput, segments: typeof rankCatalog.segments): RankLookupResponse {
  const nearest = segments.reduce((current, item) => Math.abs(item.score - input.score) < Math.abs(current.score - input.score) ? item : current);
  const rank = Math.max(1, nearest.rank + (nearest.score - input.score) * 600);
  return { dataVersion: rankCatalog.version, updatedAt: rankCatalog.updatedAt, provinceRank: rank, rankSegment: `${input.score} 分估算约 ${rank - 200}–${rank + 200} 名`, source: 'ESTIMATE' };
}

class MockRecommendationService implements RecommendationService {
  async generate(draft: WizardDraft): Promise<RecommendationResult> {
    await delay();
    const province = referenceData.provinces.find((item) => item.code === draft.basic.province);
    const rank = draft.basic.provinceRank;
    const score = draft.basic.totalScore;
    if (province === undefined || !province.ready || rank === null || score === null) throw serviceError('INVALID_INPUT', '请先完成可用省份的信息采集');

    const eligible = (ignoreRejectedRegions: boolean): CandidateDto[] => recommendationCatalog.candidates
      .filter((item) => item.province === draft.basic.province && item.examType === draft.basic.examType)
      .filter((item) => item.requiredSubjects.every((subject) => draft.basic.subjects.includes(subject)))
      .filter((item) => !draft.preferences.blacklistedMajors.some((major) => item.majorName.includes(major)))
      .filter((item) => draft.preferences.ownership === 'ALL' || item.ownership === draft.preferences.ownership)
      .filter((item) => ignoreRejectedRegions || !draft.preferences.rejectedRegions.includes(item.region));
    const strictItems = eligible(false)
      .filter((item) => draft.preferences.schoolTiers.length === 0 || draft.preferences.schoolTiers.includes(item.schoolTier))
      .map(toRecommendation);
    const relaxedTierItems = eligible(false).map(toRecommendation);
    const relaxedRegionItems = eligible(true).map(toRecommendation);

    let items = strictItems;
    let degradation: GenerateRecommendationResponse['degradation'] = null;
    if (!hasCompleteDistribution(strictItems)) {
      if (hasCompleteDistribution(relaxedTierItems)) {
        items = relaxedTierItems;
        degradation = { level: 'L1', message: '已放宽：取消最低院校层次限制', details: '你的院校层次偏好不足以形成完整梯度，现保留选科、院校性质、地域排斥与专业黑名单等约束。' };
      } else {
        items = relaxedRegionItems;
        degradation = { level: 'L2', message: '已放宽：取消排斥城市限制', details: '放宽院校层次后仍不足以形成完整梯度，现继续移除地域排斥；选科、院校性质与专业黑名单仍严格保留。' };
      }
    }
    if (!hasCompleteDistribution(items)) throw serviceError('NOT_FOUND', `当前硬约束下无法形成完整梯度和至少 ${ruleConstraints.minimumCushionCount} 个垫档候选，请调整选科、院校性质或专业黑名单`);

    const response: GenerateRecommendationResponse = {
      dataVersion: recommendationCatalog.version,
      updatedAt: recommendationCatalog.updatedAt,
      profile: {
        province: draft.basic.province,
        provinceName: province.name,
        examType: draft.basic.examType,
        examTypeLabel: examTypeLabel(draft.basic.examType),
        totalScore: score,
        provinceRank: rank,
        subjects: [...draft.basic.subjects],
      },
      items,
      strictItems,
      degradation,
      generatedAt: new Date().toISOString(),
      disclaimer: recommendationCatalog.disclaimer,
    };
    return mapRecommendation(response);
  }
}

function hasCompleteDistribution(items: Recommendation[]): boolean {
  const required = new Set(items.map((item) => item.tier));
  const configuredTiers = uiConfig.recommendation.tiers.map((tier) => tier.code);
  const cushionTier = uiConfig.recommendation.tiers.find((tier) => tier.isCushion);
  const cushionCount = cushionTier === undefined
    ? 0
    : items.filter((item) => item.tier === cushionTier.code).length;
  return configuredTiers.every((tier) => required.has(tier))
    && cushionCount >= ruleConstraints.minimumCushionCount;
}

function toRecommendation(candidate: CandidateDto): Recommendation {
  return {
    id: candidate.id,
    schoolName: candidate.schoolName,
    majorName: candidate.majorName,
    groupName: candidate.groupName,
    tier: candidate.tier,
    probability: candidate.probability,
    confidence: candidate.confidence,
    tags: [...candidate.tags],
    reason: candidate.reason,
    predicted: candidate.predicted,
  };
}

export function createMockServices(): DataServices {
  return {
    referenceDataService: new MockReferenceDataService(),
    rankService: new MockRankService(),
    recommendationService: new MockRecommendationService(),
  };
}
