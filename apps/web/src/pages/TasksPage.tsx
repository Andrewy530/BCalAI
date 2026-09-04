import { useEffect } from 'react';

import styles from './pages.module.css';

export function TasksPage() {
  useEffect(() => {
    document.title = 'BCal — Tasks';
  }, []);

  return (
    <div className={styles.foundationCard}>
      <div className={styles.cardHeader}>
        <span className={styles.badge}>Web Phase 2</span>
        <h2 className={styles.cardTitle}>Tasks &amp; Inbox Surface Foundation</h2>
      </div>
      <p className={styles.cardDescription}>
        The desktop tasks surface will manage task lists, inbox triage, task CRUD, completion
        status, snooze/due dates, and priority tagging, preceded by an evaluation of shared
        data-access extraction.
      </p>
      <div className={styles.cardDetails}>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Architecture Phase</span>
          <span className={styles.detailValue}>Phase 2 (Tasks / Inbox)</span>
        </div>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Next Milestone</span>
          <span className={styles.detailValue}>Evaluate shared data-access extraction</span>
        </div>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Status</span>
          <span className={styles.detailValue}>Foundation Ready</span>
        </div>
      </div>
    </div>
  );
}
