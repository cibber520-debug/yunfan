import type { ExamType, Tier, Weights } from './domain';

export interface WizardStepConfig {
  id: string;
  navLabel: string;
  title: string;
  description: string;
}

export interface WeightPresetConfig {
  id: string;
  label: string;
  weights: Weights;
}

export interface DistributionItemConfig {
  tier: Tier;
  label: string;
  minHeight: number;
  countLabel: string;
}

export interface RecommendationTierConfig {
  code: Tier;
  name: string;
  longName: string;
  english: string;
  range: string;
  isCushion: boolean;
}

export interface NavigationItemConfig {
  id: string;
  label: string;
  route: 'home' | 'wizard' | 'volunteers' | 'profile';
  active: 'exact' | 'wizard' | 'volunteersAndResults';
}

export interface UiConfig {
  wizard: {
    steps: WizardStepConfig[];
    weightLabels: Record<keyof Weights, string>;
    weightPresets: WeightPresetConfig[];
    distribution: DistributionItemConfig[];
  };
  recommendation: {
    tiers: RecommendationTierConfig[];
    confidence: Array<{ min: number; label: string }>;
  };
  examTypeLabels: Record<ExamType, string>;
  navigation: NavigationItemConfig[];
}

export interface RuleConstraintsConfig {
  version: number;
  weightTotal: number;
  minWeight: number;
  minimumCushionCount: number;
  storage: {
    key: string;
    schemaVersion: number;
    persistedFields: Array<'wizardDraft' | 'completedStep' | 'selectedVolunteerIds'>;
  };
}
