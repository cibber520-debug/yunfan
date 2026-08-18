import { Router } from 'express';
import type { ReferenceService } from '../services/referenceService';
import { asyncHandler } from '../http/asyncHandler';

export function createReferenceRouter(service: ReferenceService): Router {
  const router = Router();
  router.get(
    '/reference-data',
    asyncHandler(async (_req, res) => {
      const data = await service.getReferenceData();
      res.json(data);
    }),
  );
  return router;
}
