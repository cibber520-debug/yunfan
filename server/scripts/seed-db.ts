import { pool } from '../src/db/pool';
import referenceDataJson from '../src/data/reference-data.json';
import rankCatalogJson from '../src/data/rank-lookup.json';
import recommendationCatalogJson from '../src/data/recommendations.json';
import type { PoolClient } from 'pg';
import type { ReferenceDataResponse, RankCatalog, RecommendationCatalog } from '../src/contracts';

const SEED_LOCK_KEY = 2_406_081_802;

/** Serialize a value explicitly for jsonb parameters. */
function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function describeError(error: unknown): { message: string; code?: string } {
  if (error instanceof Error) {
    const code = (error as Error & { code?: unknown }).code;
    return { message: error.message, ...(typeof code === 'string' ? { code } : {}) };
  }
  return { message: String(error) };
}

async function needsSeed(client: PoolClient, version: string): Promise<boolean> {
  if (process.env.PG_SEED_FORCE === 'true') return true;
  const result = await client.query<{ version_label: string }>(
    `SELECT version_label
       FROM data_version
      WHERE active = true
      ORDER BY updated_at DESC
      LIMIT 1`,
  );
  const activeVersion = result.rows[0]?.version_label;
  if (activeVersion === version) {
    console.log(`[云帆][seed] 活动数据版本 ${version} 已存在，跳过重复种子写入`);
    return false;
  }
  if (activeVersion !== undefined) {
    console.log(`[云帆][seed] 活动数据版本 ${activeVersion} 与目标版本 ${version} 不同，将更新种子数据`);
  }
  return true;
}

async function seed(client: PoolClient): Promise<void> {
  const referenceData = referenceDataJson as unknown as ReferenceDataResponse;
  const rankCatalog = rankCatalogJson as unknown as RankCatalog;
  const recommendationCatalog = recommendationCatalogJson as unknown as RecommendationCatalog;
  if (!(await needsSeed(client, referenceData.version))) return;

  await client.query('TRUNCATE TABLE candidate, score_segment, option_item, reference_region, reference_major, province_rule, data_version RESTART IDENTITY CASCADE');

  const versionResult = await client.query<{ id: number }>(
    `INSERT INTO data_version (version_label, updated_at, disclaimer, active, snapshot_hash, notes)
     VALUES ($1, $2, $3, true, $4, $5) RETURNING id`,
    [referenceData.version, referenceData.updatedAt, recommendationCatalog.disclaimer, `seed-${referenceData.version}`, '写死演示数据'],
  );
  const versionId = versionResult.rows[0]?.id;
  if (versionId === undefined) throw new Error('无法创建数据版本');

  for (const province of referenceData.provinces) {
    await client.query(
      `INSERT INTO province_rule
        (code, name, exam_type, max_score, ready, rule_summary, subject_rule, max_bonus_score, data_version_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [province.code, province.name, province.examType, province.maxScore, province.ready, province.ruleSummary, json(province.subjectRule), province.maxBonusScore, versionId],
    );
  }

  const optionEntries = Object.entries(referenceData.optionCatalog) as Array<[string, Array<{ code: string; label: string }>]>;
  for (const [catalog, items] of optionEntries) {
    for (const [index, item] of items.entries()) {
      await client.query(
        'INSERT INTO option_item (catalog, code, label, sort_order) VALUES ($1,$2,$3,$4)',
        [catalog, item.code, item.label, index],
      );
    }
  }

  for (const name of referenceData.regions) {
    await client.query('INSERT INTO reference_region (name) VALUES ($1)', [name]);
  }
  for (const name of referenceData.majors) {
    await client.query('INSERT INTO reference_major (name) VALUES ($1)', [name]);
  }
  for (const segment of rankCatalog.segments) {
    await client.query(
      `INSERT INTO score_segment
        (province, exam_type, score, rank, lower, upper, data_version_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [segment.province, segment.examType, segment.score, segment.rank, segment.lower, segment.upper, versionId],
    );
  }
  for (const candidate of recommendationCatalog.candidates) {
    await client.query(
      `INSERT INTO candidate
        (id, province, exam_type, school_name, major_name, group_name, tier, probability, confidence,
         last_rank, school_tier, ownership, region, tags, reason, predicted, required_subjects, data_version_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        candidate.id,
        candidate.province,
        candidate.examType,
        candidate.schoolName,
        candidate.majorName,
        candidate.groupName,
        candidate.tier,
        candidate.probability,
        candidate.confidence,
        candidate.lastRank,
        candidate.schoolTier,
        candidate.ownership,
        candidate.region,
        json(candidate.tags),
        candidate.reason,
        candidate.predicted,
        json(candidate.requiredSubjects),
        versionId,
      ],
    );
  }
  console.log(`[云帆][seed] 已写入版本 ${referenceData.version}：省份 ${referenceData.provinces.length}，位次段 ${rankCatalog.segments.length}，候选 ${recommendationCatalog.candidates.length}`);
}

async function main(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [SEED_LOCK_KEY]);
    await seed(client);
    await client.query('COMMIT');
    console.log('[云帆][seed] 种子事务已提交 ✓');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original error below.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[云帆][seed] 种子写入失败', describeError(error));
  process.exit(1);
});
