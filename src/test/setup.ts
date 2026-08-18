import '@testing-library/jest-dom/vitest';

// jsdom 未实现 matchMedia；framer-motion 的 MotionConfig(reducedMotion="user")
// 与 useReducedMotion 会调用它。提供最小 polyfill，默认不进入「减少动态效果」模式。
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

beforeEach((): void => {
  window.localStorage.clear();
});
