import { AlertCircle, ArrowLeft, ArrowRight, Check, Info, LoaderCircle, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../app/AppShell';
import { examTypeLabel, ruleConstraints, uiConfig } from '../config';
import { routes, STEP_COUNT } from '../app/routes';
import { normalizeWeights, validateStep, validateSubjects, type ValidationErrors } from '../domain/rules';
import { referenceDataService, rankService, recommendationService } from '../services';
import { GenerationLoadingOverlay } from './GenerationLoadingOverlay';
import { fadeUp, staggerContainer } from '../animations/variants';
import { useApp } from '../state/AppContext';
import type {
  ProvinceCode,
  ProvinceConfig,
  ReferenceData,
  ServiceError,
  SpecialIdentity,
  SubjectCode,
  Weights,
  WizardDraft,
} from '../types/domain';
import styles from './WizardPage.module.css';

const stepMeta = uiConfig.wizard.steps;

/** 基于引用数据驱动的多步骤信息采集向导。 */
export function WizardPage(): JSX.Element {
  const { step: rawStep } = useParams();
  const step: number = Number(rawStep);
  const navigate = useNavigate();
  const { state, dispatch, notify } = useApp();
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [referenceData, setReferenceData] = useState<ReferenceData | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [referenceLoading, setReferenceLoading] = useState<boolean>(true);
  const [rankBusy, setRankBusy] = useState<boolean>(false);
  const [rankRetryKey, setRankRetryKey] = useState<number>(0);
  const [submitBusy, setSubmitBusy] = useState<boolean>(false);
  const scoreRequest = useRef<number>(0);
  const provinces = referenceData?.provinces ?? [];
  const currentProvince = provinces.find((item) => item.code === state.wizardDraft.basic.province);

  function loadReferenceData(): void {
    setReferenceLoading(true);
    setReferenceError(null);
    void referenceDataService.getReferenceData()
      .then(setReferenceData)
      .catch((error: ServiceError): void => setReferenceError(error.message))
      .finally((): void => setReferenceLoading(false));
  }

  useEffect((): void => {
    loadReferenceData();
  }, []);

  useEffect(() => {
    if (step !== 2) return;
    const score: number | null = state.wizardDraft.basic.totalScore;
    const maxScore = currentProvince?.maxScore;
    if (score === null || score < 0 || maxScore === undefined || score > maxScore) return;
    const requestId: number = ++scoreRequest.current;
    setRankBusy(true);
    const timer: number = window.setTimeout((): void => {
      void rankService.reverseLookup({ province: state.wizardDraft.basic.province, examType: state.wizardDraft.basic.examType, score })
        .then((result): void => {
          if (requestId !== scoreRequest.current) return;
          updateDraft({
            ...state.wizardDraft,
            basic: { ...state.wizardDraft.basic, provinceRank: result.provinceRank, rankSegment: result.rankSegment },
          });
          setErrors((current) => ({ ...current, totalScore: '', provinceRank: '' }));
        })
        .catch((error: ServiceError): void => {
          if (requestId !== scoreRequest.current) return;
          setErrors((current) => ({ ...current, provinceRank: error.message }));
        })
        .finally((): void => {
          if (requestId === scoreRequest.current) setRankBusy(false);
        });
    }, 300);
    return (): void => { window.clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProvince?.maxScore, rankRetryKey, state.wizardDraft.basic.examType, state.wizardDraft.basic.province, state.wizardDraft.basic.totalScore, step]);

  const errorMessage: string | undefined = Object.values(errors).find((value) => value.length > 0);

  function updateDraft(draft: WizardDraft): void {
    dispatch({ type: 'UPDATE_DRAFT', payload: draft });
  }

  function updateBasic(patch: Partial<WizardDraft['basic']>): void {
    updateDraft({ ...state.wizardDraft, basic: { ...state.wizardDraft.basic, ...patch } });
  }

  function updatePreferences(patch: Partial<WizardDraft['preferences']>): void {
    updateDraft({ ...state.wizardDraft, preferences: { ...state.wizardDraft.preferences, ...patch } });
  }

  function next(): void {
    const validation: ValidationErrors = validateStep(step, state.wizardDraft, currentProvince);
    setErrors(validation);
    if (Object.keys(validation).length > 0) {
      window.setTimeout((): void => {
        const invalidElement: HTMLElement | null = document.querySelector<HTMLElement>('[aria-invalid="true"]');
        if (invalidElement === null) return;
        const canReceiveFocus: boolean = invalidElement.matches('input, select, textarea, button, [tabindex]:not([tabindex="-1"])');
        const nestedControl: HTMLElement | null = invalidElement.querySelector<HTMLElement>(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        (canReceiveFocus ? invalidElement : nestedControl)?.focus();
      }, 0);
      return;
    }
    dispatch({ type: 'COMPLETE_STEP', payload: step });
    if (step < STEP_COUNT) {
      navigate(routes.wizard(step + 1));
      return;
    }
    setSubmitBusy(true);
    void recommendationService.generate(state.wizardDraft)
        .then((result): void => {
          dispatch({ type: 'SET_RECOMMENDATION', payload: result });
          notify('志愿方案已生成');
          navigate(routes.results, { replace: true, state: { celebrate: true } });
        })
      .catch((error: ServiceError): void => setErrors({ submit: error.message }))
      .finally((): void => setSubmitBusy(false));
  }

  if (!Number.isInteger(step) || step < 1 || step > STEP_COUNT) return <Navigate to={routes.wizard(1)} replace />;

  return (
    <>
      {submitBusy && <GenerationLoadingOverlay />}
      <AppShell hideNavigation>
      <header className={styles.header}>
        <Link className={styles.back} to={step === 1 ? routes.home : routes.wizard(step - 1)} aria-label={step === 1 ? '返回首页' : '返回上一步'}><ArrowLeft aria-hidden="true" /></Link>
        <strong>{stepMeta[step - 1].navLabel}</strong>
      </header>
      <div className={styles.progressMeta}><span>第 {step} / {STEP_COUNT} 步</span><span>{stepMeta[step - 1].navLabel}</span></div>
      <div className={styles.progress} role="progressbar" aria-label="向导进度" aria-valuenow={step} aria-valuemin={1} aria-valuemax={STEP_COUNT}>
        {stepMeta.map((item, index) => <span key={item.id} className={index < step ? styles.progressDone : ''} />)}
      </div>
      <motion.section className={styles.body} key={step} variants={staggerContainer} initial="hidden" animate="show">
        <motion.h1 variants={fadeUp} tabIndex={-1}>{stepMeta[step - 1].title}</motion.h1>
        <motion.p className={styles.lead} variants={fadeUp}>{stepMeta[step - 1].description}</motion.p>
        {referenceLoading && <div className={styles.infoBox} role="status"><LoaderCircle className={styles.spin} size={17} aria-hidden="true" /><span>正在加载省份与规则数据…</span></div>}
        {referenceError !== null && <div className={styles.errorBanner} role="alert"><AlertCircle size={18} aria-hidden="true" /><span>{referenceError}</span><button type="button" onClick={loadReferenceData}>重试加载</button></div>}
        {errorMessage !== undefined && <div className={styles.errorBanner} role="alert"><AlertCircle size={18} aria-hidden="true" />{errorMessage}</div>}
        <StepContent
          step={step}
          draft={state.wizardDraft}
          referenceData={referenceData}
          loading={referenceLoading}
          loadError={referenceError}
          currentProvince={currentProvince}
          provinces={provinces}
          errors={errors}
          rankBusy={rankBusy}
          onRetryRank={() => setRankRetryKey((current) => current + 1)}
          onBasic={updateBasic}
          onPreferences={updatePreferences}
          onDraft={updateDraft}
        />
      </motion.section>
      <footer className={styles.footer}>
        <Link className={styles.secondary} to={step === 1 ? routes.home : routes.wizard(step - 1)}>上一步</Link>
        <button className={styles.primary} type="button" onClick={next} disabled={referenceLoading || referenceError !== null || rankBusy || submitBusy}>
          {submitBusy ? <><LoaderCircle className={styles.spin} size={18} aria-hidden="true" />生成中</> : step === STEP_COUNT ? <><Sparkles size={18} aria-hidden="true" />生成志愿方案</> : <>下一步<ArrowRight size={18} aria-hidden="true" /></>}
        </button>
      </footer>
    </AppShell>
    </>
  );
}

interface StepContentProps {
  step: number;
  draft: WizardDraft;
  referenceData: ReferenceData | null;
  loading: boolean;
  loadError: string | null;
  currentProvince: ProvinceConfig | undefined;
  provinces: ProvinceConfig[];
  errors: ValidationErrors;
  rankBusy: boolean;
  onRetryRank(): void;
  onBasic(patch: Partial<WizardDraft['basic']>): void;
  onPreferences(patch: Partial<WizardDraft['preferences']>): void;
  onDraft(draft: WizardDraft): void;
}

function StepContent(props: StepContentProps): JSX.Element | null {
  const { step, errors, loading, loadError } = props;
  if (loading || loadError !== null) return null;
  if (step === 1) return <ProvinceStep {...props} />;
  if (step === 2) return <ScoreStep {...props} />;
  if (step === 3) return <SubjectsStep {...props} />;
  if (step === 4) return <IdentityStep {...props} />;
  if (step === 5) return <PreferenceStep {...props} />;
  return <WeightStep {...props} error={errors.weights} />;
}

function ProvinceStep({ draft, provinces, currentProvince, errors, onBasic }: StepContentProps): JSX.Element {
  function changeProvince(event: ChangeEvent<HTMLSelectElement>): void {
    const code: ProvinceCode = event.target.value;
    const selected: ProvinceConfig | undefined = provinces.find((item) => item.code === code);
    if (selected !== undefined) onBasic({ province: code, examType: selected.examType, subjects: defaultSubjects(selected.subjectRule), provinceRank: null, rankSegment: null });
  }
  return <>
    <label className={styles.field}><span>生源省份</span><select value={draft.basic.province} aria-invalid={Boolean(errors.province)} aria-describedby="province-help" onChange={changeProvince}><option value="" disabled>请选择省份</option>{provinces.map((item) => <option key={item.code} value={item.code}>{item.name}{item.ready ? '' : '（数据建设中）'}</option>)}</select><small id="province-help" className={styles.fieldHint}>可用性及考试规则由参考数据服务提供。</small></label>
    <label className={styles.field}><span>高考模式（已自动推导）</span><select value={draft.basic.examType} disabled aria-describedby="exam-type-help"><option value={draft.basic.examType}>{examTypeLabel(draft.basic.examType)}</option></select><small id="exam-type-help" className={styles.fieldHint}>考试模式随省份规则自动更新，无需手动修改。</small></label>
    <InfoBox tone={currentProvince?.ready === false ? 'warn' : 'info'}>{currentProvince?.ruleSummary ?? '请选择省份以加载对应规则。'}{currentProvince?.ready === false ? '。该省暂未开放推荐生成。' : currentProvince === undefined ? '' : '，已加载对应规则集。'}</InfoBox>
  </>;
}

function ScoreStep({ draft, currentProvince, errors, rankBusy, onRetryRank, onBasic }: StepContentProps): JSX.Element {
  const maxScore = currentProvince?.maxScore ?? 0;
  const rankError = errors.provinceRank;
  return <>
    <label className={styles.field}><span>总分（满分 {maxScore || '—'}）</span><input type="number" min={0} max={maxScore || undefined} value={draft.basic.totalScore ?? ''} aria-invalid={Boolean(errors.totalScore)} aria-describedby="score-help" onChange={(event) => onBasic({ totalScore: event.target.value === '' ? null : Number(event.target.value), provinceRank: null, rankSegment: null })} /></label>
    <div id="score-help" className={styles.rankBox} aria-live="polite" aria-busy={rankBusy}>{rankBusy ? <><LoaderCircle className={styles.spin} aria-hidden="true" /><small>正在反查一分一段表…</small></> : draft.basic.provinceRank !== null ? <><small><Check size={15} aria-hidden="true" /> 系统已自动反查</small><strong>省位次 {draft.basic.provinceRank.toLocaleString('zh-CN')}</strong><span>{draft.basic.rankSegment}</span></> : rankError !== undefined && rankError.length > 0 ? <><span>{rankError}</span><button className={styles.retryRank} type="button" onClick={onRetryRank}>重试反查</button></> : <span>输入总分后自动反查省位次</span>}</div>
    <InfoBox tone="info">位次参考数据由服务按所选省份与考试模式返回，可随数据版本更新。</InfoBox>
  </>;
}

function SubjectsStep({ draft, currentProvince, referenceData, errors, onBasic }: StepContentProps): JSX.Element {
  const rule = currentProvince?.subjectRule;
  const all: SubjectCode[] = rule === undefined ? [] : subjectsForRule(rule);
  const subjectError: string | null = rule === undefined ? '请先选择省份' : validateSubjects(rule, draft.basic.subjects);
  const firstSubjects = rule?.mode === 'FIRST_SECOND' ? rule.firstSubjects : [];
  const subjectLabel = (subject: SubjectCode): string => referenceData?.optionCatalog.subjects.find((item) => item.code === subject)?.label ?? subject;
  function toggle(subject: SubjectCode): void {
    let next: SubjectCode[] = [...draft.basic.subjects];
    if (rule?.mode === 'FIRST_SECOND' && firstSubjects.includes(subject)) {
      next = next.filter((item) => !firstSubjects.includes(item));
      next.push(subject);
    } else if (next.includes(subject)) next = next.filter((item) => item !== subject);
    else next.push(subject);
    onBasic({ subjects: next });
  }
  return <>
    <fieldset className={styles.fieldset} aria-invalid={Boolean(errors.subjects)} aria-describedby="subjects-feedback"><legend>{rule?.mode === 'FIRST_SECOND' ? `首选科目（${rule.firstSubjects.length} 选 ${rule.firstSubjectCount}）+ 再选科目（${rule.secondSubjects.length} 选 ${rule.secondSubjectCount}）` : '请选择合法组合'}</legend><div className={styles.subjectGrid}>{all.map((subject) => <label key={subject} className={`${styles.choiceCard} ${draft.basic.subjects.includes(subject) ? styles.selected : ''}`}><input type={rule?.mode === 'FIRST_SECOND' && firstSubjects.includes(subject) ? 'radio' : 'checkbox'} name={firstSubjects.includes(subject) ? 'first-subject' : subject} checked={draft.basic.subjects.includes(subject)} onChange={() => toggle(subject)} /><span>{subjectLabel(subject)}</span></label>)}</div></fieldset>
    <div id="subjects-feedback"><InfoBox tone={subjectError === null ? 'success' : 'warn'}>{subjectError ?? '组合合法，可继续填写偏好。'}</InfoBox></div>
  </>;
}

function IdentityStep({ draft, currentProvince, referenceData, errors, onBasic }: StepContentProps): JSX.Element {
  const options = referenceData?.optionCatalog.identities ?? [];
  function toggle(identity: SpecialIdentity): void {
    if (identity === 'NONE') { onBasic({ identities: ['NONE'], bonusScore: null }); return; }
    const withoutNone: SpecialIdentity[] = draft.basic.identities.filter((item) => item !== 'NONE');
    const next: SpecialIdentity[] = withoutNone.includes(identity) ? withoutNone.filter((item) => item !== identity) : [...withoutNone, identity];
    onBasic({ identities: next.length === 0 ? ['NONE'] : next });
  }
  const advanced: boolean = !draft.basic.identities.includes('NONE');
  return <>
    <fieldset className={styles.fieldset}><legend>特殊身份 / 加分项（可多选）</legend><div className={styles.chips}>{options.map((identity) => <label key={identity.code} className={`${styles.chip} ${draft.basic.identities.includes(identity.code) ? styles.chipSelected : ''}`}><input type="checkbox" checked={draft.basic.identities.includes(identity.code)} onChange={() => toggle(identity.code)} /><span>{identity.label}</span></label>)}</div></fieldset>
    {advanced && <label className={styles.field}><span>加分值（上限 {currentProvince?.maxBonusScore ?? '—'}）</span><input type="number" min={0} max={currentProvince?.maxBonusScore} value={draft.basic.bonusScore ?? ''} aria-invalid={Boolean(errors.bonusScore)} onChange={(event) => onBasic({ bonusScore: event.target.value === '' ? null : Number(event.target.value) })} /></label>}
    <InfoBox tone="info">专项身份将用于后续批次规则；普通考生保持“无”即可继续。</InfoBox>
  </>;
}

function PreferenceStep({ draft, referenceData, errors, onPreferences }: StepContentProps): JSX.Element {
  const tiers = referenceData?.optionCatalog.schoolTiers ?? [];
  const categories = referenceData?.optionCatalog.majorCategories ?? [];
  const ownership = referenceData?.optionCatalog.ownership ?? [];
  const toggleIn = <T,>(array: T[], item: T): T[] => array.includes(item) ? array.filter((current) => current !== item) : [...array, item];
  return <>
    <fieldset className={styles.fieldset}><legend>院校层次偏好</legend><div className={styles.chips}>{tiers.map((tier) => <label key={tier.code} className={`${styles.chip} ${draft.preferences.schoolTiers.includes(tier.code) ? styles.chipSelected : ''}`}><input type="checkbox" checked={draft.preferences.schoolTiers.includes(tier.code)} onChange={() => onPreferences({ schoolTiers: toggleIn(draft.preferences.schoolTiers, tier.code) })} /><span>{tier.label}</span></label>)}</div></fieldset>
    <fieldset className={styles.fieldset}><legend>院校性质</legend><div className={styles.chips}>{ownership.map((option) => <label key={option.code} className={`${styles.chip} ${draft.preferences.ownership === option.code ? styles.chipSelected : ''}`}><input type="radio" name="ownership" checked={draft.preferences.ownership === option.code} onChange={() => onPreferences({ ownership: option.code })} /><span>{option.label}</span></label>)}</div></fieldset>
    <fieldset className={styles.fieldset}><legend>学科门类</legend><div className={styles.subjectGrid}>{categories.map((category) => <label key={category.code} className={`${styles.choiceCard} ${draft.preferences.majorCategories.includes(category.code) ? styles.selected : ''}`}><input type="checkbox" checked={draft.preferences.majorCategories.includes(category.code)} onChange={() => onPreferences({ majorCategories: toggleIn(draft.preferences.majorCategories, category.code) })} /><span>{category.label}</span></label>)}</div></fieldset>
    <fieldset className={styles.fieldset}><legend>具体专业偏好</legend><SelectableValues values={referenceData?.majors ?? []} selected={draft.preferences.preferredMajors} emptyLabel="暂无可选专业数据" onChange={(preferredMajors) => onPreferences({ preferredMajors })} /></fieldset>
    <fieldset className={styles.fieldset}><legend>期望地区 / 经济圈</legend><SelectableValues values={referenceData?.regions ?? []} selected={draft.preferences.preferredRegions} emptyLabel="暂无可选地区数据" onChange={(preferredRegions) => onPreferences({ preferredRegions })} /></fieldset>
    <fieldset className={styles.fieldset}><legend>排斥地区</legend><SelectableValues values={referenceData?.regions ?? []} selected={draft.preferences.rejectedRegions} emptyLabel="暂无可选地区数据" onChange={(rejectedRegions) => onPreferences({ rejectedRegions })} /></fieldset>
    <fieldset className={styles.fieldset}><legend>绝对不读专业</legend><SelectableValues values={referenceData?.majors ?? []} selected={draft.preferences.blacklistedMajors} emptyLabel="暂无可选专业数据" onChange={(blacklistedMajors) => onPreferences({ blacklistedMajors })} /></fieldset>
    {(errors.majors !== undefined || errors.regions !== undefined) && <div className={styles.preferenceErrors} role="alert">{errors.majors ?? errors.regions}</div>}
    <InfoBox tone="warn">期望与排斥、专业偏好与黑名单不能包含同一项；冲突会阻止进入下一步。</InfoBox>
  </>;
}

function SelectableValues({ values, selected, emptyLabel, onChange }: { values: string[]; selected: string[]; emptyLabel: string; onChange(values: string[]): void }): JSX.Element {
  if (values.length === 0) return <small className={styles.fieldHint}>{emptyLabel}</small>;
  const toggle = (value: string): void => onChange(selected.includes(value)
    ? selected.filter((item) => item !== value)
    : [...selected, value]);
  return <div className={styles.chips}>{values.map((value) => <label key={value} className={`${styles.chip} ${selected.includes(value) ? styles.chipSelected : ''}`}><input type="checkbox" checked={selected.includes(value)} onChange={() => toggle(value)} /><span>{value}</span></label>)}</div>;
}

function WeightStep({ draft, onDraft, error }: StepContentProps & { error: string | undefined }): JSX.Element {
  const labels = uiConfig.wizard.weightLabels;
  const keys: Array<keyof Weights> = ['major', 'school', 'city'];
  function setWeights(weights: Weights): void { onDraft({ ...draft, weights }); }
  return <>
    <div className={styles.weightRows} aria-invalid={Boolean(error)}>{keys.map((key) => <label key={key} className={styles.weightRow}><span><strong>{labels[key]}</strong><b>{draft.weights[key]}</b></span><input aria-label={`${labels[key]}权重`} type="range" min={ruleConstraints.minWeight} max={ruleConstraints.weightTotal} value={draft.weights[key]} onChange={(event) => setWeights(normalizeWeights(draft.weights, key, Number(event.target.value)))} /></label>)}</div>
    <div className={styles.preset} aria-label="权重预设">{uiConfig.wizard.weightPresets.map((preset) => <button key={preset.id} type="button" onClick={() => setWeights({ ...preset.weights })}>{preset.label}</button>)}</div>
    <Distribution weights={draft.weights} />
    <InfoBox tone="info">当前合计 {draft.weights.major + draft.weights.school + draft.weights.city}。拖动任一滑块，另外两项会按比例自动调整，整数和始终为 {ruleConstraints.weightTotal}。</InfoBox>
  </>;
}

function Distribution({ weights }: { weights: Weights }): JSX.Element {
  const bars = useMemo(() => uiConfig.wizard.distribution.map((item) => ({ ...item, value: item.tier === 'REACH' ? Math.max(item.minHeight, weights.city) : item.tier === 'MATCH' ? Math.max(item.minHeight, weights.school) : item.tier === 'SAFE' ? Math.max(item.minHeight, weights.major) : item.minHeight })), [weights]);
  return <div className={styles.preview}><strong>实时预览 · 推荐梯度分布</strong><div>{bars.map((bar) => <span key={bar.tier} style={{ height: `${bar.value}%` }}><b>{bar.countLabel}</b><small>{bar.label}</small></span>)}</div></div>;
}

function InfoBox({ children, tone }: { children: React.ReactNode; tone: 'info' | 'warn' | 'success' }): JSX.Element {
  return <div className={`${styles.infoBox} ${styles[tone]}`}><Info size={17} aria-hidden="true" /><span>{children}</span></div>;
}

function defaultSubjects(rule: ProvinceConfig['subjectRule']): SubjectCode[] {
  if (rule.mode === 'FIXED') return [...rule.subjects];
  if (rule.mode === 'FIRST_SECOND') return [rule.firstSubjects[0], ...rule.secondSubjects.slice(0, rule.secondSubjectCount)];
  return rule.allowedSubjects.slice(0, rule.selectionCount);
}

function subjectsForRule(rule: ProvinceConfig['subjectRule']): SubjectCode[] {
  if (rule.mode === 'FIXED') return [...rule.subjects];
  if (rule.mode === 'FIRST_SECOND') return [...rule.firstSubjects, ...rule.secondSubjects];
  return [...rule.allowedSubjects];
}

