import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '../../../lib/query/query-client';
import { useAuth } from '../../auth';
import { searchEverything } from '../api/search.api';

/** Cached combined event/task search, enabled once the query is meaningful. */
export function useSearch(query: string) {
  const { isAuthenticated } = useAuth();
  const normalized = query.trim();

  return useQuery({
    queryKey: queryKeys.search(normalized),
    queryFn: () => searchEverything(normalized),
    enabled: isAuthenticated && normalized.length >= 2,
    staleTime: 30_000,
  });
}
