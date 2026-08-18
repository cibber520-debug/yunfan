/**
 * 后端响应契约类型，与前端 src/types/api.ts 一一对齐。
 * 这样后端返回的数据结构能直接通过前端的 is*Response 类型守卫。
 */

export type ExamType = 'OLD_ART' | 'OLD_SCI' | 'NEW_33' | 'NEW_312';
export type SubjectCode = 'PHY' | 'HIS' | 'CHE' | 'BIO' | 'POL' | 'GEO';
export type SchoolTier = '985' | '211' | 'DOUBLE_FIRST_CLASS' | 'PROVINCIAL' | 'PUBLIC' | 'PRIVATE' | 'VOCATIONAL';
export type Ownership = 'ALL' | 'PUBLIC' | 'PRIVATE';
export type MajorCategory = 'ENGINEERING' | 'MEDICINE' | 'SCIENCE' | 'ECONOMICS' | 'LITERATURE' | 'MANAGEMENT' | 'LAW' | 'AGRICULTURE';
export type SpecialIdentity = 'NONE' | 'NATIONAL_SPECIAL' | 'LOCAL_SPECIAL' | 'COLLEGE_SPECIAL' | 'STRONG_BASE' | 'ART_SPORT' | 'MINORITY_BONUS';
export type Tier = 'REACH' | 'MATCH' | 'SAFE' | 'CUSHION';

export interface ApiOption<T extends string = string> {
  code: T;
  label: string;
}

export type SubjectRuleDto =
  | { mode: 'FIRST_SECOND'; firstSubjects: SubjectCode[]; secondSubjects: SubjectCode[]; selectionCount: number; firstSubjectCount: number; secondSubjectCount: number; message: string }
  | { mode: 'ANY'; allowedSubjects: SubjectCode[]; selectionCount: number; message: string }
  | { mode: 'FIXED'; subjects: SubjectCode[]; message: string };

export interface ProvinceDto {
  code: string;
  name: string;
  examType: ExamType;
  maxScore: number;
  ready: boolean;
  ruleSummary: string;
  subjectRule: SubjectRuleDto;
  maxBonusScore: number;
}

export interface ReferenceDataResponse {
  version: string;
  updatedAt: string;
  provinces: ProvinceDto[];
  regions: string[];
  majors: string[];
  optionCatalog: {
    subjects: ApiOption<SubjectCode>[];
    schoolTiers: ApiOption<SchoolTier>[];
    ownership: ApiOption<Ownership>[];
    majorCategories: ApiOption<MajorCategory>[];
    identities: ApiOption<SpecialIdentity>[];
  };
}

export interface RankLookupRequest {
  province: string;
  examType: ExamType;
  score: number;
}

export interface RankLookupResponse {
  dataVersion: string;
  updatedAt: string;
  provinceRank: number;
  rankSegment: string;
  source: 'REFERENCE_DATA' | 'ESTIMATE';
}

export interface CandidateDto {
  id: string;
  province: string;
  examType: ExamType;
  schoolName: string;
  majorName: string;
  groupName: string;
  tier: Tier;
  probability: number;
  confidence: number;
  lastRank: number;
  schoolTier: SchoolTier;
  ownership: Exclude<Ownership, 'ALL'>;
  region: string;
  tags: string[];
  reason: string;
  predicted: boolean;
  requiredSubjects: SubjectCode[];
}

export interface RankSegmentDto {
  province: string;
  examType: ExamType;
  score: number;
  rank: number;
  lower: number;
  upper: number;
}

export interface RankCatalog {
  version: string;
  updatedAt: string;
  segments: RankSegmentDto[];
}

export interface RecommendationCatalog {
  version: string;
  updatedAt: string;
  disclaimer: string;
  candidates: CandidateDto[];
}

export interface RecommendationDto {
  id: string;
  schoolName: string;
  majorName: string;
  groupName: string;
  tier: Tier;
  probability: number;
  confidence: number;
  tags: string[];
  reason: string;
  predicted: boolean;
}

export interface GenerateRecommendationRequest {
  draft: WizardDraft;
}

export interface GenerateRecommendationResponse {
  dataVersion: string;
  updatedAt: string;
  profile: {
    province: string;
    provinceName?: string;
    examType: ExamType;
    examTypeLabel?: string;
    totalScore: number;
    provinceRank: number;
    subjects: SubjectCode[];
  };
  items: RecommendationDto[];
  strictItems: RecommendationDto[];
  degradation: { level: 'L1' | 'L2' | 'L5'; message: string; details: string } | null;
  generatedAt: string;
  disclaimer: string;
}

/** 前端提交志愿草稿（仅保留后端生成推荐所需字段）。 */
export interface WizardDraft {
  basic: {
    province: string;
    examType: ExamType;
    subjects: SubjectCode[];
    totalScore: number | null;
    provinceRank: number | null;
    rankSegment: string | null;
    identities: SpecialIdentity[];
    bonusScore: number | null;
  };
  preferences: {
    schoolTiers: SchoolTier[];
    ownership: Ownership;
    preferredRegions: string[];
    rejectedRegions: string[];
    majorCategories: MajorCategory[];
    preferredMajors: string[];
    blacklistedMajors: string[];
  };
  weights: { major: number; school: number; city: number };
}
