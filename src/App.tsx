import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { DashboardPage } from './pages/DashboardPage';
import { DiscoverPage } from './pages/DiscoverPage';
import { CandidatesPage } from './pages/CandidatesPage';
import { ClipsPage } from './pages/ClipsPage';
import { QueuePage } from './pages/QueuePage';
import { SettingsPage } from './pages/SettingsPage';
import { VideoTestPage } from './pages/VideoTestPage';
import { RawVideoTestPage } from './pages/RawVideoTestPage';
import { VideoRealityTestPage } from './pages/VideoRealityTestPage';

const AppContent: React.FC = () => {
  const { currentPage, user } = useApp();

  if (window.location.pathname === '/video-reality-test' || currentPage === 'video-reality-test') {
    return <VideoRealityTestPage />;
  }

  if (window.location.pathname === '/raw-video-test' || currentPage === 'raw-video-test') {
    return <RawVideoTestPage />;
  }

  // If path is /video-test or currentPage is video-test
  if (window.location.pathname === '/video-test' || currentPage === 'video-test') {
    return <VideoTestPage />;
  }

  // Remove auth restrictions: always render app content
  if (currentPage === 'login') {
    // If user navigates to login, send them to dashboard
    return <AppLayout><DashboardPage /></AppLayout>;
  }

  if (currentPage === 'onboarding') {
    return <OnboardingPage />;
  }

  const renderCurrentPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage />;
      case 'discover':
        return <DiscoverPage />;
      case 'candidates':
        return <CandidatesPage />;
      case 'clips':
        return <ClipsPage />;
      case 'queue':
        return <QueuePage />;
      case 'settings':
        return <SettingsPage />;
      case 'video-test' as any:
        return <VideoTestPage />;
      case 'raw-video-test' as any:
        return <RawVideoTestPage />;
      case 'video-reality-test' as any:
        return <VideoRealityTestPage />;
      default:
        return <DashboardPage />;
    }
  };

  return <AppLayout>{renderCurrentPage()}</AppLayout>;
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
