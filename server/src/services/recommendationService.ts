import type { Repository } from '../repository/types';
import type {
  CandidateDto,
  ExamType,
  GenerateRecommendationResponse,
  RecommendationDto,
  SchoolTier,
  SpecialIdentity,
  SubjectCode,
  Tier,
  WizardDraft,
} from '../contracts';
import { LlmError, serviceError } from '../errors';
import type { LlmClient } from './llmClient';
import { buildMessages } from './recommendationPrompt';
import { logger } from '../logger';

const TIERS: Tier[] = ['REACH', 'MATCH', 'SAFE', 'CUSHION'];
const CUSHION: Tier = 'CUSHION';
const MIN_CUSHION_COUNT = 3;

// 与前端 src/config/ui-config.json 的 examTypeLabels 保持一致，保证 UI 文案统一。
const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  OLD_ART: '老高考文科',
  OLD_SCI: '老高考理科',
  NEW_33: '3+3（新高考）',
  NEW_312: '3+1+2（新高考）',
};

const EXAM_TYPES = new Set<ExamType>(['OLD_ART', 'OLD_SCI', 'NEW_33', 'NEW_312']);
const SUBJECT_CODES = new Set<SubjectCode>(['PHY', 'HIS', 'CHE', 'BIO', 'POL', 'GEO']);
const SCHOOL_TIERS = new Set<SchoolTier>([
  '985',
  '211',
  'DOUBLE_FIRST_CLASS',
  'PROVINCIAL',
  'PUBLIC',
  'PRIVATE',
  'VOCATIONAL',
]);
const OWNERSHIPS = new Set(['ALL', 'PUBLIC', 'PRIVATE']);
const SPECIAL_IDENTITIES = new Set<SpecialIdentity>([
  'NONE',
  'NATIONAL_SPECIAL',
  'LOCAL_SPECIAL',
  'COLLEGE_SPECIAL',
  'STRONG_BASE',
  'ART_SPORT',
  'MINORITY_BONUS',
]);
const MAJOR_CATEGORIES = new Set([
  'ENGINEERING',
  'MEDICINE',
  'SCIENCE',
  'ECONOMICS',
  'LITERATURE',
  'MANAGEMENT',
  'LAW',
  'AGRICULTURE',
]);

const VALID_TIERS = new Set<string>(TIERS);

function strArray(value: unknown, allowed?: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && (allowed === undefined || allowed.has(item)));
}

export function parseDraft(body: unknown): WizardDraft {
  if (typeof body !== 'object' || body === null) {
    throw serviceError('INVALID_INPUT', '请求体必须是 JSON 对象');
  }
  const b = body as Record<string, unknown>;
  const draftRaw = b.draft;
  if (typeof draftRaw !== 'object' || draftRaw === null) {
    throw serviceError('INVALID_INPUT', '缺少 draft 字段', 'draft');
  }
  const d = draftRaw as Record<string, unknown>;
  const basic = (d.basic ?? {}) as Record<string, unknown>;
  const prefs = (d.preferences ?? {}) as Record<string, unknown>;

  if (typeof basic.province !== 'string' || basic.province.length === 0) {
    throw serviceError('INVALID_INPUT', 'draft.basic.province 缺失', 'draft');
  }
  if (typeof basic.examType !== 'string' || !EXAM_TYPES.has(basic.examType as ExamType)) {
    throw serviceError('INVALID_INPUT', 'draft.basic.examType 不合法', 'draft');
  }

  return {
    basic: {
      province: basic.province,
      examType: basic.examType as ExamType,
      subjects: strArray(basic.subjects, SUBJECT_CODES) as SubjectCode[],
      totalScore: typeof basic.totalScore === 'number' ? basic.totalScore : null,
      provinceRank: typeof basic.provinceRank === 'number' ? basic.provinceRank : null,
      rankSegment: typeof basic.rankSegment === 'string' ? basic.rankSegment : null,
      identities: strArray(basic.identities, SPECIAL_IDENTITIES) as SpecialIdentity[],
      bonusScore: typeof basic.bonusScore === 'number' ? basic.bonusScore : null,
    },
    preferences: {
      schoolTiers: strArray(prefs.schoolTiers, SCHOOL_TIERS) as SchoolTier[],
      ownership: OWNERSHIPS.has(String(prefs.ownership)) ? (prefs.ownership as WizardDraft['preferences']['ownership']) : 'ALL',
      preferredRegions: strArray(prefs.preferredRegions),
      rejectedRegions: strArray(prefs.rejectedRegions),
      majorCategories: strArray(prefs.majorCategories, MAJOR_CATEGORIES) as WizardDraft['preferences']['majorCategories'],
      preferredMajors: strArray(prefs.preferredMajors),
      blacklistedMajors: strArray(prefs.blacklistedMajors),
    },
    weights: (d.weights ?? { major: 0, school: 0, city: 0 }) as WizardDraft['weights'],
  };
}

