import { Navigate, Route, Routes } from 'react-router-dom';
import { HomePage } from '../pages/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { ProfilePage } from '../pages/ProfilePage';
import { ResultsPage } from '../pages/ResultsPage';
import { VolunteerListPage } from '../pages/VolunteerListPage';
import { WizardPage } from '../pages/WizardPage';
import { RouteErrorBoundary } from './RouteErrorBoundary';

/** 应用路由表。 */
export function App(): JSX.Element {
  return (
    <RouteErrorBoundary>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/wizard" element={<Navigate to="/wizard/1" replace />} />
        <Route path="/wizard/:step" element={<WizardPage />} />
        <Route path="/results" element={<ResultsPage />} />
        <Route path="/volunteers" element={<VolunteerListPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </RouteErrorBoundary>
  );
}
