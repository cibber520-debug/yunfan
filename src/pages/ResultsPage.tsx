import { AlertTriangle, ArrowLeft, Check, ClipboardList, Info, RefreshCw, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { type KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AppShell } from '../app/AppShell';
import { confidenceLabel, STEP_COUNT, tierConfig, uiConfig } from '../config';
import { routes } from '../app/routes';
import { useApp } from '../state/AppContext';
import { Celebration } from '../animations/Celebration';
import { fadeUp, staggerContainer } from '../animations/variants';
import type { Recommendation, Tier } from '../types/domain';
import styles from './ResultsPage.module.css';

const tiers: Tier[] = uiConfig.recommendation.tiers.map((tier) => tier.code);

/** 推荐结果：四梯度、降级、预测标签及志愿选择。 */
export function ResultsPage(): JSX.Element {
  const { state, dispatch, notify } = useApp();
  const [activeTier, setActiveTier] = useState<Tier>(tiers[0]);
  const [showStrict, setShowStrict] = useState<boolean>(false);
  const location = useLocation();
  const justGenerated: boolean = (location.state as { celebrate?: boolean } | null)?.celebrate === true && import.meta.env.MODE !== 'test';
  const [celebrate, setCelebrate] = useState<boolean>(justGenerated);
  const result = state.recommendationResult;
  const items: Recommendation[] = useMemo(
    () => result === null ? [] : showStrict ? result.strictItems : result.items,
    [result, showStrict],
  );
  const visible: Recommendation[] = useMemo(() => items.filter((item) => item.tier === activeTier), [activeTier, items]);

  useEffect(() => {
    if (!celebrate) return;
    const id: number = window.setTimeout(() => setCelebrate(false), 1500);
    return (): void => window.clearTimeout(id);
  }, [celebrate]);

  if (result === null) {
    const resumeStep: number = Math.max(1, Math.min(STEP_COUNT, state.completedStep + 1));
    return <AppShell><section className={styles.empty}><Sparkles size={48} aria-hidden="true" /><h1>还没有可展示的志愿方案</h1><p>推荐结果不会长期缓存，请完成采集重新生成。草稿仍已安全保存。</p><Link to={routes.wizard(resumeStep)}>继续填写并生成</Link><Link className={styles.textLink} to={routes.home}>返回首页</Link></section></AppShell>;
  }

  function selectTier(tier: Tier): void { setActiveTier(tier); }
  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next: number = event.key === 'Home' ? 0 : event.key === 'End' ? tiers.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : tiers.length - 1)) % tiers.length;
    setActiveTier(tiers[next]);
    document.getElementById(`tier-tab-${tiers[next]}`)?.focus();
  }
  function toggle(id: string): void {
    const adding: boolean = !state.selectedVolunteerIds.includes(id);
    dispatch({ type: 'TOGGLE_VOLUNTEER', payload: id });
    notify(adding ? '已加入志愿表' : '已从志愿表移除');
  }

  return (
    <AppShell wide>
      {celebrate && <Celebration />}
      <header className={styles.hero}>
        <Link to={routes.home} aria-label="返回首页"><ArrowLeft aria-hidden="true" /></Link>
        <h1>你的志愿方案已生成</h1>
        <p>{result.profile.provinceName ?? '所选省份'} · {result.profile.examTypeLabel ?? '所选高考模式'} · {result.profile.totalScore} 分 · 省位次 {result.profile.provinceRank.toLocaleString('zh-CN')}</p>
      </header>
      {result.degradation !== null && !showStrict && <div className={styles.degradation} role="status"><AlertTriangle aria-hidden="true" /><div><strong>{result.degradation.message}</strong><p>{result.degradation.details}</p><button type="button" onClick={() => { setShowStrict(true); notify('已恢复原始偏好视图'); }}><RefreshCw size={14} aria-hidden="true" />恢复原始偏好</button></div></div>}
      {showStrict && <div className={styles.strictBanner}><Info aria-hidden="true" /><span>正在查看原始严格偏好结果，共 {result.strictItems.length} 条。<button type="button" onClick={() => setShowStrict(false)}>返回完整梯度方案</button></span></div>}
      <div className={styles.tabs} role="tablist" aria-label="推荐梯度">
        {tiers.map((tier, index) => {
          const count: number = items.filter((item) => item.tier === tier).length;
          const label = tierConfig(tier);
          const active = activeTier === tier;
          return <button key={tier} id={`tier-tab-${tier}`} type="button" role="tab" aria-selected={active} aria-controls={`tier-panel-${tier}`} tabIndex={active ? 0 : -1} className={`${styles.tab} ${styles[tier.toLowerCase()]} ${active ? styles.tabActive : ''}`} onClick={() => selectTier(tier)} onKeyDown={(event) => handleTabKey(event, index)}><strong>{label?.name ?? tier}</strong><small>{count} 个</small>{active && <motion.span className={styles.tabIndicator} layoutId="tierTabIndicator" transition={{ type: 'spring', stiffness: 380, damping: 30 }} />}</button>;
        })}
      </div>
      <section id={`tier-panel-${activeTier}`} role="tabpanel" aria-labelledby={`tier-tab-${activeTier}`} className={styles.panel}>
        <div className={styles.tierIntro}><strong>{tierConfig(activeTier)?.name ?? activeTier} · {tierConfig(activeTier)?.english ?? ''}</strong><span>估算概率 {tierConfig(activeTier)?.range ?? '—'}</span></div>
        {visible.length === 0 ? <div className={styles.noItems}><Info aria-hidden="true" /><p>原始偏好下该梯度暂无候选。可返回完整梯度方案查看降级结果。</p></div> : <motion.div key={activeTier} className={styles.grid} variants={staggerContainer} initial="hidden" animate="show">{visible.map((item) => <RecommendationCard key={item.id} item={item} selected={state.selectedVolunteerIds.includes(item.id)} onToggle={() => toggle(item.id)} />)}</motion.div>}
      </section>
      <aside className={styles.disclaimer}><Info aria-hidden="true" /><p><strong>预测非承诺</strong>{result.disclaimer}</p></aside>
      <footer className={styles.summary}><span>已选 <strong>{state.selectedVolunteerIds.length}</strong> 个志愿</span><Link to={routes.volunteers}><ClipboardList size={18} aria-hidden="true" />查看志愿表</Link></footer>
    </AppShell>
  );
}

function RecommendationCard({ item, selected, onToggle }: { item: Recommendation; selected: boolean; onToggle(): void }): JSX.Element {
  const confidence: string = confidenceLabel(item.confidence);
  const tier = tierConfig(item.tier);
  return <motion.article className={styles.card} variants={fadeUp}>
    <div className={styles.cardTop}><div><h2>{item.schoolName}</h2><p>{item.majorName} · {item.groupName}</p></div><div className={styles.probability}><strong>{item.probability}%</strong><span>录取概率估算</span></div></div>
    <div className={styles.badges}><span className={styles.tierBadge}>{tier?.name ?? item.tier} {tier?.english ?? ''}</span>{item.predicted && <span className={styles.predicted}>预测数据</span>}<span>置信度{confidence} {Math.round(item.confidence * 100)}%</span>{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
    <div className={styles.cardBottom}><p><Info size={14} aria-hidden="true" />{item.reason}</p><button type="button" className={selected ? styles.added : ''} onClick={onToggle}>{selected ? <><Check size={16} aria-hidden="true" />已加入</> : '+ 加入'}</button></div>
  </motion.article>;
}
