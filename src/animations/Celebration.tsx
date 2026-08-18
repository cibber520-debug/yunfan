import { motion, useReducedMotion } from 'framer-motion';
import { useMemo } from 'react';

const COLORS = ['#ff6b5c', '#ff9f43', '#ffc93c', '#4da3ff', '#2ed47a', '#1ab6c4'];
const COUNT = 30;

/**
 * 生成成功时的庆祝特效：以 DOM 粒子向四周迸射并淡出，无任何外部 canvas 依赖。
 * 尊重「减少动态效果」偏好；在测试环境中由调用方按需关闭。
 */
export function Celebration(): JSX.Element | null {
  const reduceMotion: boolean | null = useReducedMotion();

  const pieces = useMemo(
    () =>
      Array.from({ length: COUNT }, (_, index) => {
        const angle = (Math.PI * 2 * index) / COUNT + Math.random() * 0.6;
        const distance = 90 + Math.random() * 130;
        return {
          id: index,
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance - 30,
          rotate: Math.random() * 540 - 270,
          color: COLORS[index % COLORS.length],
          delay: Math.random() * 0.08,
          size: 7 + Math.random() * 6,
          round: index % 3 === 0,
        };
      }),
    [],
  );

  if (reduceMotion === true) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: '38%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 60,
      }}
    >
      {pieces.map((piece) => (
        <motion.span
          key={piece.id}
          initial={{ opacity: 1, x: 0, y: 0, scale: 0.4, rotate: 0 }}
          animate={{ opacity: 0, x: piece.x, y: piece.y, scale: 1, rotate: piece.rotate }}
          transition={{ duration: 1.1, delay: piece.delay, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            width: piece.size,
            height: piece.size,
            background: piece.color,
            borderRadius: piece.round ? '50%' : '2px',
          }}
        />
      ))}
    </div>
  );
}
