import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useDashboardSummary(period: string) {
  return useQuery({
    queryKey: ['dashboard', 'summary', period],
    queryFn: async () => {
      const { data } = await api.get(`/dashboard/summary?groupBy=${encodeURIComponent(period)}`);
      return data;
    },
  });
}

export function useVatQuarterly(year: number, quarter: number) {
  return useQuery({
    queryKey: ['vat', 'quarterly', year, quarter],
    queryFn: async () => {
      const { data } = await api.get(`/reports/vat/quarterly?year=${year}&quarter=${quarter}`);
      return data;
    },
  });
}
