import type {
  CandidateDto,
  ReferenceDataResponse,
  WizardDraft,
} from '../contracts';
import type { LlmMessage } from './llmClient';

const SYSTEM_PROMPT = `你是「云帆志愿」的高考志愿填报顾问。你会收到一名考生的档案与一份「候选院校专业池」。
请基于考生的分数、省位次、选科、院校/地域/专业偏好，从候选池中挑选并组织出一份冲、稳、保、垫四个梯度的志愿方案。

硬约束：
1. 只能从给定的候选池中选择，必须使用候选池中的 id（不得编造学校或专业）。
2. tier 只能是 REACH（冲）、MATCH（稳）、SAFE（保）、CUSHION（垫）之一。
3. probability 为 0-100 整数，代表你对该志愿被录取的概率估算（REACH 偏低、CUSHION 偏高）。
4. confidence 为 0-1 数，代表你对该概率的把握。
5. tags 为 1-3 个简短中文标签；reason 为一句中文说明（为何适合该考生）。
6. predicted 仅当该志愿属于"新增/预测数据"专业时为真，否则为假。
7. items 必须恰好 9 条，分布固定为 REACH 2 条、MATCH 2 条、SAFE 2 条、CUSHION 3 条（四档必须全部出现，且 CUSHION 不少于 3 条）；strictItems 为严格遵循用户院校层次/地域/专业偏好的结果，同样需满足该分布（若放宽前后一致则两者相同）。
8. 若严格偏好下无法凑齐四档且至少 3 个垫档，则 degradation 给出 {level:"L1"|"L2",message,details}，否则为 null。

输出要求：仅输出一个 JSON 对象，不要包含任何解释性文字。结构如下：
{
  "items": [ { "id": "候选池id", "tier":"REACH|MATCH|SAFE|CUSHION", "probability": 42, "confidence": 0.86, "tags":["双一流"], "reason":"往年位次略高于你，适合作为进取目标", "predicted": false } ],
  "strictItems": [ 同上结构 ],
  "degradation": null
}`;

/** 将用户草稿、参考数据、候选池整合为发送给大模型的提示词。 */
export function buildMessages(
  draft: WizardDraft,
  reference: ReferenceDataResponse,
  catalog: { candidates: CandidateDto[]; disclaimer: string },
): LlmMessage[] {
  const province = reference.provinces.find((p) => p.code === draft.basic.province);
  const candidatePool = catalog.candidates
    .filter((c) => c.province === draft.basic.province && c.examType === draft.basic.examType)
    .map((c) => ({
      id: c.id,
      schoolName: c.schoolName,
      majorName: c.majorName,
      groupName: c.groupName,
      schoolTier: c.schoolTier,
      ownership: c.ownership,
      region: c.region,
      requiredSubjects: c.requiredSubjects,
      lastRank: c.lastRank,
      tags: c.tags,
    }));

  const profileBlock = [
    `省份：${province?.name ?? draft.basic.province}（${draft.basic.province}）`,
    `高考模式：${draft.basic.examType}`,
    `选科：${draft.basic.subjects.join('、') || '（未指定/不限）'}`,
    `总分：${draft.basic.totalScore ?? '未知'}`,
    `省位次：${draft.basic.provinceRank ?? '未知'}`,
    draft.basic.bonusScore ? `加分：${draft.basic.bonusScore}` : null,
    `特殊身份：${draft.basic.identities.join('、') || '无'}`,
  ]
    .filter(Boolean)
    .join('\n');

  const prefBlock = [
    `院校层次偏好：${draft.preferences.schoolTiers.join('、') || '不限'}`,
    `院校性质：${draft.preferences.ownership}`,
    `期望地区：${draft.preferences.preferredRegions.join('、') || '不限'}`,
    `排斥地区：${draft.preferences.rejectedRegions.join('、') || '无'}`,
    `学科门类偏好：${draft.preferences.majorCategories.join('、') || '不限'}`,
    `具体专业偏好：${draft.preferences.preferredMajors.join('、') || '不限'}`,
    `绝对不读专业：${draft.preferences.blacklistedMajors.join('、') || '无'}`,
    `权重（专业:院校:城市）= ${draft.weights.major}:${draft.weights.school}:${draft.weights.city}`,
  ].join('\n');

  const userContent = [
    '【考生档案】',
    profileBlock,
    '',
    '【填报偏好】',
    prefBlock,
    '',
    `【候选院校专业池】（共 ${candidatePool.length} 个，只能从中选择，必须使用其 id）`,
    JSON.stringify(candidatePool, null, 2),
    '',
    '请按系统提示的要求，从上述候选池中生成 items 与 strictItems（JSON 对象）。',
  ].join('\n');

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];
}
