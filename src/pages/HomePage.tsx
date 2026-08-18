import { ArrowRight, BarChart3, Compass, ListChecks, ShieldCheck, Sparkles, Sunrise } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { AppShell } from '../app/AppShell';
import { ruleConstraints, STEP_COUNT, uiConfig } from '../config';
import { routes } from '../app/routes';
import { useApp } from '../state/AppContext';
import { fadeUp, staggerContainer } from '../animations/variants';
import styles from './HomePage.module.css';

/** 首页：启动、续填、快速通道与可信说明。 */
export function HomePage(): JSX.Element {
  const { state } = useApp();
  const completed: number = state.completedStep;
  const nextStep: number = Math.min(STEP_COUNT, Math.max(1, completed + 1));
  const progress: number = Math.round(completed / STEP_COUNT * 100);
  const cushionTier = uiConfig.recommendation.tiers.find((tier) => tier.isCushion);
  const tierCount = uiConfig.recommendation.tiers.length;
  return (
    <AppShell>
      <header className={styles.hero}>
        <div className={styles.rays} aria-hidden="true" />
        <span className={styles.blob} aria-hidden="true" />
        <span className={`${styles.blob} ${styles.blobAlt}`} aria-hidden="true" />
        <Sunrise className={styles.sun} size={52} aria-hidden="true" />
        <p className={styles.greeting}>你好，准大学生</p>
        <h1>乘风破浪，直挂云帆</h1>
        <p className={styles.tagline}>用「省位次」为你规划向上的人生航线</p>
        <Link className={styles.heroCta} to={routes.wizard(nextStep)}>
          <span className={styles.ctaIcon}><Compass aria-hidden="true" /></span>
          <span><strong>{completed > 0 ? '继续智能填报' : '开始智能填报'}</strong><small>{STEP_COUNT} 步采集，约 5 分钟生成方案</small></span>
          <ArrowRight size={20} aria-hidden="true" />
        </Link>
        <motion.div className={styles.stats} aria-label="产品特点" variants={staggerContainer} initial="hidden" animate="show">
          <motion.div variants={fadeUp}><strong>省位次</strong><span>跨年主键</span></motion.div>
          <motion.div variants={fadeUp}><strong>{tierCount} 梯度</strong><span>推荐分层</span></motion.div>
          <motion.div variants={fadeUp}><strong>≥{ruleConstraints.minimumCushionCount}</strong><span>{cushionTier?.name ?? '垫'}档候选</span></motion.div>
        </motion.div>
      </header>
      <motion.section className={styles.content} variants={staggerContainer} initial="hidden" animate="show">
        <motion.div className={styles.progressCard} variants={fadeUp}>
          <div className={styles.sectionHeading}><ListChecks size={19} aria-hidden="true" /><strong>我的填报进度</strong><span>{progress}%</span></div>
          <p>{completed === 0 ? `尚未开始，完成 ${STEP_COUNT} 步即可生成专属方案` : `已完成 ${completed} / ${STEP_COUNT} 步，草稿会自动保存`}</p>
          <div className={styles.progress} role="progressbar" aria-label="填报完成进度" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <Link className={styles.primaryButton} to={routes.wizard(nextStep)}>继续填报 <ArrowRight size={18} aria-hidden="true" /></Link>
        </motion.div>
        <h2 className={styles.title}>快速通道</h2>
        <motion.div className={styles.quickGrid} variants={staggerContainer}>
          <motion.div variants={fadeUp}><Link to={routes.wizard(2)}><BarChart3 aria-hidden="true" /><strong>一分一段反查</strong><span>按省份与科类查询位次</span></Link></motion.div>
          <motion.div variants={fadeUp}><Link to={state.recommendationResult === null ? routes.wizard(nextStep) : routes.results}><Sparkles aria-hidden="true" /><strong>推荐梯度</strong><span>{tierCount} 级梯度可视化</span></Link></motion.div>
          <motion.div variants={fadeUp}><Link to={routes.wizard(5)}><Compass aria-hidden="true" /><strong>意向唤醒</strong><span>先门类，再专业</span></Link></motion.div>
          <motion.div variants={fadeUp}><Link to={routes.volunteers}><ShieldCheck aria-hidden="true" /><strong>我的志愿表</strong><span>已选 {state.selectedVolunteerIds.length} 个</span></Link></motion.div>
        </motion.div>
        <h2 className={styles.title}>为什么是云帆</h2>
        <motion.article className={styles.trustCard} variants={staggerContainer}>
          <motion.div variants={fadeUp}><span aria-hidden="true">🌅</span><p><strong>位次主键 · 跨年稳定</strong><small>以省位次为稳定匹配键，避免直接套用上一年的分数线。</small></p></motion.div>
          <motion.div variants={fadeUp}><span aria-hidden="true">🪜</span><p><strong>推荐分层 · 可解释</strong><small>方案遵循配置化的梯度与托底策略，所有概率均为估算而非承诺。</small></p></motion.div>
        </motion.article>
      </motion.section>
    </AppShell>
  );
}