export class RecommendationService {
  constructor(
    private readonly repo: Repository,
    private readonly llm: LlmClient | null = null,
  ) {}

  async generate(draft: WizardDraft): Promise<GenerateRecommendationResponse> {
    const ref = await this.repo.getReferenceData();
    const catalog = await this.repo.getRecommendationCatalog();

    const province = ref.provinces.find((p) => p.code === draft.basic.province);
    const rank = draft.basic.provinceRank;
    const score = draft.basic.totalScore;
    if (province === undefined || !province.ready || rank === null || score === null) {
      throw serviceError('INVALID_INPUT', '请先完成可用省份的信息采集');
    }

    const llmAttempted = this.llm !== null;
    if (this.llm !== null) {
      try {
        const llmResult = await this.generateViaLlm(draft, ref, catalog);
        // 大模型结果梯度不完整时，用本地引擎同池候选补齐缺失档位，保证方案始终可用。
        const completed = this.ensureComplete(llmResult, draft, ref, catalog);
        if (hasCompleteDistribution(completed.items)) {
          logger.info('推荐生成(大模型)', {
            province: draft.basic.province,
            examType: draft.basic.examType,
            items: completed.items.length,
            degradation: completed.degradation?.level ?? null,
          });
          return completed;
        }
        // 补齐后仍不完整 → 整体回退本地引擎
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error('大模型生成失败，回退本地引擎', { message });
      }
    }

    const local = this.generateLocal(draft, ref, catalog);
    // 仅在确实尝试过 LLM 但失败时才标记降级，避免无 key 场景误报。
    if (llmAttempted) {
      local.degradation = {
        level: 'L5',
        message: '大模型暂不可用，已切换本地推荐引擎',
        details: '本次方案由本地推荐引擎基于候选集过滤生成。检查 DEEPSEEK_API_KEY 配置或网络后重试，可获得 AI 个性化推荐。',
      };
    }
    logger.info('推荐生成(本地)', {
      province: draft.basic.province,
      examType: draft.basic.examType,
      items: local.items.length,
      strict: local.strictItems.length,
      degradation: local.degradation?.level ?? null,
    });
    return local;
  }

  /** 若大模型结果缺失某些档位，用本地引擎同池候选补齐，使最终方案保持四档齐全。 */
  private ensureComplete(
    result: GenerateRecommendationResponse,
    draft: WizardDraft,
    ref: Awaited<ReturnType<Repository['getReferenceData']>>,
    catalog: Awaited<ReturnType<Repository['getRecommendationCatalog']>>,
  ): GenerateRecommendationResponse {
    if (hasCompleteDistribution(result.items)) return result;
    let localItems: RecommendationDto[] = [];
    try {
      localItems = this.generateLocal(draft, ref, catalog).items;
    } catch {
      localItems = [];
    }
    const byId = new Map<string, RecommendationDto>(result.items.map((item) => [item.id, item]));
    const counts = new Map<Tier, number>();
    for (const item of byId.values()) {
      counts.set(item.tier, (counts.get(item.tier) ?? 0) + 1);
    }
    const required: Array<[Tier, number]> = [
      ['REACH', 1],
      ['MATCH', 1],
      ['SAFE', 1],
      ['CUSHION', MIN_CUSHION_COUNT],
    ];
    for (const [tier, min] of required) {
      let have = counts.get(tier) ?? 0;
      for (const local of localItems) {
        if (have >= min) break;
        if (local.tier !== tier || byId.has(local.id)) continue;
        byId.set(local.id, local);
        have += 1;
        counts.set(tier, have);
      }
    }
    const items = [...byId.values()].sort(
      (a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier),
    );
    return { ...result, items };
  }

  /** 走大模型：整合提示词 → 调用 → 解析 → 封装为与测试数据同构的响应。 */
  private async generateViaLlm(
    draft: WizardDraft,
    ref: Awaited<ReturnType<Repository['getReferenceData']>>,
    catalog: Awaited<ReturnType<Repository['getRecommendationCatalog']>>,
  ): Promise<GenerateRecommendationResponse> {
    const messages = buildMessages(draft, ref, catalog);
    const content = await this.llm!.complete(messages, { temperature: 0.3 });

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new LlmError('大模型返回内容不是合法 JSON');
    }

