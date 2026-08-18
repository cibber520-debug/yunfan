import type { Repository } from '../repository/types';
import type { ExamType, RankLookupRequest, RankLookupResponse } from '../contracts';
import { serviceError } from '../errors';
import { logger } from '../logger';

const EXAM_TYPES = new Set<ExamType>(['OLD_ART', 'OLD_SCI', 'NEW_33', 'NEW_312']);

export function parseRankLookup(body: unknown): RankLookupRequest {
  if (typeof body !== 'object' || body === null) {
    throw serviceError('INVALID_INPUT', '请求体必须是 JSON 对象');
  }
  const b = body as Record<string, unknown>;
  if (typeof b.province !== 'string' || b.province.length === 0) {
    throw serviceError('INVALID_INPUT', 'province 必须是非空字符串', 'province');
  }
  if (typeof b.examType !== 'string' || !EXAM_TYPES.has(b.examType as ExamType)) {
    throw serviceError('INVALID_INPUT', 'examType 不合法', 'examType');
  }
  if (typeof b.score !== 'number' || !Number.isFinite(b.score)) {
    throw serviceError('INVALID_INPUT', 'score 必须是数字', 'score');
  }
  return { province: b.province, examType: b.examType as ExamType, score: b.score };
}

export class RankService {
  constructor(private readonly repo: Repository) {}

  async reverseLookup(input: RankLookupRequest): Promise<RankLookupResponse> {
    const ref = await this.repo.getReferenceData();
    const province = ref.provinces.find((p) => p.code === input.province);
    if (province === undefined || !province.ready) {
      throw serviceError('NOT_FOUND', '该省完整参考数据建设中', 'province');
    }
    if (input.score < 0 || input.score > province.maxScore) {
      throw serviceError('INVALID_INPUT', `总分须为 0–${province.maxScore}`, 'score');
    }

    const catalog = await this.repo.getRankCatalog();
    const segments = catalog.segments.filter(
      (s) => s.province === input.province && s.examType === input.examType,
    );
    if (segments.length === 0) {
      throw serviceError('NOT_FOUND', '暂无该省该科类的位次参考数据', 'province');
    }

    const exact = segments.find((s) => s.score === input.score);
    if (exact !== undefined) {
      logger.info('位次反查', {
        province: input.province,
        examType: input.examType,
        score: input.score,
        rank: exact.rank,
        source: 'REFERENCE_DATA',
      });
      return {
        dataVersion: catalog.version,
        updatedAt: catalog.updatedAt,
        provinceRank: exact.rank,
        rankSegment: `${exact.score} 分 ≈ ${exact.lower}–${exact.upper} 名`,
        source: 'REFERENCE_DATA',
      };
    }

    // 无精确分段时按最近分段线性估算，并明确标注来源为 ESTIMATE。
    const nearest = segments.reduce((current, item) =>
      Math.abs(item.score - input.score) < Math.abs(current.score - input.score) ? item : current,
    );
    const rank = Math.max(1, Math.round(nearest.rank + (nearest.score - input.score) * 600));
    logger.info('位次反查(估算)', {
      province: input.province,
      examType: input.examType,
      score: input.score,
      rank,
      source: 'ESTIMATE',
    });
    return {
      dataVersion: catalog.version,
      updatedAt: catalog.updatedAt,
      provinceRank: rank,
      rankSegment: `${input.score} 分估算约 ${rank - 200}–${rank + 200} 名`,
      source: 'ESTIMATE',
    };
  }
}
