import { AlertCircle, ClipboardList, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../app/AppShell';
import { uiConfig } from '../config';
import { routes } from '../app/routes';
import { useApp } from '../state/AppContext';
import { recommendationService } from '../services';
import { fadeUp, staggerContainer } from '../animations/variants';
import type { Recommendation, ServiceError } from '../types/domain';
import styles from './VolunteerListPage.module.css';

/** 已选志愿列表，支持删除与确认清空。 */
export function VolunteerListPage(): JSX.Element {
  const { state, dispatch, notify } = useApp();
  const [confirming, setConfirming] = useState<boolean>(false);
  const [restoring, setRestoring] = useState<boolean>(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const all: Recommendation[] = state.recommendationResult?.items ?? [];
  const selected: Recommendation[] = state.selectedVolunteerIds.map((id) => all.find((item) => item.id === id)).filter((item): item is Recommendation => item !== undefined);
  const cushionTier = uiConfig.recommendation.tiers.find((tier) => tier.isCushion);
  const cushionCount = cushionTier === undefined ? 0 : selected.filter((item) => item.tier === cushionTier.code).length;

  useEffect((): void => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);
  useEffect((): (() => void) | undefined => {
    if (!confirming) return undefined;
    const containFocus = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setConfirming(false);
        window.setTimeout(() => triggerRef.current?.focus(), 0);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable: HTMLButtonElement[] = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
      if (focusable.length === 0) return;
      const first: HTMLButtonElement = focusable[0];
      const last: HTMLButtonElement = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', containFocus);
    return (): void => document.removeEventListener('keydown', containFocus);
  }, [confirming]);

  function closeDialog(): void {
    setConfirming(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }
  function remove(id: string): void { dispatch({ type: 'REMOVE_VOLUNTEER', payload: id }); notify('已删除该志愿'); }
  function clear(): void { dispatch({ type: 'CLEAR_VOLUNTEERS' }); closeDialog(); notify('志愿表已清空'); }
  function restoreRecommendations(): void {
    setRestoring(true);
    setRestoreError(null);
    void recommendationService.generate(state.wizardDraft)
      .then((result): void => {
        dispatch({ type: 'SET_RECOMMENDATION', payload: result });
        notify('已按保存的草稿恢复推荐方案');
      })
      .catch((error: ServiceError): void => setRestoreError(error.message))
      .finally((): void => setRestoring(false));
  }

  return <AppShell wide>
    <header className={styles.pageHeader}><h1>我的志愿表</h1><p>按加入顺序保存，可随时回到结果页调整</p></header>
    <section className={styles.content}>
      {state.selectedVolunteerIds.length > 0 && state.recommendationResult === null ? <div className={styles.restore}><ClipboardList size={42} aria-hidden="true" /><h2>已保存 {state.selectedVolunteerIds.length} 个志愿</h2><p>推荐详情不会长期缓存，请按保存的草稿恢复后继续管理。</p>{restoreError !== null && <div role="alert"><AlertCircle size={16} aria-hidden="true" />{restoreError}</div>}<button type="button" onClick={restoreRecommendations} disabled={restoring}>{restoring ? <><LoaderCircle className={styles.spin} size={17} aria-hidden="true" />恢复中</> : '恢复推荐详情'}</button><Link className={styles.textLink} to={routes.wizard(1)}>调整草稿</Link></div> : selected.length === 0 ? <div className={styles.empty}><ClipboardList size={46} aria-hidden="true" /><h2>志愿表还是空的</h2><p>先生成推荐方案，再把心仪院校加入这里。</p><Link to={state.recommendationResult === null ? routes.wizard(1) : routes.results}>去选择志愿</Link></div> : <>
        <div className={styles.summary}><div><strong>已选 {selected.length} 个志愿</strong><span>其中{cushionTier?.name ?? '托底'}档 {cushionCount} 个</span></div><button ref={triggerRef} type="button" onClick={() => setConfirming(true)}>清空全部</button></div>
        {uiConfig.recommendation.tiers.map((tier) => {
          const group: Recommendation[] = selected.filter((item) => item.tier === tier.code);
          if (group.length === 0) return null;
          return <section key={tier.code}><h2 className={styles.tierTitle}>{tier.longName}（{group.length}）</h2><motion.ul className={styles.list} variants={staggerContainer} initial="hidden" animate="show">{group.map((item) => <motion.li className={styles.item} key={item.id} variants={fadeUp} layout><div><h3>{item.schoolName}</h3><p>{item.majorName} · {item.groupName}</p></div><span>{item.probability}%</span><button type="button" aria-label={`删除 ${item.schoolName} ${item.majorName}`} onClick={() => remove(item.id)}><Trash2 size={18} aria-hidden="true" /></button></motion.li>)}</motion.ul></section>;
        })}
        <Link className={styles.addMore} to={routes.results}><Plus size={17} aria-hidden="true" />继续添加</Link>
      </>}
    </section>
    {confirming && <div className={styles.dialogBackdrop} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeDialog(); }}><div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="clear-title" aria-describedby="clear-description"><h2 id="clear-title">确认清空志愿表？</h2><p id="clear-description">此操作会删除全部已选志愿，但不会清除采集草稿和推荐方案。</p><div><button ref={cancelRef} className={styles.cancel} type="button" onClick={closeDialog}>取消</button><button className={styles.confirm} type="button" onClick={clear}>确认清空</button></div></div></div>}
  </AppShell>;
}
