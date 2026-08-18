export type ProvinceCode = string;
export type ExamType = 'OLD_ART' | 'OLD_SCI' | 'NEW_33' | 'NEW_312';
export type SubjectCode = 'PHY' | 'HIS' | 'CHE' | 'BIO' | 'POL' | 'GEO';
export type SpecialIdentity =
  | 'NONE'
  | 'NATIONAL_SPECIAL'
  | 'LOCAL_SPECIAL'
  | 'COLLEGE_SPECIAL'
  | 'STRONG_BASE'
  | 'ART_SPORT'
  | 'MINORITY_BONUS';
export type SchoolTier = '985' | '211' | 'DOUBLE_FIRST_CLASS' | 'PROVINCIAL' | 'PUBLIC' | 'PRIVATE' | 'VOCATIONAL';
export type Ownership = 'ALL' | 'PUBLIC' | 'PRIVATE';
export type MajorCategory = 'ENGINEERING' | 'MEDICINE' | 'SCIENCE' | 'ECONOMICS' | 'LITERATURE' | 'MANAGEMENT' | 'LAW' | 'AGRICULTURE';
export type Tier = 'REACH' | 'MATCH' | 'SAFE' | 'CUSHION';

export interface CodeOption<T extends string = string> {
  code: T;
  label: string;
}

export type SubjectRule =
  | {
    mode: 'FIRST_SECOND';
    firstSubjects: SubjectCode[];
    secondSubjects: SubjectCode[];
    selectionCount: number;
    firstSubjectCount: number;
    secondSubjectCount: number;
    message: string;
  }
  | { mode: 'ANY'; allowedSubjects: SubjectCode[]; selectionCount: number; message: string }
  | { mode: 'FIXED'; subjects: SubjectCode[]; message: string };

export interface Weights {
  major: number;
  school: number;
  city: number;
}

export interface BasicProfile {
  province: ProvinceCode;
  examType: ExamType;
  subjects: SubjectCode[];
  totalScore: number | null;
  provinceRank: number | null;
  rankSegment: string | null;
  identities: SpecialIdentity[];
  bonusScore: number | null;
}

export interface PreferenceProfile {
  schoolTiers: SchoolTier[];
  ownership: Ownership;
  preferredRegions: string[];
  rejectedRegions: string[];
  majorCategories: MajorCategory[];
  preferredMajors: string[];
  blacklistedMajors: string[];
}

export interface WizardDraft {
  basic: BasicProfile;
  preferences: PreferenceProfile;
  weights: Weights;
}

export interface CandidateProfile {
  province: ProvinceCode;
  provinceName?: string;
  examType: ExamType;
  examTypeLabel?: string;
  totalScore: number;
  provinceRank: number;
  subjects: SubjectCode[];
}

export interface Recommendation {
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

export interface DegradationNotice {
  level: 'L1' | 'L2' | 'L5';
  message: string;
  details: string;
}

export interface RecommendationResult {
  profile: CandidateProfile;
  items: Recommendation[];
  strictItems: Recommendation[];
  degradation: DegradationNotice | null;
  generatedAt: string;
  disclaimer: string;
}

export interface AppState {
  wizardDraft: WizardDraft;
  completedStep: number;
  recommendationResult: RecommendationResult | null;
  selectedVolunteerIds: string[];
  schemaVersion: number;
}

export interface ReferenceData {
  version: string;
  updatedAt: string;
  provinces: ProvinceConfig[];
  regions: string[];
  majors: string[];
  optionCatalog: {
    subjects: CodeOption<SubjectCode>[];
    schoolTiers: CodeOption<SchoolTier>[];
    ownership: CodeOption<Ownership>[];
    majorCategories: CodeOption<MajorCategory>[];
    identities: CodeOption<SpecialIdentity>[];
  };
}

export interface ProvinceConfig {
  code: ProvinceCode;
  name: string;
  examType: ExamType;
  maxScore: number;
  ready: boolean;
  ruleSummary: string;
  subjectRule: SubjectRule;
  maxBonusScore: number;
}

export interface RankLookupInput {
  province: ProvinceCode;
  examType: ExamType;
  score: number;
}

export interface RankLookupResult {
  provinceRank: number;
  rankSegment: string;
  source: 'REFERENCE_DATA' | 'ESTIMATE';
  dataVersion: string;
  updatedAt: string;
}

export interface ServiceError {
  code: 'INVALID_INPUT' | 'NOT_FOUND' | 'TEMPORARY_FAILURE';
  message: string;
  field?: string;
}

export interface ReferenceDataService {
  getReferenceData(): Promise<ReferenceData>;
  getProvinces(): Promise<ProvinceConfig[]>;
  getMajors(): Promise<string[]>;
  getRegions(): Promise<string[]>;
}

export interface RankService {
  reverseLookup(input: RankLookupInput): Promise<RankLookupResult>;
}

export interface RecommendationService {
  generate(draft: WizardDraft): Promise<RecommendationResult>;
}
