import type { Recommendation, RecommendationResult, ReferenceData, ServiceError } from '../types/domain';
import type { GenerateRecommendationResponse, RankLookupResponse, ReferenceDataResponse } from '../types/api';

export function mapReferenceData(response: ReferenceDataResponse): ReferenceData {
  return {
    version: response.version,
    updatedAt: response.updatedAt,
    provinces: response.provinces.map((province) => ({ ...province })),
    regions: [...response.regions],
    majors: [...response.majors],
    optionCatalog: response.optionCatalog,
  };
}

export function mapRankLookup(response: RankLookupResponse) {
  return {
    provinceRank: response.provinceRank,
    rankSegment: response.rankSegment,
    source: response.source,
    dataVersion: response.dataVersion,
    updatedAt: response.updatedAt,
  };
}

export function mapRecommendation(response: GenerateRecommendationResponse): RecommendationResult {
  return {
    profile: {
      province: response.profile.province,
      ...(response.profile.provinceName === undefined ? {} : { provinceName: response.profile.provinceName }),
      examType: response.profile.examType,
      ...(response.profile.examTypeLabel === undefined ? {} : { examTypeLabel: response.profile.examTypeLabel }),
      totalScore: response.profile.totalScore,
      provinceRank: response.profile.provinceRank,
      subjects: [...response.profile.subjects],
    },
    items: response.items.map(mapRecommendationItem),
    strictItems: response.strictItems.map(mapRecommendationItem),
    degradation: response.degradation === null ? null : { ...response.degradation },
    generatedAt: response.generatedAt,
    disclaimer: response.disclaimer,
  };
}

function mapRecommendationItem(item: GenerateRecommendationResponse['items'][number]): Recommendation {
  return {
    id: item.id,
    schoolName: item.schoolName,
    majorName: item.majorName,
    groupName: item.groupName,
    tier: item.tier,
    probability: item.probability,
    confidence: item.confidence,
    tags: [...item.tags],
    reason: item.reason,
    predicted: item.predicted,
  };
}

export function serviceError(code: ServiceError['code'], message: string, field?: string): ServiceError {
  return field === undefined ? { code, message } : { code, message, field };
}
