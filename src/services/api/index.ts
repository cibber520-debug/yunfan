import { isGenerateRecommendationResponse, isRankLookupResponse, isReferenceDataResponse } from '../../types/apiGuards';
import type { GenerateRecommendationRequest, GenerateRecommendationResponse, RankLookupRequest, RankLookupResponse, ReferenceDataResponse } from '../../types/api';
import type { RankLookupInput, RankLookupResult, RecommendationResult, RecommendationService, ReferenceDataService, RankService, ReferenceData, WizardDraft } from '../../types/domain';
import { mapRankLookup, mapRecommendation, mapReferenceData, serviceError } from '../contracts';
import type { DataServices } from '../types';

interface ApiClientOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
}

function apiBaseUrl(baseUrl: string | undefined): string {
  const value = baseUrl ?? import.meta.env.VITE_API_BASE_URL ?? '';
  return value.replace(/\/$/, '');
}

async function request<T>(path: string, init: RequestInit, guard: (value: unknown) => value is T, options: ApiClientOptions): Promise<T> {
  const fetcher = options.fetcher ?? window.fetch.bind(window);
  let response: Response;
  try {
    response = await fetcher(`${apiBaseUrl(options.baseUrl)}${path}`, init);
  } catch {
    throw serviceError('TEMPORARY_FAILURE', '网络请求失败，请检查连接后重试');
  }
  if (!response.ok) {
    if (response.status === 404) throw serviceError('NOT_FOUND', '请求的数据暂不可用');
    if (response.status >= 500) throw serviceError('TEMPORARY_FAILURE', '服务暂时不可用，请稍后重试');
    throw serviceError('INVALID_INPUT', '请求参数无效，请检查后重试');
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw serviceError('TEMPORARY_FAILURE', '服务返回格式无效，请稍后重试');
  }
  if (!guard(payload)) throw serviceError('TEMPORARY_FAILURE', '服务返回结构不兼容，请稍后重试');
  return payload;
}

class ApiReferenceDataService implements ReferenceDataService {
  constructor(private readonly options: ApiClientOptions) {}
  async getReferenceData(): Promise<ReferenceData> {
    const response = await request<ReferenceDataResponse>('/api/v1/reference-data', { headers: { Accept: 'application/json' } }, isReferenceDataResponse, this.options);
    return mapReferenceData(response);
  }
  async getProvinces() { return (await this.getReferenceData()).provinces; }
  async getMajors() { return (await this.getReferenceData()).majors; }
  async getRegions() { return (await this.getReferenceData()).regions; }
}

class ApiRankService implements RankService {
  constructor(private readonly options: ApiClientOptions) {}
  async reverseLookup(input: RankLookupInput): Promise<RankLookupResult> {
    const payload: RankLookupRequest = input;
    const response = await request<RankLookupResponse>('/api/v1/rank-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    }, isRankLookupResponse, this.options);
    return mapRankLookup(response);
  }
}

class ApiRecommendationService implements RecommendationService {
  constructor(private readonly options: ApiClientOptions) {}
  async generate(draft: WizardDraft): Promise<RecommendationResult> {
    const payload: GenerateRecommendationRequest = { draft };
    const response = await request<GenerateRecommendationResponse>('/api/v1/recommendations/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    }, isGenerateRecommendationResponse, this.options);
    return mapRecommendation(response);
  }
}

export function createApiServices(options: ApiClientOptions = {}): DataServices {
  return {
    referenceDataService: new ApiReferenceDataService(options),
    rankService: new ApiRankService(options),
    recommendationService: new ApiRecommendationService(options),
  };
}
