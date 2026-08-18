import ruleConstraintsJson from './rule-constraints.json';
import uiConfigJson from './ui-config.json';
import type { ExamType } from '../types/domain';
import type { RuleConstraintsConfig, UiConfig } from '../types/config';

export const uiConfig: UiConfig = uiConfigJson as UiConfig;
export const ruleConstraints: RuleConstraintsConfig = ruleConstraintsJson as RuleConstraintsConfig;
export const STEP_COUNT: number = uiConfig.wizard.steps.length;

export function tierConfig(code: string) {
  return uiConfig.recommendation.tiers.find((tier) => tier.code === code);
}

export function examTypeLabel(examType: ExamType): string {
  return uiConfig.examTypeLabels[examType];
}

export function confidenceLabel(value: number): string {
  return uiConfig.recommendation.confidence.find((item) => value >= item.min)?.label ?? '低';
}
