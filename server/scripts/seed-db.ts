import { pool } from '../src/db/pool';
import referenceDataJson from '../src/data/reference-data.json';
import rankCatalogJson from '../src/data/rank-lookup.json';
import recommendationCatalogJson from '../src/data/recommendations.json';
import type { ReferenceDataResponse, RankCatalog, RecommendationCatalog } from '../src/contracts';

/**
 * 将 jsonb 参数序列化为 JSON 文本。
 * 注意：pg 驱动对 jsonb 参数默认按 Postgres 数组字面量编码（如 {"双一流", ...}），
 * 直接把 JS 数组/对象传入会因语法不符报 22P02；显式 JSON.stringify 后传入 JSON 字符串即可。
 */
function j(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/**
 * 阶段二：把写死测试数据写入 PostgreSQL，并置为 active 数据版本。
 * 运行方式（需先建库并执行 db/schema.sql）：
 *   npm run db:seed
 * 该脚本可重复执行：先清空再写入，保证幂等。
 */
async function main(): Promise<void> {
  const ref = referenceDataJson as unknown as ReferenceDataResponse;
  const rank = rankCatalogJson as unknown as RankCatalog;
  const rec = recommendationCatalogJson as unknown as RecommendationCatalog;

  await pool.query(
    'TRUNCATE TABLE candidate, score_segment, option_item, reference_region, reference_major, province_rule, data_version RESTART IDENTITY CASCADE',
  );

  const dv = await pool.query<{ id: number }>(
    `INSERT INTO data_version (version_label, updated_at, disclaimer, active, snapshot_hash, notes)
     VALUES ($1, $2, $3, true, $4, $5) RETURNING id`,
    [ref.version, ref.updatedAt, rec.disclaimer, `seed-${ref.version}`, '写死演示数据'],
  );
  const versionId = dv.rows[0].id;

  for (const p of ref.provinces) {
    await pool.query(
      `INSERT INTO province_rule
        (code, name, exam_type, max_score, ready, rule_summary, subject_rule, max_bonus_score, data_version_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [p.code, p.name, p.examType, p.maxScore, p.ready, p.ruleSummary, j(p.subjectRule), p.maxBonusScore, versionId],
    );
  }

  const optionEntries = Object.entries(ref.optionCatalog) as Array<[string, Array<{ code: string; label: string }>]>;
  for (const [catalog, items] of optionEntries) {
    for (let i = 0; i < items.length; i++) {
      await pool.query(
        'INSERT INTO option_item (catalog, code, label, sort_order) VALUES ($1,$2,$3,$4)',
        [catalog, items[i].code, items[i].label, i],
      );
    }
  }

  for (const name of ref.regions) {
    await pool.query('INSERT INTO reference_region (name) VALUES ($1)', [name]);
  }
  for (const name of ref.majors) {
    await pool.query('INSERT INTO reference_major (name) VALUES ($1)', [name]);
  }

  for (const s of rank.segments) {
    await pool.query(
      `INSERT INTO score_segment
        (province, exam_type, score, rank, lower, upper, data_version_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [s.province, s.examType, s.score, s.rank, s.lower, s.upper, versionId],
    );
  }

  for (const c of rec.candidates) {
    await pool.query(
      `INSERT INTO candidate
        (id, province, exam_type, school_name, major_name, group_name, tier, probability, confidence,
         last_rank, school_tier, ownership, region, tags, reason, predicted, required_subjects, data_version_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        c.id,
        c.province,
        c.examType,
        c.schoolName,
        c.majorName,
        c.groupName,
        c.tier,
        c.probability,
        c.confidence,
        c.lastRank,
        c.schoolTier,
        c.ownership,
        c.region,
        j(c.tags),
        c.reason,
        c.predicted,
        j(c.requiredSubjects),
        versionId,
      ],
    );
  }

  console.log(
    `数据库已写入：版本 ${ref.version}，省份 ${ref.provinces.length}，位次段 ${rank.segments.length}，候选 ${rec.candidates.length}`,
  );
  await pool.end();
}

main().catch(async (err) => {
  console.error('seed 失败：', err);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
