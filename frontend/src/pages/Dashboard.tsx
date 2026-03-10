import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDashboardSummary, useExpenseSummary } from '../hooks/useDashboard';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';

export default function Dashboard() {
  const [period, setPeriod] = useState('month');
  const { data: summary, isLoading } = useDashboardSummary(period);
  const currentYear = new Date().getFullYear();
  const { data: expenseSummary } = useExpenseSummary(currentYear);

  const formatCurrency = (value: number) => `€${value.toFixed(2)}`;

  // Single-tone gradient for expenses pie (light to dark)
  const expenseGradient = [
    '#fecdd3', '#fda4af', '#fb7185', '#f43f5e', '#e11d48', '#be123c', '#9f1239', '#881337',
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-10 w-48 mb-2" />
          <Skeleton className="h-5 w-64" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const chartData = summary?.periods || [];
  const cashInBank = summary?.bankBalance ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">
            Overview of your financial performance.
          </p>
        </div>
        <Select value={period} onValueChange={(val) => setPeriod(val || 'month')}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Monthly</SelectItem>
            <SelectItem value="quarter">Quarterly</SelectItem>
            <SelectItem value="year">Yearly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="bg-sky-50 border border-sky-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-emerald-600">
              {formatCurrency(summary?.totalIncome || 0)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-sky-50 border border-sky-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-red-600">
              {formatCurrency(summary?.totalExpenses || 0)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-sky-50 border border-sky-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Income</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-4xl font-bold ${(summary?.balance || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatCurrency(summary?.balance || 0)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-sky-50 border border-sky-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cash in Bank</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-4xl font-bold ${cashInBank >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatCurrency(cashInBank)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-sky-50 border border-sky-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{summary?.pendingTasks || 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Income vs Expenses</CardTitle>
          </CardHeader>
          <CardContent className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                <Legend />
                <Area type="monotone" dataKey="income" name="Revenue" stroke="var(--chart-revenue)" fill="var(--chart-revenue)" fillOpacity={0.4} strokeWidth={2} />
                <Area type="monotone" dataKey="expenses" name="Expenses" stroke="var(--chart-expenses)" fill="var(--chart-expenses)" fillOpacity={0.4} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Expenses</CardTitle>
          </CardHeader>
          <CardContent className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ right: 140 }}>
                <Pie
                  data={expenseSummary?.categories?.slice(0, 8) || []}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={false}
                  outerRadius={120}
                  fill="#8884d8"
                  dataKey="totalAmount"
                  nameKey="category"
                >
                  {(expenseSummary?.categories || []).map((_: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={expenseGradient[index % expenseGradient.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                <Legend layout="vertical" align="right" verticalAlign="middle" />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