    const candidateById = new Map<string, CandidateDto>(
      catalog.candidates.map((c) => [c.id, c]),
    );
    // 仅做「非空 + 结构合法」校验；四档是否齐全交给 generate() 的 ensureComplete 补齐，
    // 这样大模型偶发漏档位时仍可保留其 AI 推荐结果、仅用本地同池候选补缺失档，避免整体回退 L5。
    const built = buildResponseFromLlm(parsed, candidateById, draft, ref, catalog);
    return built;
  }

  /** 本地引擎（阶段一原有逻辑）：基于候选集做选科/性质/专业黑名单/地域硬过滤，形成冲稳保垫。 */
  private generateLocal(
    draft: WizardDraft,
    ref: Awaited<ReturnType<Repository['getReferenceData']>>,
    catalog: Awaited<ReturnType<Repository['getRecommendationCatalog']>>,
  ): GenerateRecommendationResponse {
    const province = ref.provinces.find((p) => p.code === draft.basic.province)!;
    const rank = draft.basic.provinceRank!;
    const score = draft.basic.totalScore!;

    const eligible = (ignoreRejected: boolean): CandidateDto[] =>
      catalog.candidates
        .filter((c) => c.province === draft.basic.province && c.examType === draft.basic.examType)
        .filter((c) => c.requiredSubjects.every((s) => draft.basic.subjects.includes(s)))
        .filter((c) => !draft.preferences.blacklistedMajors.some((m) => c.majorName.includes(m)))
        .filter((c) => draft.preferences.ownership === 'ALL' || c.ownership === draft.preferences.ownership)
        .filter((c) => ignoreRejected || !draft.preferences.rejectedRegions.includes(c.region));

    const toRecommendation = (c: CandidateDto): RecommendationDto => ({
      id: c.id,
      schoolName: c.schoolName,
      majorName: c.majorName,
      groupName: c.groupName,
      tier: c.tier,
      probability: c.probability,
      confidence: c.confidence,
      tags: [...c.tags],
      reason: c.reason,
      predicted: c.predicted,
    });

    const strictItems = eligible(false)
      .filter((c) => draft.preferences.schoolTiers.length === 0 || draft.preferences.schoolTiers.includes(c.schoolTier))
      .map(toRecommendation);
    const relaxedTierItems = eligible(false).map(toRecommendation);
    const relaxedRegionItems = eligible(true).map(toRecommendation);

    let items = strictItems;
    let degradation: GenerateRecommendationResponse['degradation'] = null;

    if (!hasCompleteDistribution(strictItems)) {
      if (hasCompleteDistribution(relaxedTierItems)) {
        items = relaxedTierItems;
        degradation = {
          level: 'L1',
          message: '已放宽：取消最低院校层次限制',
          details: '你的院校层次偏好不足以形成完整梯度，现保留选科、院校性质、地域排斥与专业黑名单等约束。',
        };
      } else {
        items = relaxedRegionItems;
        degradation = {
          level: 'L2',
          message: '已放宽：取消排斥城市限制',
          details: '放宽院校层次后仍不足以形成完整梯度，现继续移除地域排斥；选科、院校性质与专业黑名单仍严格保留。',
        };
      }
    }

    if (!hasCompleteDistribution(items)) {
      throw serviceError(
        'NOT_FOUND',
        `当前硬约束下无法形成完整梯度和至少 ${MIN_CUSHION_COUNT} 个垫档候选，请调整选科、院校性质或专业黑名单`,
      );
    }

    return {
      dataVersion: catalog.version,
      updatedAt: catalog.updatedAt,
      profile: {
        province: draft.basic.province,
        provinceName: province.name,
        examType: draft.basic.examType,
        examTypeLabel: EXAM_TYPE_LABELS[draft.basic.examType],
        totalScore: score,
        provinceRank: rank,
        subjects: [...draft.basic.subjects],
      },
      items,
      strictItems,
      degradation,
      generatedAt: new Date().toISOString(),
      disclaimer: catalog.disclaimer,
    };
  }
}

