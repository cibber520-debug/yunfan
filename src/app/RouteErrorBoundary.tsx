import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { routes } from './routes';

interface RouteErrorBoundaryProps {
  children: ReactNode;
}

interface RouteErrorBoundaryState {
  errorMessage: string | null;
}

/** 捕获页面渲染异常并提供刷新和返回首页的安全恢复路径。 */
export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  public state: RouteErrorBoundaryState = { errorMessage: null };

  public static getDerivedStateFromError(error: unknown): RouteErrorBoundaryState {
    const errorMessage: string = error instanceof Error ? error.message : '发生未知页面错误';
    return { errorMessage };
  }

  public componentDidCatch(error: unknown, info: ErrorInfo): void {
    if (import.meta.env.DEV) console.error('页面渲染失败', error, info.componentStack);
  }

  public render(): ReactNode {
    if (this.state.errorMessage === null) return this.props.children;
    return (
      <main className="routeError" role="alert">
        <AlertTriangle size={50} aria-hidden="true" />
        <h1>页面暂时无法显示</h1>
        <p>你的采集草稿和已选志愿仍保存在本机，可以刷新重试或返回首页。</p>
        <details><summary>查看错误摘要</summary><code>{this.state.errorMessage}</code></details>
        <div>
          <button type="button" onClick={() => window.location.reload()}><RefreshCw size={17} aria-hidden="true" />刷新重试</button>
          <a href={routes.home}><Home size={17} aria-hidden="true" />返回首页</a>
        </div>
      </main>
    );
  }
}
