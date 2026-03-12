import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

// Invoice Config
export function useInvoiceConfig() {
  return useQuery({
    queryKey: ['invoice-config'],
    queryFn: async () => {
      const { data } = await api.get('/invoice-config');
      return data;
    },
  });
}

export function useSaveInvoiceConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (config: any) => {
      const { data } = await api.put('/invoice-config', config);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoice-config'] }),
  });
}

export function useUploadLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post<{ logoPath: string }>('/invoice-config/logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoice-config'] }),
  });
}

// Integrations (payments)
export function useIntegrationsSettings() {
  return useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const { data } = await api.get('/integrations').catch(() => ({ data: {} }));
      return data;
    },
  });
}

export function useSaveIntegrationsSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: any) => {
      const { data } = await api.put('/integrations', settings);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

// Users
export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await api.get('/auth/users');
      return data;
    },
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (user: any) => {
      const { data } = await api.post('/auth/users', user);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...user }: any) => {
      const { data } = await api.put(`/auth/users/${id}`, user);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/auth/users/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

// Approval Settings
export function useApprovalSettings() {
  return useQuery({
    queryKey: ['approval-settings'],
    queryFn: async () => {
      const { data } = await api.get('/approval-settings');
      return data;
    },
  });
}

export function useSaveApprovalSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: any) => {
      const { data } = await api.put('/approval-settings', settings);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['approval-settings'] }),
  });
}

// Expense Categories
export function useSaveExpenseCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (category: any) => {
      if (category.id) {
        const { data } = await api.put(`/expense-categories/${category.id}`, category);
        return data;
      } else {
        const { data } = await api.post('/expense-categories', category);
        return data;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expense-categories'] }),
  });
}

export function useDeleteExpenseCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/expense-categories/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expense-categories'] }),
  });
}

// Chart of accounts: account groups and accounts
export function useAccountGroups() {
  return useQuery({
    queryKey: ['account-groups'],
    queryFn: async () => {
      const { data } = await api.get('/account-groups');
      return data;
    },
  });
}

export function useAccounts(params?: { groupId?: string; type?: string }) {
  return useQuery({
    queryKey: ['accounts', params?.groupId, params?.type],
    queryFn: async () => {
      const sp = new URLSearchParams();
      if (params?.groupId) sp.set('group_id', params.groupId);
      if (params?.type) sp.set('type', params.type);
      const { data } = await api.get('/accounts' + (sp.toString() ? '?' + sp.toString() : ''));
      return data;
    },
  });
}

export function useAccountsAll() {
  return useQuery({
    queryKey: ['accounts', 'all'],
    queryFn: async () => {
      const { data } = await api.get('/accounts/all');
      return data;
    },
  });
}

export function useSaveAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (account: any) => {
      if (account.id) {
        const { data } = await api.put(`/accounts/${account.id}`, account);
        return data;
      } else {
        const { data } = await api.post('/accounts', account);
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['account-groups'] });
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/accounts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['account-groups'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
