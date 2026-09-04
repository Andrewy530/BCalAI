import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import styles from './pages.module.css';

export function NotFoundPage() {
  useEffect(() => {
    document.title = 'BCal — Page Not Found';
  }, []);

  return (
    <div className={styles.foundationCard}>
      <div className={styles.cardHeader}>
        <span className={styles.badge}>404</span>
        <h2 className={styles.cardTitle}>Page Not Found</h2>
      </div>
      <p className={styles.cardDescription}>
        The requested page does not exist in the BCal web client.
      </p>
      <div className={styles.cardDetails}>
        <Link
          to="/today"
          style={{
            color: 'var(--color-accent)',
            fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-medium)',
          }}
        >
          &larr; Return to Today
        </Link>
      </div>
    </div>
  );
}
