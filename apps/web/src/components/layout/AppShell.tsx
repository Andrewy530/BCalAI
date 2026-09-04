import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import styles from './AppShell.module.css';
import { signOut, useAuth } from '../../features/auth';

interface NavItemConfig {
  to: string;
  label: string;
  icon: (props: { className?: string }) => React.JSX.Element;
}

function TodayIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function TasksIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

const PRIMARY_NAV: NavItemConfig[] = [
  { to: '/today', label: 'Today', icon: TodayIcon },
  { to: '/calendar', label: 'Calendar', icon: CalendarIcon },
  { to: '/tasks', label: 'Tasks', icon: TasksIcon },
  { to: '/search', label: 'Search', icon: SearchIcon },
];

const ROUTE_TITLES: Record<string, string> = {
  '/today': 'Today',
  '/calendar': 'Calendar',
  '/tasks': 'Tasks',
  '/search': 'Search',
  '/settings': 'Settings',
};

export function AppShell() {
  const { email } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const currentTitle = ROUTE_TITLES[location.pathname] ?? 'BCal';

  async function handleSignOut() {
    try {
      await signOut();
      navigate('/login', { replace: true });
    } catch {
      // Sign out locally regardless of network response
      navigate('/login', { replace: true });
    }
  }

  return (
    <div className={styles.layout}>
      {/* Sidebar Navigation */}
      <aside className={styles.sidebar} aria-label="Sidebar Navigation">
        <div className={styles.brand}>
          <div className={styles.brandLogo} aria-hidden="true">
            B
          </div>
          <span className={styles.brandName}>BCal</span>
          <span className={styles.brandTag}>Web</span>
        </div>

        <nav className={styles.nav} aria-label="Main navigation">
          <div className={styles.navGroup}>
            {PRIMARY_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
                }
              >
                <span className={styles.navIcon}>
                  <item.icon />
                </span>
                <span className={styles.navLabel}>{item.label}</span>
              </NavLink>
            ))}
          </div>

          <div className={styles.navSpacer} />

          <div className={styles.navGroup}>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
              }
            >
              <span className={styles.navIcon}>
                <SettingsIcon />
              </span>
              <span className={styles.navLabel}>Settings</span>
            </NavLink>
          </div>
        </nav>

        <div className={styles.sidebarFooter}>
          {email && (
            <div className={styles.userCard} title={email}>
              <span className={styles.userEmail}>{email}</span>
            </div>
          )}
          <button
            type="button"
            className={styles.signOutButton}
            onClick={handleSignOut}
            aria-label="Sign out of BCal"
          >
            <SignOutIcon />
            <span className={styles.signOutText}>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className={styles.mainContent}>
        <header className={styles.topBar}>
          <h1 className={styles.pageTitle}>{currentTitle}</h1>
        </header>

        <main className={styles.contentArea}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
