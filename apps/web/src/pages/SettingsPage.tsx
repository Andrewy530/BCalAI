import { useEffect } from 'react';

import styles from './pages.module.css';

export function SettingsPage() {
  useEffect(() => {
    document.title = 'BCal — Settings';
  }, []);

  return (
    <div className={styles.foundationCard}>
      <div className={styles.cardHeader}>
        <span className={styles.badge}>Web Phase 5 &amp; 6</span>
        <h2 className={styles.cardTitle}>Settings Surface Foundation</h2>
      </div>
      <p className={styles.cardDescription}>
        Web settings will provide profile management, planning preferences (working hours,
        timezone), connected account management (Google, Microsoft), and account lifecycle actions.
      </p>
      <div className={styles.cardDetails}>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Architecture Phase</span>
          <span className={styles.detailValue}>
            Phase 5 (Preferences) &amp; Phase 6 (Integrations)
          </span>
        </div>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Integrations</span>
          <span className={styles.detailValue}>Google Calendar, Microsoft Graph</span>
        </div>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Status</span>
          <span className={styles.detailValue}>Foundation Ready</span>
        </div>
      </div>
    </div>
  );
}
