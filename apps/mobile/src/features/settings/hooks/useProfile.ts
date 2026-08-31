import type { Profile, UpdateProfileInput } from '@cal/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../../lib/query/query-client';
import { useAuth } from '../../auth';
import { fetchProfile, updateProfile } from '../api/profile.api';

export function useProfile() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.profile(),
    queryFn: fetchProfile,
    enabled: isAuthenticated,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateProfileInput) => updateProfile(input),
    // Preferences should feel instant; the server value replaces this on settle.
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.profile() });
      const previous = queryClient.getQueryData<Profile>(queryKeys.profile());
      if (previous) {
        // Drop unset keys so an absent field cannot blank out a real value.
        const patch = Object.fromEntries(
          Object.entries(input).filter(([, value]) => value !== undefined),
        );
        queryClient.setQueryData<Profile>(queryKeys.profile(), { ...previous, ...patch });
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.profile(), context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile() });
    },
  });
}

/** The user's planning time zone, falling back to the device's. */
export function useUserTimeZone(): string {
  const { data } = useProfile();
  return data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}
