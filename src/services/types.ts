import type { RankService, RecommendationService, ReferenceDataService } from '../types/domain';

export interface DataServices {
  referenceDataService: ReferenceDataService;
  rankService: RankService;
  recommendationService: RecommendationService;
}
