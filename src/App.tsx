import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { FirebaseProvider } from './firebase/auth/AuthContext.tsx';
import { OddsHunterProvider, useOddsHunter } from './hooks/useOddsHunter.tsx';
import { ThemeProvider } from './hooks/useTheme.tsx';
import { DashboardLayout } from './layouts/DashboardLayout.tsx';
import { AdminControlCenterPage } from './pages/AdminControlCenterPage.tsx';
import { AdvancedFiltersPage } from './pages/AdvancedFiltersPage.tsx';
import { BetSlipBuilderPage } from './pages/BetSlipBuilderPage.tsx';
import { BookingCodesPage } from './pages/BookingCodesPage.tsx';
import { CrossTransferPage } from './pages/CrossTransferPage.tsx';
import { DataSourcesPage } from './pages/DataSourcesPage.tsx';
import { DiagnosticsPage } from './pages/DiagnosticsPage.tsx';
import { FavoritesPage } from './pages/FavoritesPage.tsx';
import { LiveMatchesPage } from './pages/LiveMatchesPage.tsx';
import { OddsScannerPage } from './pages/OddsScannerPage.tsx';
import { ScanHistoryPage } from './pages/ScanHistoryPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { StatsDashboardPage } from './pages/StatsDashboardPage.tsx';
import { TicketDetailsPage } from './pages/TicketDetailsPage.tsx';
import { TicketFeedPage } from './pages/TicketFeedPage.tsx';
import { UpcomingMatchesPage } from './pages/UpcomingMatchesPage.tsx';

function ActiveSectionRouter() {
  const { activeSection } = useOddsHunter();

  switch (activeSection) {
    case 'feed':
      return <TicketFeedPage />;
    case 'ticket-details':
      return <TicketDetailsPage />;
    case 'transfer':
      return <CrossTransferPage />;
    case 'stats':
      return <StatsDashboardPage />;
    case 'favorites':
      return <FavoritesPage />;
    case 'admin-control':
      return <AdminControlCenterPage />;
    case 'live':
      return <LiveMatchesPage />;
    case 'upcoming':
      return <UpcomingMatchesPage />;
    case 'scanner':
      return <OddsScannerPage />;
    case 'filters':
      return <AdvancedFiltersPage />;
    case 'betslip':
      return <BetSlipBuilderPage />;
    case 'booking-codes':
      return <BookingCodesPage />;
    case 'history':
      return <ScanHistoryPage />;
    case 'data-sources':
      return <DataSourcesPage />;
    case 'settings':
      return <SettingsPage />;
    case 'diagnostics':
      return <DiagnosticsPage />;
    default:
      return <TicketFeedPage />;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <FirebaseProvider>
        <ThemeProvider>
          <OddsHunterProvider>
            <DashboardLayout>
              <ActiveSectionRouter />
            </DashboardLayout>
          </OddsHunterProvider>
        </ThemeProvider>
      </FirebaseProvider>
    </ErrorBoundary>
  );
}
