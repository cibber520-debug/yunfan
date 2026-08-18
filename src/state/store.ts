import { ruleConstraints, uiConfig } from '../config';
import type { AppState, ExamType, RecommendationResult, WizardDraft } from '../types/domain';

export const STORAGE_KEY = ruleConstraints.storage.key;
export const STORAGE_SCHEMA_VERSION = ruleConstraints.storage.schemaVersion;

export const defaultDraft: WizardDraft = {
  basic: {
    province: '',
    examType: 'NEW_312',
    subjects: [],
    totalScore: null,
    provinceRank: null,
    rankSegment: null,
    identities: ['NONE'],
    bonusScore: null,
  },
  preferences: {
    schoolTiers: [],
    ownership: 'ALL',
    preferredRegions: [],
    rejectedRegions: [],
    majorCategories: [],
    preferredMajors: [],
    blacklistedMajors: [],
  },
  weights: { ...uiConfig.wizard.weightPresets[0].weights },
};

export const initialState: AppState = {
  wizardDraft: defaultDraft,
  completedStep: 0,
  recommendationResult: null,
  selectedVolunteerIds: [],
  schemaVersion: STORAGE_SCHEMA_VERSION,
};

export type AppAction =
  | { type: 'UPDATE_DRAFT'; payload: WizardDraft }
  | { type: 'SET_EXAM_TYPE'; payload: ExamType }
  | { type: 'COMPLETE_STEP'; payload: number }
  | { type: 'SET_RECOMMENDATION'; payload: RecommendationResult | null }
  | { type: 'TOGGLE_VOLUNTEER'; payload: string }
  | { type: 'REMOVE_VOLUNTEER'; payload: string }
  | { type: 'CLEAR_VOLUNTEERS' }
  | { type: 'HYDRATE'; payload: AppState };

/** 应用全局状态的唯一不可变写入口。 */
export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'UPDATE_DRAFT':
      return { ...state, wizardDraft: action.payload };
    case 'SET_EXAM_TYPE':
      return { ...state, wizardDraft: { ...state.wizardDraft, basic: { ...state.wizardDraft.basic, examType: action.payload, subjects: [] } } };
    case 'COMPLETE_STEP':
      return { ...state, completedStep: Math.max(state.completedStep, Math.min(uiConfig.wizard.steps.length, action.payload)) };
    case 'SET_RECOMMENDATION':
      return { ...state, recommendationResult: action.payload };
    case 'TOGGLE_VOLUNTEER': {
      const hasId: boolean = state.selectedVolunteerIds.includes(action.payload);
      return {
        ...state,
        selectedVolunteerIds: hasId
          ? state.selectedVolunteerIds.filter((id) => id !== action.payload)
          : [...state.selectedVolunteerIds, action.payload],
      };
    }
    case 'REMOVE_VOLUNTEER':
      return { ...state, selectedVolunteerIds: state.selectedVolunteerIds.filter((id) => id !== action.payload) };
    case 'CLEAR_VOLUNTEERS':
      return { ...state, selectedVolunteerIds: [] };
    case 'HYDRATE':
      return action.payload;
    default:
      return state;
  }
}

interface PersistedState {
  schemaVersion: number;
  wizardDraft: WizardDraft;
  completedStep: number;
  selectedVolunteerIds: string[];
}

/** 将允许持久化的最小状态写入本地存储。 */
export function saveState(state: AppState, storage: Storage = window.localStorage): void {
  const payload: PersistedState = {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    wizardDraft: state.wizardDraft,
    completedStep: state.completedStep,
    selectedVolunteerIds: state.selectedVolunteerIds,
  };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // 无痕模式或配额不足时保持内存可用，不阻断主流程。
  }
}

/** 读取并最小校验持久化状态，损坏数据安全回退。 */
export function loadState(storage: Storage = window.localStorage): AppState {
  try {
    const raw: string | null = storage.getItem(STORAGE_KEY);
    if (raw === null) return initialState;
    const value: unknown = JSON.parse(raw);
    if (!isPersistedState(value)) return initialState;
    return { ...initialState, ...value, recommendationResult: null };
  } catch {
    return initialState;
  }
}

/** 删除浏览器中的匿名草稿，避免退出账户后继续暴露上一位用户资料。 */
export function clearState(storage: Storage = window.localStorage): void {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // 无痕模式或存储不可用时保持内存可用，不阻断退出流程。
  }
}

function isPersistedState(value: unknown): value is PersistedState {
  if (typeof value !== 'object' || value === null) return false;
  const record: Record<string, unknown> = value as Record<string, unknown>;
  return record.schemaVersion === STORAGE_SCHEMA_VERSION
    && typeof record.wizardDraft === 'object'
    && typeof record.completedStep === 'number'
    && Array.isArray(record.selectedVolunteerIds)
    && record.selectedVolunteerIds.every((item) => typeof item === 'string');
}
