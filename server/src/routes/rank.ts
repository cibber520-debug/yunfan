import { Router } from 'express';
import { parseRankLookup, RankService } from '../services/rankService';
import { asyncHandler } from '../http/asyncHandler';

export function createRankRouter(service: RankService): Router {
  const router = Router();
  router.post(
    '/rank-lookup',
    asyncHandler(async (req, res) => {
      const input = parseRankLookup(req.body);
      const result = await service.reverseLookup(input);
      res.json(result);
    }),
  );
  return router;
}