/** 把大模型返回的对象清洗、校验、封装为 GenerateRecommendationResponse（与测试数据结构一致）。 */
function buildResponseFromLlm(
  parsed: unknown,
  candidateById: Map<string, CandidateDto>,
  draft: WizardDraft,
  ref: Awaited<ReturnType<Repository['getReferenceData']>>,
  catalog: Awaited<ReturnType<Repository['getRecommendationCatalog']>>,
): GenerateRecommendationResponse {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new LlmError('大模型返回结构非法');
  }
  const data = parsed as Record<string, unknown>;
  const province = ref.provinces.find((p) => p.code === draft.basic.province)!;

  const items = sanitizeItems(data.items, candidateById);
  if (items.length === 0) throw new LlmError('大模型未返回任何有效候选');

  const rawStrict = Array.isArray(data.strictItems) ? data.strictItems : [];
  const strictItems = sanitizeItems(rawStrict, candidateById);
  const strict = strictItems.length > 0 ? strictItems : items;

  const degradation = sanitizeDegradation(data.degradation);

  return {
    dataVersion: catalog.version,
    updatedAt: catalog.updatedAt,
    profile: {
      province: draft.basic.province,
      provinceName: province.name,
      examType: draft.basic.examType,
      examTypeLabel: EXAM_TYPE_LABELS[draft.basic.examType],
      totalScore: draft.basic.totalScore!,
      provinceRank: draft.basic.provinceRank!,
      subjects: [...draft.basic.subjects],
    },
    items,
    strictItems: strict,
    degradation,
    generatedAt: new Date().toISOString(),
    disclaimer: catalog.disclaimer,
  };
}

const TIER_FALLBACK_PROBABILITY: Record<Tier, number> = {
  REACH: 40,
  MATCH: 65,
  SAFE: 85,
  CUSHION: 95,
};

/**
 * 清洗单个 item：
 * - 若 id 命中候选池，则采用候选池规范的校名/专业名（确保与参考数据一致）；
 * - 否则若大模型直接给出了校名+专业名（真实接入场景，AI 可推荐候选池之外的院校），则接纳并以梯度推算兜底概率。
 * 二者都缺失关键字段则丢弃。
 */
function sanitizeItem(raw: unknown, candidateById: Map<string, CandidateDto>): RecommendationDto | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const item = raw as Record<string, unknown>;
  const tier = String(item.tier ?? '').toUpperCase();
  if (!VALID_TIERS.has(tier)) return null;
  const typedTier = tier as Tier;

  const poolId = typeof item.id === 'string' ? item.id : '';
  const candidate = poolId.length > 0 ? candidateById.get(poolId) : undefined;

  let id: string;
  let schoolName: string;
  let majorName: string;
  let groupName: string;
  let probabilityFallback: number;
  let confidenceFallback: number;
  let reasonFallback: string;
  let predictedFallback: boolean;

  if (candidate !== undefined) {
    id = candidate.id;
    schoolName = candidate.schoolName;
    majorName = candidate.majorName;
    groupName = candidate.groupName;
    probabilityFallback = candidate.probability;
    confidenceFallback = candidate.confidence;
    reasonFallback = candidate.reason;
    predictedFallback = candidate.predicted;
  } else {
    schoolName = typeof item.schoolName === 'string' ? item.schoolName : '';
    majorName = typeof item.majorName === 'string' ? item.majorName : '';
    if (schoolName.length === 0 || majorName.length === 0) return null;
    groupName = typeof item.groupName === 'string' && item.groupName.length > 0 ? item.groupName : '院校专业组';
    id = poolId.length > 0 ? poolId : `llm-${hashCode(`${schoolName}|${majorName}`)}`;
    probabilityFallback = TIER_FALLBACK_PROBABILITY[typedTier];
    confidenceFallback = 0.7;
    reasonFallback = `${schoolName} ${majorName}`;
    predictedFallback = false;
  }

  const probability = clampInt(item.probability, 1, 99, probabilityFallback);
  const confidence = clampNumber(item.confidence, 0, 1, confidenceFallback);
  const tags = strArray(item.tags).slice(0, 3);
  const reason = typeof item.reason === 'string' && item.reason.length > 0 ? item.reason : reasonFallback;
  const predicted = typeof item.predicted === 'boolean' ? item.predicted : predictedFallback;

  return { id, schoolName, majorName, groupName, tier: typedTier, probability, confidence, tags, reason, predicted };
}

function sanitizeItems(raw: unknown, candidateById: Map<string, CandidateDto>): RecommendationDto[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => sanitizeItem(entry, candidateById))
    .filter((entry): entry is RecommendationDto => entry !== null);
}

function hashCode(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function sanitizeDegradation(value: unknown): GenerateRecommendationResponse['degradation'] {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return null;
  const d = value as Record<string, unknown>;
  if (!['L1', 'L2', 'L5'].includes(String(d.level))) return null;
  if (typeof d.message !== 'string' || typeof d.details !== 'string') return null;
  return { level: d.level as 'L1' | 'L2' | 'L5', message: d.message, details: d.details };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? Math.round(value) : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function hasCompleteDistribution(items: RecommendationDto[]): boolean {
  const required = new Set(items.map((item) => item.tier));
  const cushionCount = items.filter((item) => item.tier === CUSHION).length;
  return TIERS.every((tier) => required.has(tier)) && cushionCount >= MIN_CUSHION_COUNT;
}
