import referenceDataJson from '../data/mock/reference-data.json';
import { isReferenceDataResponse } from '../types/apiGuards';
import type { ProvinceConfig, ReferenceData, SubjectCode, WizardDraft } from '../types/domain';
import { defaultDraft } from '../state/store';

const referenceData: ReferenceData = (() => {
  if (!isReferenceDataResponse(referenceDataJson)) {
    throw new Error('测试引用数据格式无效');
  }
  return referenceDataJson;
})();

export const readyProvince: ProvinceConfig = referenceData.provinces.find((province) => province.ready)
  ?? (() => { throw new Error('测试引用数据缺少已就绪省份'); })();

function defaultSubjects(province: ProvinceConfig): SubjectCode[] {
  const rule = province.subjectRule;
  if (rule.mode === 'FIXED') return [...rule.subjects];
  if (rule.mode === 'ANY') return rule.allowedSubjects.slice(0, rule.selectionCount);
  return [rule.firstSubjects[0], ...rule.secondSubjects.slice(0, rule.secondSubjectCount)];
}

export function createReadyDraft(): WizardDraft {
  return {
    ...structuredClone(defaultDraft),
    basic: {
      ...structuredClone(defaultDraft).basic,
      province: readyProvince.code,
      examType: readyProvince.examType,
      subjects: defaultSubjects(readyProvince),
      totalScore: 612,
      provinceRank: 15230,
      rankSegment: '612 分 ≈ 15000–15300 名',
    },
  };
}
