import { useEffect } from 'react';

import styles from './pages.module.css';

export function SearchPage() {
  useEffect(() => {
    document.title = 'BCal — Search';
  }, []);

  return (
    <div className={styles.foundationCard}>
      <div className={styles.cardHeader}>
        <span className={styles.badge}>Web Phase 5</span>
        <h2 className={styles.cardTitle}>Search Surface Foundation</h2>
      </div>
      <p className={styles.cardDescription}>
        The unified search surface will query across calendar events, tasks, notes, and locations
        with keyboard navigation and instant previews.
      </p>
      <div className={styles.cardDetails}>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Architecture Phase</span>
          <span className={styles.detailValue}>Phase 5 (Today / Search / Settings)</span>
        </div>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Scope</span>
          <span className={styles.detailValue}>Events, Tasks, Notes, Locations</span>
        </div>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Status</span>
          <span className={styles.detailValue}>Foundation Ready</span>
        </div>
      </div>
    </div>
  );
}
