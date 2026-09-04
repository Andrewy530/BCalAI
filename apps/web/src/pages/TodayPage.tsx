import { useEffect } from 'react';

import styles from './pages.module.css';

export function TodayPage() {
  useEffect(() => {
    document.title = 'BCal — Today';
  }, []);

  return (
    <div className={styles.foundationCard}>
      <div className={styles.cardHeader}>
        <span className={styles.badge}>Web Phase 5</span>
        <h2 className={styles.cardTitle}>Today Surface Foundation</h2>
      </div>
      <p className={styles.cardDescription}>
        The merged Today view will combine schedule events, overdue tasks, unscheduled work, and
        intelligent planning recommendations into a single desktop timeline.
      </p>
      <div className={styles.cardDetails}>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Architecture Phase</span>
          <span className={styles.detailValue}>Phase 5 (Post-Calendar/Tasks)</span>
        </div>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Domain Dependency</span>
          <span className={styles.detailValue}>@cal/domain/calendar/today</span>
        </div>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Status</span>
          <span className={styles.detailValue}>Foundation Ready</span>
        </div>
      </div>
    </div>
  );
}
