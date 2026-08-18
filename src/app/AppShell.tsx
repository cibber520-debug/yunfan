import { ClipboardList, Home, LogIn, LogOut, PlusCircle, UserRound } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { AuthDialog } from '../auth/AuthDialog';
import { isAuthEnabled } from '../auth/api';
import { uiConfig } from '../config';
import { routes } from './routes';
import { PageTransition } from '../animations/PageTransition';
import styles from './AppShell.module.css';

interface AppShellProps {
  children: ReactNode;
  wide?: boolean;
  hideNavigation?: boolean;
}

const navigationIcons = { home: Home, wizard: PlusCircle, volunteers: ClipboardList, profile: UserRound } as const;

function navigationTarget(route: (typeof uiConfig.navigation)[number]['route']): string {
  return route === 'wizard' ? routes.wizard(1) : routes[route];
}

function isActiveNavigation(active: (typeof uiConfig.navigation)[number]['active'], target: string, pathname: string): boolean {
  if (active === 'wizard') return pathname.startsWith('/wizard');
  if (active === 'volunteersAndResults') return pathname === routes.volunteers || pathname === routes.results;
  return pathname === target;
}

/** 响应式单列应用壳与主导航。 */
export function AppShell({ children, wide = false, hideNavigation = false }: AppShellProps): JSX.Element {
  const { toast, user, login, logout, notify } = useApp();
  const [showAuth, setShowAuth] = useState(false);
  const location = useLocation();
  useEffect((): void => {
    const title: HTMLElement | null = document.querySelector<HTMLElement>('#main-content h1');
    if (title !== null) {
      title.tabIndex = -1;
      title.focus({ preventScroll: true });
    }
  }, [location.pathname]);
  return (
    <div className={`${styles.shell} ${wide ? styles.wide : ''}`}>
      <main className={styles.main} id="main-content" tabIndex={-1}><PageTransition>{children}</PageTransition></main>
      {!hideNavigation && (
        <nav className={styles.nav} aria-label="主要导航">
          {uiConfig.navigation.map((item) => {
            const to = navigationTarget(item.route);
            const Icon = navigationIcons[item.id as keyof typeof navigationIcons];
            const active = isActiveNavigation(item.active, to, location.pathname);
            return (
              <NavLink key={item.id} to={to} className={`${styles.navLink} ${active ? styles.active : ''}`} aria-current={active ? 'page' : undefined}>
                <Icon size={21} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
          {isAuthEnabled && (user === null ? (
            <button className={styles.authButton} type="button" onClick={() => setShowAuth(true)}><LogIn size={20} aria-hidden="true" /><span>登录</span></button>
          ) : (
            <button className={styles.authButton} type="button" onClick={() => void logout().then(() => notify('已退出登录')).catch(() => notify('退出登录失败，请重试'))} aria-label={`退出 ${user.email ?? user.phone ?? '账户'}`}><LogOut size={20} aria-hidden="true" /><span>退出</span></button>
          ))}
        </nav>
      )}
      <div className={`${styles.toast} ${toast === null ? '' : styles.toastVisible}`} role="status" aria-live="polite">
        {toast?.message ?? ''}
      </div>
      {showAuth && <AuthDialog onClose={() => setShowAuth(false)} onAuthenticated={(authenticated) => { void login(authenticated).then(() => { setShowAuth(false); notify('登录成功，资料已同步'); }).catch(() => { setShowAuth(false); notify('登录成功，但资料恢复失败，请稍后刷新重试'); }); }} />}
    </div>
  );
}
