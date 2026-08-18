import { describe, expect, it } from 'vitest';
import { normalizeWeights, validateStep, validateSubjects } from './rules';
import { defaultDraft } from '../state/store';
import type { ProvinceConfig, SubjectRule, WizardDraft } from '../types/domain';

const new312Rule: SubjectRule = {
  mode: 'FIRST_SECOND',
  firstSubjects: ['PHY', 'HIS'],
  secondSubjects: ['CHE', 'BIO', 'POL', 'GEO'],
  selectionCount: 3,
  firstSubjectCount: 1,
  secondSubjectCount: 2,
  message: '3+1+2 组合不合法',
};

const readyProvince: ProvinceConfig = {
  code: 'TEST', name: '测试省', examType: 'NEW_312', maxScore: 750, ready: true, ruleSummary: '测试规则', subjectRule: new312Rule, maxBonusScore: 20,
};

const cloneDraft = (): WizardDraft => structuredClone(defaultDraft);

describe('领域规则', () => {
  it('按服务下发的 NEW_312 选科规则校验组合', () => {
    expect(validateSubjects(new312Rule, ['PHY', 'CHE', 'BIO'])).toBeNull();
    expect(validateSubjects(new312Rule, ['PHY', 'HIS', 'CHE'])).toContain('不合法');
    expect(validateSubjects(new312Rule, ['PHY', 'CHE'])).toContain('不合法');
  });

  it('权重调整后始终为非负整数且合计静态配置值', () => {
    const cases = [0, 1, 50, 99, 100];
    for (const value of cases) {
      const result = normalizeWeights({ major: 50, school: 30, city: 20 }, 'major', value);
      expect(Object.values(result).every(Number.isInteger)).toBe(true);
      expect(Object.values(result).every((item) => item >= 0)).toBe(true);
      expect(result.major + result.school + result.city).toBe(100);
    }
  });

  it('未就绪省份会由服务状态明确拦截完整流程', () => {
    const draft: WizardDraft = cloneDraft();
    draft.basic.province = 'WAITING';
    const waitingProvince: ProvinceConfig = { ...readyProvince, code: 'WAITING', ready: false };
    expect(validateStep(1, draft, waitingProvince).province).toContain('建设中');
  });

  it('拦截地域和专业偏好冲突', () => {
    const draft = cloneDraft();
    draft.preferences.preferredRegions = ['杭州'];
    draft.preferences.rejectedRegions = ['杭州'];
    draft.preferences.preferredMajors = ['土木工程'];
    draft.preferences.blacklistedMajors = ['土木工程'];
    const errors = validateStep(5, draft, readyProvince);
    expect(errors.regions).toContain('杭州');
    expect(errors.majors).toContain('土木工程');
  });
});
