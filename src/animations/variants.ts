import type { Variants } from 'framer-motion';

/** 自底部轻微上浮并淡入，作为页面与卡片的通用入场。 */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  },
};

/** 自顶部轻微下沉并淡入，用于头部区域。 */
export const fadeDown: Variants = {
  hidden: { opacity: 0, y: -14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  },
};

/** 缩放淡入，用于气泡、徽标与浮层。 */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.32, ease: 'easeOut' },
  },
};

/** 子元素错峰入场容器，配合 fadeUp / scaleIn 等子变体使用。 */
export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.07, delayChildren: 0.04 },
  },
};
