import referenceDataJson from '../data/reference-data.json';
import rankCatalogJson from '../data/rank-lookup.json';
import recommendationCatalogJson from '../data/recommendations.json';
import type { ReferenceDataResponse, RankCatalog, RecommendationCatalog } from '../contracts';
import type { Repository } from './types';

const referenceData = referenceDataJson as unknown as ReferenceDataResponse;
const rankCatalog = rankCatalogJson as unknown as RankCatalog;
const recommendationCatalog = recommendationCatalogJson as unknown as RecommendationCatalog;

/** 阶段一：直接返回内嵌的写死测试数据，不依赖任何数据库。 */
export class SeedRepository implements Repository {
  async getReferenceData(): Promise<ReferenceDataResponse> {
    return referenceData;
  }

  async getRankCatalog(): Promise<RankCatalog> {
    return rankCatalog;
  }

  async getRecommendationCatalog(): Promise<RecommendationCatalog> {
    return recommendationCatalog;
  }
}
