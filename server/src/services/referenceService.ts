import type { Repository } from '../repository/types';
import type { ReferenceDataResponse } from '../contracts';

export class ReferenceService {
  constructor(private readonly repo: Repository) {}

  async getReferenceData(): Promise<ReferenceDataResponse> {
    return this.repo.getReferenceData();
  }
}
