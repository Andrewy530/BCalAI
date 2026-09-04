import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import styles from './pages.module.css';
import { SignInForm, useAuth } from '../features/auth';

export function SignInPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const destination =
    (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/today';

  useEffect(() => {
    document.title = 'BCal — Sign In';
  }, []);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate(destination, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, destination]);

  return (
    <div className={styles.loginPage}>
      <SignInForm onSuccess={() => navigate(destination, { replace: true })} />
    </div>
  );
}
