import type { PropsWithChildren } from 'react';
import { BrowserRouter, HashRouter } from 'react-router-dom';

export type RouterMode = 'browser' | 'hash';

/** 根据页面协议选择适合当前运行环境的路由历史实现。 */
export function selectRouterMode(protocol: string): RouterMode {
  return protocol === 'file:' ? 'hash' : 'browser';
}

/** 本地文件使用 HashRouter，HTTP(S) 部署保留 BrowserRouter 深链。 */
export function RuntimeRouter({ children }: PropsWithChildren): JSX.Element {
  if (selectRouterMode(window.location.protocol) === 'hash') {
    return <HashRouter>{children}</HashRouter>;
  }
  return <BrowserRouter>{children}</BrowserRouter>;
}
