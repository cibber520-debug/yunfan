import type { ExamType, MajorCategory, Ownership, SchoolTier, SpecialIdentity, SubjectCode, Tier, WizardDraft } from './domain';

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

export interface CandidateDto extends RecommendationDto {
  province: string;
  examType: ExamType;
  lastRank: number;
  schoolTier: SchoolTier;
  ownership: Exclude<Ownership, 'ALL'>;
  region: string;
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

export interface RecommendationCatalogResponse {
  version: string;
  updatedAt: string;
  disclaimer: string;
  candidates: CandidateDto[];
}
