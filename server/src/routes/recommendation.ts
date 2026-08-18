import { Router } from 'express';
import { parseDraft, RecommendationService } from '../services/recommendationService';
import { asyncHandler } from '../http/asyncHandler';

export function createRecommendationRouter(service: RecommendationService): Router {
  const router = Router();
  router.post(
    '/recommendations/generate',
    asyncHandler(async (req, res) => {
      const draft = parseDraft(req.body);
      const result = await service.generate(draft);
      res.json(result);
    }),
  );
  return router;
}
