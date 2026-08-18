import { Home, MapPinOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppShell } from '../app/AppShell';
import { routes } from '../app/routes';
import styles from './NotFoundPage.module.css';

/** 未知路由恢复页。 */
export function NotFoundPage(): JSX.Element {
  return <AppShell hideNavigation><section className={styles.page}><MapPinOff size={52} aria-hidden="true" /><h1>页面走丢了</h1><p>你访问的地址不存在，返回首页即可继续使用已保存的草稿。</p><Link to={routes.home}><Home size={18} aria-hidden="true" />返回首页</Link></section></AppShell>;
}
