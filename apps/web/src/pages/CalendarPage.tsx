import { useEffect } from 'react';

import styles from './pages.module.css';

export function CalendarPage() {
  useEffect(() => {
    document.title = 'BCal — Calendar';
  }, []);

  return (
    <div className={styles.foundationCard}>
      <div className={styles.cardHeader}>
        <span className={styles.badge}>Web Phase 3 &amp; 4</span>
        <h2 className={styles.cardTitle}>Calendar Surface Foundation</h2>
      </div>
      <p className={styles.cardDescription}>
        The desktop calendar will support day, week, and month views, bounded event range reads,
        deterministic recurrence expansion through @cal/domain, and provider-first write rules.
      </p>
      <div className={styles.cardDetails}>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Architecture Phase</span>
          <span className={styles.detailValue}>Phase 3 (Read) &amp; Phase 4 (Editing)</span>
        </div>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Recurrence Engine</span>
          <span className={styles.detailValue}>@cal/domain/recurrence</span>
        </div>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Status</span>
          <span className={styles.detailValue}>Foundation Ready</span>
        </div>
      </div>
    </div>
  );
}
