import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useBankTransactions() {
  return useQuery({
    queryKey: ['bank-transactions'],
    queryFn: async () => {
      const { data } = await api.get('/bank-transactions');
      return data;
    },
  });
}

export type BankImportPreviewRow = {
  date: string;
  type: 'in' | 'out';
  amount: number;
  reference: string;
  description: string;
};

export function useBankImportPreview() {
  return useMutation({
    mutationFn: async (formData: FormData) => {
      const { data } = await api.post<{ preview: BankImportPreviewRow[] }>('/bank-transactions/import/preview', formData);
      return data.preview;
    },
  });
}

export function useConfirmBankImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { rows: BankImportPreviewRow[]; accountId?: string | null }) => {
      const { rows, accountId } = payload;
      const { data } = await api.post('/bank-transactions/import/confirm', { rows, accountId: accountId || undefined });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateBankTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string; date?: string; type?: string; amount?: number; reference?: string; description?: string; accountId?: string | null }) => {
      const { data } = await api.patch(`/bank-transactions/${encodeURIComponent(id)}`, payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }
  });
}

export function useDeleteBankTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/bank-transactions/${encodeURIComponent(id)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }
  });
}
