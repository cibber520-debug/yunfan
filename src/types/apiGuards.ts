import type {
  CandidateDto,
  GenerateRecommendationResponse,
  RankLookupResponse,
  RankSegmentDto,
  RecommendationCatalogResponse,
  ReferenceDataResponse,
} from './api';

const subjectCodes = new Set(['PHY', 'HIS', 'CHE', 'BIO', 'POL', 'GEO']);
const examTypes = new Set(['OLD_ART', 'OLD_SCI', 'NEW_33', 'NEW_312']);
const tierCodes = new Set(['REACH', 'MATCH', 'SAFE', 'CUSHION']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function hasVersionedEnvelope(value: Record<string, unknown>): boolean {
  return typeof value.version === 'string' && typeof value.updatedAt === 'string';
}

function isOption(value: unknown): boolean {
  return isRecord(value) && typeof value.code === 'string' && typeof value.label === 'string';
}

function isOptionCatalog(value: Record<string, unknown>): boolean {
  return ['subjects', 'schoolTiers', 'ownership', 'majorCategories', 'identities']
    .every((key) => Array.isArray(value[key]) && value[key].every((item) => isOption(item)));
}

export function isReferenceDataResponse(value: unknown): value is ReferenceDataResponse {
  if (!isRecord(value) || !hasVersionedEnvelope(value) || !Array.isArray(value.provinces) || !isStringArray(value.regions) || !isStringArray(value.majors) || !isRecord(value.optionCatalog)) return false;
  return value.provinces.every((province) => isProvince(province))
    && isOptionCatalog(value.optionCatalog);
}

function isProvince(value: unknown): boolean {
  if (!isRecord(value) || typeof value.code !== 'string' || typeof value.name !== 'string' || !examTypes.has(String(value.examType)) || typeof value.maxScore !== 'number' || typeof value.ready !== 'boolean' || typeof value.ruleSummary !== 'string' || typeof value.maxBonusScore !== 'number' || !isRecord(value.subjectRule)) return false;
  const rule = value.subjectRule;
  if (rule.mode === 'FIXED') return isStringArray(rule.subjects) && typeof rule.message === 'string';
  if (rule.mode === 'ANY') return isStringArray(rule.allowedSubjects) && typeof rule.selectionCount === 'number' && typeof rule.message === 'string';
  return rule.mode === 'FIRST_SECOND' && isStringArray(rule.firstSubjects) && isStringArray(rule.secondSubjects) && typeof rule.selectionCount === 'number' && typeof rule.firstSubjectCount === 'number' && typeof rule.secondSubjectCount === 'number' && typeof rule.message === 'string';
}

export function isRankLookupCatalog(value: unknown): value is { version: string; updatedAt: string; segments: RankSegmentDto[] } {
  return isRecord(value) && hasVersionedEnvelope(value) && Array.isArray(value.segments) && value.segments.every((item) => isRankSegment(item));
}

function isRankSegment(value: unknown): value is RankSegmentDto {
  return isRecord(value) && typeof value.province === 'string' && examTypes.has(String(value.examType)) && ['score', 'rank', 'lower', 'upper'].every((key) => typeof value[key] === 'number');
}

export function isRecommendationCatalogResponse(value: unknown): value is RecommendationCatalogResponse {
  return isRecord(value) && hasVersionedEnvelope(value) && typeof value.disclaimer === 'string' && Array.isArray(value.candidates) && value.candidates.every((item) => isCandidate(item));
}

function isCandidate(value: unknown): value is CandidateDto {
  return isRecord(value)
    && ['id', 'schoolName', 'majorName', 'groupName', 'province', 'examType', 'schoolTier', 'ownership', 'region', 'reason'].every((key) => typeof value[key] === 'string')
    && examTypes.has(String(value.examType))
    && tierCodes.has(String(value.tier))
    && typeof value.probability === 'number'
    && typeof value.confidence === 'number'
    && typeof value.predicted === 'boolean'
    && typeof value.lastRank === 'number'
    && isStringArray(value.tags)
    && isStringArray(value.requiredSubjects)
    && value.requiredSubjects.every((item) => subjectCodes.has(item));
}

export function isRankLookupResponse(value: unknown): value is RankLookupResponse {
  return isRecord(value) && typeof value.dataVersion === 'string' && typeof value.updatedAt === 'string' && typeof value.provinceRank === 'number' && typeof value.rankSegment === 'string' && (value.source === 'REFERENCE_DATA' || value.source === 'ESTIMATE');
}

function isProfile(value: unknown): boolean {
  return isRecord(value)
    && typeof value.province === 'string'
    && (value.provinceName === undefined || typeof value.provinceName === 'string')
    && examTypes.has(String(value.examType))
    && (value.examTypeLabel === undefined || typeof value.examTypeLabel === 'string')
    && typeof value.totalScore === 'number'
    && typeof value.provinceRank === 'number'
    && isStringArray(value.subjects)
    && value.subjects.every((item) => subjectCodes.has(item));
}

function isDegradation(value: unknown): boolean {
  return value === null || (isRecord(value)
    && ['L1', 'L2', 'L5'].includes(String(value.level))
    && typeof value.message === 'string'
    && typeof value.details === 'string');
}

export function isGenerateRecommendationResponse(value: unknown): value is GenerateRecommendationResponse {
  return isRecord(value) && typeof value.dataVersion === 'string' && typeof value.updatedAt === 'string' && typeof value.generatedAt === 'string' && typeof value.disclaimer === 'string' && isProfile(value.profile) && Array.isArray(value.items) && Array.isArray(value.strictItems) && value.items.every((item) => isCandidateLike(item)) && value.strictItems.every((item) => isCandidateLike(item)) && isDegradation(value.degradation);
}

function isCandidateLike(value: unknown): boolean {
  return isRecord(value) && ['id', 'schoolName', 'majorName', 'groupName', 'reason'].every((key) => typeof value[key] === 'string') && tierCodes.has(String(value.tier)) && typeof value.probability === 'number' && typeof value.confidence === 'number' && isStringArray(value.tags) && typeof value.predicted === 'boolean';
}
