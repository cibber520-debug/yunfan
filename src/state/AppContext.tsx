import {
  createContext,
  type Dispatch,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import type { AppState } from '../types/domain';
import { STORAGE_SCHEMA_VERSION, appReducer, clearState, initialState, loadState, saveState, type AppAction } from './store';
import { authApi, isAuthEnabled } from '../auth/api';
import type { AuthUser } from '../auth/types';

interface ToastState {
  id: number;
  message: string;
}

interface AppContextValue {
  state: AppState;
  dispatch: Dispatch<AppAction>;
  toast: ToastState | null;
  user: AuthUser | null;
  authReady: boolean;
  login(user: AuthUser): Promise<void>;
  logout(): Promise<void>;
  notify(message: string): void;
}

const AppContext = createContext<AppContextValue | null>(null);

/** 提供全局业务状态、持久化和轻量通知。 */
export function AppProvider({ children }: PropsWithChildren): JSX.Element {
  const [state, dispatch] = useReducer(appReducer, undefined, () => isAuthEnabled ? initialState : loadState());
  const [toast, setToast] = useState<ToastState | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const timerRef = useRef<number | null>(null);

  const hydrateAuthenticatedUser = useCallback(async (authenticated: AuthUser): Promise<void> => {
    setAuthReady(false);
    setUser(authenticated);
    try {
      const remote = await authApi.getProfile();
      if (remote !== null) {
        dispatch({
          type: 'HYDRATE',
          payload: {
            wizardDraft: remote.draft,
            completedStep: remote.completedStep,
            selectedVolunteerIds: remote.selectedVolunteerIds,
            recommendationResult: null,
            schemaVersion: STORAGE_SCHEMA_VERSION,
          },
        });
      }
    } catch {
      // 已登录但网络暂不可用时保留本地草稿，不阻断页面使用。
    } finally {
      setAuthReady(true);
    }
  }, []);

  useEffect((): void => {
    if (!isAuthEnabled) {
      setAuthReady(true);
      return;
    }
    void authApi.me().then(async (authenticated): Promise<void> => {
      if (authenticated === null) {
        dispatch({ type: 'HYDRATE', payload: loadState() });
        setAuthReady(true);
        return;
      }
      await hydrateAuthenticatedUser(authenticated);
    });
  }, [hydrateAuthenticatedUser]);

  useEffect(() => {
    if (user === null || !authReady) return undefined;
    const timer = window.setTimeout((): void => {
      void authApi.saveProfile({
        draft: state.wizardDraft,
        completedStep: state.completedStep,
        selectedVolunteerIds: state.selectedVolunteerIds,
      }).catch((): void => {
        // 保存失败不覆盖内存与本地草稿，用户下次操作会再次同步。
      });
    }, 600);
    return (): void => window.clearTimeout(timer);
  }, [authReady, state.completedStep, state.selectedVolunteerIds, state.wizardDraft, user]);

  useEffect((): void => {
    if (!authReady) return;
    saveState({
      wizardDraft: state.wizardDraft,
      completedStep: state.completedStep,
      selectedVolunteerIds: state.selectedVolunteerIds,
      recommendationResult: null,
      schemaVersion: STORAGE_SCHEMA_VERSION,
    });
  }, [authReady, state.wizardDraft, state.completedStep, state.selectedVolunteerIds]);

  useEffect(() => (): void => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const notify = useCallback((message: string): void => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setToast({ id: Date.now(), message });
    timerRef.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  const login = useCallback(async (authenticated: AuthUser): Promise<void> => {
    dispatch({ type: 'HYDRATE', payload: initialState });
    await hydrateAuthenticatedUser(authenticated);
  }, [hydrateAuthenticatedUser]);

  const logout = useCallback(async (): Promise<void> => {
    await authApi.logout();
    clearState();
    setUser(null);
    dispatch({ type: 'HYDRATE', payload: initialState });
  }, []);

  const value: AppContextValue = useMemo(
    () => ({ state, dispatch, toast, user, authReady, login, logout, notify }),
    [authReady, login, logout, notify, state, toast, user],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/** 读取应用 Context；仅允许在 AppProvider 内调用。 */
export function useApp(): AppContextValue {
  const context: AppContextValue | null = useContext(AppContext);
  if (context === null) throw new Error('useApp 必须在 AppProvider 内使用');
  return context;
}
