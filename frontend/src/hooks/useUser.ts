import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import type { User } from '../api/types';

export function useUser() {
  return useQuery<User | null>({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        const res = await api<{ user: User }>('/api/me');
        return res.user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return async () => {
    await api('/api/auth/logout', { method: 'POST' });
    qc.setQueryData(['me'], null);
    qc.invalidateQueries();
  };
}
