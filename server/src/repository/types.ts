import type { ReferenceDataResponse, RankCatalog, RecommendationCatalog } from '../contracts';

/**
 * 存储抽象：阶段一用 SeedRepository（写死数据，无数据库），
 * 阶段二用 PostgresRepository。通过 config.dataSource 切换，业务服务不感知底层数据源。
 */
export interface Repository {
  getReferenceData(): Promise<ReferenceDataResponse>;
  getRankCatalog(): Promise<RankCatalog>;
  getRecommendationCatalog(): Promise<RecommendationCatalog>;
}
