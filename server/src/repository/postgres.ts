import { pool } from '../db/pool';
import type { Repository } from './types';
import type {
  ReferenceDataResponse,
  RankCatalog,
  RecommendationCatalog,
  ProvinceDto,
  ApiOption,
  RankSegmentDto,
  CandidateDto,
  ExamType,
  SubjectCode,
  SchoolTier,
  Ownership,
  SpecialIdentity,
  MajorCategory,
  Tier,
} from '../contracts';
import { serviceError } from '../errors';

interface DataVersionRow {
  version_label: string;
  updated_at: string;
  disclaimer: string;
}

async function activeVersion(): Promise<DataVersionRow> {
  const { rows } = await pool.query<DataVersionRow>(
    `SELECT version_label, updated_at, disclaimer
       FROM data_version
      WHERE active = true
      ORDER BY updated_at DESC
      LIMIT 1`,
  );
  if (rows.length === 0) {
    throw serviceError('TEMPORARY_FAILURE', '数据版本未初始化，请先执行 npm run db:seed');
  }
  return rows[0];
}

/** 阶段二：PostgreSQL 仓储，只读 active 数据版本，保证推荐与数据版本可追溯。 */
export class PostgresRepository implements Repository {
  async getReferenceData(): Promise<ReferenceDataResponse> {
    const dv = await activeVersion();

    const prov = await pool.query<{
      code: string;
      name: string;
      exam_type: ExamType;
      max_score: number;
      ready: boolean;
      rule_summary: string;
      subject_rule: ProvinceDto['subjectRule'];
      max_bonus_score: number;
    }>(
      `SELECT code, name, exam_type, max_score, ready, rule_summary, subject_rule, max_bonus_score
         FROM province_rule
        WHERE data_version_id = (SELECT id FROM data_version WHERE active = true ORDER BY updated_at DESC LIMIT 1)
        ORDER BY code`,
    );
    const provinces: ProvinceDto[] = prov.rows.map((r) => ({
      code: r.code,
      name: r.name,
      examType: r.exam_type,
      maxScore: Number(r.max_score),
      ready: r.ready,
      ruleSummary: r.rule_summary,
      subjectRule: r.subject_rule,
      maxBonusScore: Number(r.max_bonus_score),
    }));

    const regionsRes = await pool.query<{ name: string }>('SELECT name FROM reference_region ORDER BY id');
    const majorsRes = await pool.query<{ name: string }>('SELECT name FROM reference_major ORDER BY id');
    const optRes = await pool.query<{ catalog: string; code: string; label: string }>(
      'SELECT catalog, code, label FROM option_item ORDER BY sort_order',
    );
    const group: Record<string, ApiOption[]> = {};
    for (const r of optRes.rows) {
      (group[r.catalog] ??= []).push({ code: r.code, label: r.label });
    }

    return {
      version: dv.version_label,
      updatedAt: dv.updated_at,
      provinces,
      regions: regionsRes.rows.map((r) => r.name),
      majors: majorsRes.rows.map((r) => r.name),
      optionCatalog: {
        subjects: group['subjects'] as ApiOption<SubjectCode>[],
        schoolTiers: group['schoolTiers'] as ApiOption<SchoolTier>[],
        ownership: group['ownership'] as ApiOption<Ownership>[],
        majorCategories: group['majorCategories'] as ApiOption<MajorCategory>[],
        identities: group['identities'] as ApiOption<SpecialIdentity>[],
      },
    };
  }

  async getRankCatalog(): Promise<RankCatalog> {
    const dv = await activeVersion();
    const res = await pool.query<{
      province: string;
      exam_type: ExamType;
      score: number;
      rank: number;
      lower: number;
      upper: number;
    }>(
      `SELECT province, exam_type, score, rank, lower, upper
         FROM score_segment
        WHERE data_version_id = (SELECT id FROM data_version WHERE active = true ORDER BY updated_at DESC LIMIT 1)`,
    );
    const segments: RankSegmentDto[] = res.rows.map((r) => ({
      province: r.province,
      examType: r.exam_type,
      score: Number(r.score),
      rank: Number(r.rank),
      lower: Number(r.lower),
      upper: Number(r.upper),
    }));
    return { version: dv.version_label, updatedAt: dv.updated_at, segments };
  }

  async getRecommendationCatalog(): Promise<RecommendationCatalog> {
    const dv = await activeVersion();
    const res = await pool.query<{
      id: string;
      province: string;
      exam_type: ExamType;
      school_name: string;
      major_name: string;
      group_name: string;
      tier: Tier;
      probability: number;
      confidence: number;
      last_rank: number;
      school_tier: SchoolTier;
      ownership: Exclude<Ownership, 'ALL'>;
      region: string;
      tags: string[];
      reason: string;
      predicted: boolean;
      required_subjects: SubjectCode[];
    }>(
      `SELECT id, province, exam_type, school_name, major_name, group_name, tier,
              probability, confidence, last_rank, school_tier, ownership, region,
              tags, reason, predicted, required_subjects
         FROM candidate
        WHERE data_version_id = (SELECT id FROM data_version WHERE active = true ORDER BY updated_at DESC LIMIT 1)`,
    );
    const candidates: CandidateDto[] = res.rows.map((r) => ({
      id: r.id,
      province: r.province,
      examType: r.exam_type,
      schoolName: r.school_name,
      majorName: r.major_name,
      groupName: r.group_name,
      tier: r.tier,
      probability: Number(r.probability),
      confidence: Number(r.confidence),
      lastRank: Number(r.last_rank),
      schoolTier: r.school_tier,
      ownership: r.ownership,
      region: r.region,
      tags: r.tags ?? [],
      reason: r.reason,
      predicted: r.predicted,
      requiredSubjects: r.required_subjects ?? [],
    }));
    return { version: dv.version_label, updatedAt: dv.updated_at, disclaimer: dv.disclaimer, candidates };
  }
}
