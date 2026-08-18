import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
}

/**
 * 页面级入场过渡：随路由切换轻微上浮淡入。
 * 仅做入场动画（不做退出动画），避免干扰依赖即时挂载/卸载的路由与列表测试。
 */
export function PageTransition({ children }: PageTransitionProps): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
