import { ruleConstraints } from '../config';
import type { ProvinceConfig, SubjectCode, SubjectRule, Weights, WizardDraft } from '../types/domain';

export interface ValidationErrors {
  [field: string]: string;
}

/** 按服务下发的选科规则校验组合。 */
export function validateSubjects(rule: SubjectRule, subjects: SubjectCode[]): string | null {
  const unique: SubjectCode[] = [...new Set(subjects)];
  if (unique.length !== subjects.length) return '选科不能重复';
  if (rule.mode === 'FIXED') return sameSet(unique, rule.subjects) ? null : rule.message;
  if (rule.mode === 'ANY') {
    return unique.length === rule.selectionCount && unique.every((item) => rule.allowedSubjects.includes(item)) ? null : rule.message;
  }
  const firstCount = unique.filter((item) => rule.firstSubjects.includes(item)).length;
  const secondCount = unique.filter((item) => rule.secondSubjects.includes(item)).length;
  return unique.length === rule.selectionCount && firstCount === rule.firstSubjectCount && secondCount === rule.secondSubjectCount
    ? null
    : rule.message;
}

function sameSet(left: SubjectCode[], right: SubjectCode[]): boolean {
  return left.length === right.length && right.every((item) => left.includes(item));
}

/** 调整单个权重，并按原比例把余量整数分配给另外两项。 */
export function normalizeWeights(current: Weights, key: keyof Weights, rawValue: number): Weights {
  const value: number = Math.max(ruleConstraints.minWeight, Math.min(ruleConstraints.weightTotal, Math.round(rawValue)));
  const keys: Array<keyof Weights> = ['major', 'school', 'city'];
  const others: Array<keyof Weights> = keys.filter((item) => item !== key);
  const remaining: number = ruleConstraints.weightTotal - value;
  const oldTotal: number = current[others[0]] + current[others[1]];
  const exactFirst: number = oldTotal === 0 ? remaining / 2 : remaining * current[others[0]] / oldTotal;
  const first: number = Math.floor(exactFirst);
  const second: number = remaining - first;
  return { ...current, [key]: value, [others[0]]: first, [others[1]]: second };
}

/** 校验向导指定步骤，返回字段到中文错误的映射。 */
export function validateStep(step: number, draft: WizardDraft, province: ProvinceConfig | undefined): ValidationErrors {
  const errors: ValidationErrors = {};
  if (step === 1) {
    if (draft.basic.province.length === 0) errors.province = '请选择生源省份';
    else if (province === undefined) errors.province = '省份规则尚未加载，请稍后重试';
    else if (!province.ready) errors.province = '该省参考数据建设中，请选择已就绪省份继续';
  }
  if (step === 2) {
    const score: number | null = draft.basic.totalScore;
    const maxScore = province?.maxScore;
    if (score === null || score < 0 || maxScore === undefined || score > maxScore) errors.totalScore = `请输入 0–${maxScore ?? '满分'} 的总分`;
    if (draft.basic.provinceRank === null || draft.basic.provinceRank < 1) errors.provinceRank = '请先完成位次反查';
  }
  if (step === 3) {
    if (province === undefined) errors.subjects = '省份选科规则尚未加载';
    else {
      const subjectError: string | null = validateSubjects(province.subjectRule, draft.basic.subjects);
      if (subjectError !== null) errors.subjects = subjectError;
    }
  }
  if (step === 4) {
    const needsBonus: boolean = !draft.basic.identities.includes('NONE');
    const bonus: number | null = draft.basic.bonusScore;
    if (needsBonus && (bonus === null || bonus < 0 || bonus > (province?.maxBonusScore ?? 0))) errors.bonusScore = `加分值须为 0–${province?.maxBonusScore ?? '上限'}`;
  }
  if (step === 5) {
    const regionConflict: string | undefined = draft.preferences.preferredRegions.find((item) =>
      draft.preferences.rejectedRegions.includes(item));
    if (regionConflict !== undefined) errors.regions = `“${regionConflict}”不能同时期望和排斥`;
    const majorConflict: string | undefined = draft.preferences.preferredMajors.find((item) =>
      draft.preferences.blacklistedMajors.includes(item));
    if (majorConflict !== undefined) errors.majors = `“${majorConflict}”不能既想读又加入黑名单`;
  }
  if (step === 6) {
    const total: number = draft.weights.major + draft.weights.school + draft.weights.city;
    if (total !== ruleConstraints.weightTotal || Object.values(draft.weights).some((item) => !Number.isInteger(item) || item < ruleConstraints.minWeight)) {
      errors.weights = `三项权重须为非负整数且合计 ${ruleConstraints.weightTotal}`;
    }
  }
  return errors;
}
