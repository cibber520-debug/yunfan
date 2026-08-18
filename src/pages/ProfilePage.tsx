import { Bell, ChevronRight, CircleHelp, ClipboardList, Compass, Info, Settings, Sparkles, UserRound } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { AppShell } from '../app/AppShell';
import { uiConfig } from '../config';
import { routes } from '../app/routes';
import { useApp } from '../state/AppContext';
import { fadeUp, staggerContainer } from '../animations/variants';
import styles from './ProfilePage.module.css';

/** 个人中心与规划中能力入口。 */
export function ProfilePage(): JSX.Element {
  const { state, notify, user } = useApp();
  const draft = state.wizardDraft;
  const cushionTier = uiConfig.recommendation.tiers.find((tier) => tier.isCushion);
  const summaryLabel = cushionTier === undefined ? '托底候选' : `${cushionTier.name}档候选`;
  const profile = state.recommendationResult?.profile;
  const provinceLabel = profile?.provinceName ?? (draft.basic.province || '未选择省份');
  const examLabel = profile?.examTypeLabel ?? '高考模式待确认';
  return <AppShell>
    <header className={styles.hero}><div className={styles.avatar}><UserRound aria-hidden="true" /></div><div><h1>{user?.displayName ?? '准大学生'}</h1><p>{user?.email !== undefined ? `${user.email} · ` : ''}{provinceLabel} · {examLabel} · {draft.basic.totalScore ?? '--'} 分 · 省位次 {draft.basic.provinceRank?.toLocaleString('zh-CN') ?? '--'}</p></div></header>
    <motion.section className={styles.content} variants={staggerContainer} initial="hidden" animate="show">
      <motion.div className={styles.metrics} variants={fadeUp}><div><strong>{state.recommendationResult === null ? 0 : 1}</strong><span>我的方案</span></div><div><strong>{cushionTier === undefined ? 0 : state.recommendationResult?.items.filter((item) => item.tier === cushionTier.code).length ?? 0}</strong><span>{summaryLabel}</span></div><div><strong>{state.selectedVolunteerIds.length}</strong><span>已选志愿</span></div></motion.div>
      <motion.div className={styles.planning} variants={fadeUp}><Sparkles aria-hidden="true" /><div><strong>安心规划服务</strong><p>专家复核与志愿保险属于后续阶段</p></div><button type="button" onClick={() => notify('安心规划服务正在规划中')}>规划中</button></motion.div>
      <h2>常用</h2><motion.div className={styles.menu} variants={fadeUp}><MenuLink to={routes.volunteers} icon={<ClipboardList />} label="我的志愿表" /><MenuLink to={routes.wizard(1)} icon={<Compass />} label="重新填报 / 查看进度" /><MenuButton icon={<Bell />} label="消息通知" onClick={() => notify('消息中心正在规划中')} /></motion.div>
      <motion.div className={styles.menu} variants={fadeUp}><MenuButton icon={<CircleHelp />} label="帮助中心" onClick={() => notify('帮助中心正在规划中')} /><MenuButton icon={<Settings />} label="设置" onClick={() => notify('设置功能正在规划中')} /><MenuButton icon={<Info />} label="关于云帆志愿" onClick={() => notify('云帆志愿 v1.0 · 纯前端演示')} /></motion.div>
      <motion.p className={styles.version} variants={fadeUp}>云帆志愿 v1.0 · 乘风破浪，直挂云帆</motion.p>
    </motion.section>
  </AppShell>;
}

function MenuLink({ to, icon, label }: { to: string; icon: JSX.Element; label: string }): JSX.Element { return <Link to={to}><span>{icon}</span><strong>{label}</strong><ChevronRight aria-hidden="true" /></Link>; }
function MenuButton({ icon, label, onClick }: { icon: JSX.Element; label: string; onClick(): void }): JSX.Element { return <button type="button" onClick={onClick}><span>{icon}</span><strong>{label}</strong><ChevronRight aria-hidden="true" /></button>; }
