import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import styles from './GenerationLoadingOverlay.module.css';

const STAGES = [
  '分析你的高考分数与省位次…',
  '结合选科与院校偏好筛选候选…',
  '测算冲 / 稳 / 保 / 垫 梯度…',
  '生成专属志愿方案…',
];

/**
 * 生成志愿方案期间的等待动画：在客户端尚未收到服务端响应时全屏播放。
 * 属于纯展示态，不提供关闭入口（生成完成或服务报错后会由父组件移除）。
 */
export function GenerationLoadingOverlay(): JSX.Element {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setStage((current) => (current + 1) % STAGES.length);
    }, 1500);
    return (): void => window.clearInterval(id);
  }, []);

  const progress = ((stage + 1) / STAGES.length) * 100;

  return (
    <div className={styles.overlay} role="alertdialog" aria-busy="true" aria-label="正在生成志愿方案">
      <div className={styles.panel}>
        <div className={styles.orb} aria-hidden="true">
          <span className={styles.ring} />
          <span className={styles.ringSlow} />
          <span className={styles.core}>
            <Sparkles size={34} />
          </span>
          <span className={styles.chip} style={{ top: '-6%', left: '74%' }}>冲</span>
          <span className={styles.chip} style={{ top: '70%', left: '88%' }}>稳</span>
          <span className={styles.chip} style={{ top: '88%', left: '20%' }}>保</span>
          <span className={styles.chip} style={{ top: '8%', left: '12%' }}>垫</span>
        </div>
        <h2 className={styles.title}>AI 正在为你智能匹配志愿方案</h2>
        <p className={styles.stage} aria-live="polite">{STAGES[stage]}</p>
        <div className={styles.progress} role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
          <span className={styles.bar} style={{ width: `${progress}%` }} />
        </div>
        <p className={styles.hint}>由 deepseek 大模型驱动，预计十几秒完成</p>
      </div>
    </div>
  );
}
