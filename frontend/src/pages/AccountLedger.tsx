import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatYyMmDd } from '@/lib/date';
import { ArrowLeft, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i);

export default function AccountLedger() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [year, setYear] = useState<string>('all');
  const [quarter, setQuarter] = useState<string>('all');
  const [month, setMonth] = useState<string>('all');
  const [ytd, setYtd] = useState(false);
  const [newTxOpen, setNewTxOpen] = useState(false);
  const [newTxDirection, setNewTxDirection] = useState<'pay_to' | 'pay_from'>('pay_to');
  const [newTxCounterAccountId, setNewTxCounterAccountId] = useState('');
  const [newTxAmount, setNewTxAmount] = useState('');
  const [newTxDate, setNewTxDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newTxDescription, setNewTxDescription] = useState('');
  const [editEntryId, setEditEntryId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);

  const { data: account, isLoading: accountLoading } = useQuery({
    queryKey: ['account', id],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${id}`);
      return data;
    },
    enabled: !!id,
  });

  const ledgerParams = new URLSearchParams();
  if (year && year !== 'all') ledgerParams.set('year', year);
  if (quarter && quarter !== 'all') ledgerParams.set('quarter', quarter);
  if (month && month !== 'all') ledgerParams.set('month', month);
  if (ytd && year === String(currentYear)) ledgerParams.set('ytd', '1');

  const { data: ledgerData, isLoading: ledgerLoading } = useQuery({
    queryKey: ['account-ledger', id, year, quarter, month, ytd],
    queryFn: async () => {
      const { data } = await api.get(`/accounts/${id}/ledger?${ledgerParams.toString()}`);
      return data;
    },
    enabled: !!id,
  });

  const { data: accounts } = useQuery({
    queryKey: ['accounts', 'all'],
    queryFn: async () => {
      const { data } = await api.get('/accounts/all');
      return data;
    },
  });

  const createManualMutation = useMutation({
    mutationFn: async (body: {
      accountId: string;
      counterAccountId: string;
      amount: number;
      date: string;
      description?: string;
      direction: 'pay_to' | 'pay_from';
    }) => {
      const { data } = await api.post('/journal/manual', body);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account-ledger', id] });
      setNewTxOpen(false);
      setNewTxAmount('');
      setNewTxDescription('');
      toast.success('Transaction created');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to create transaction');
    },
  });

  const updateEntryMutation = useMutation({
    mutationFn: async ({ entryId, date, description }: { entryId: string; date: string; description: string }) => {
      await api.patch(`/journal/entries/${entryId}`, { date, description });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account-ledger', id] });
      setEditEntryId(null);
      toast.success('Transaction updated');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to update transaction');
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: async (entryId: string) => {
      await api.delete(`/journal/entries/${entryId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account-ledger', id] });
      setDeleteEntryId(null);
      toast.success('Transaction deleted');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to delete transaction');
    },
  });

  const lines = ledgerData?.lines || [];
  const periodSum = Number(ledgerData?.periodSum ?? 0);
  let runningBalance = 0;
  const rows = lines.map((line: any) => {
    const debit = line.debitAmount || 0;
    const credit = line.creditAmount || 0;
    runningBalance += debit - credit;
    return { ...line, runningBalance };
  });

  const otherAccounts = (accounts || []).filter((a: any) => String(a.id) !== String(id));

  const handleCreateTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(newTxAmount);
    if (!id || !newTxCounterAccountId || Number.isNaN(amt) || amt <= 0 || !newTxDate) {
      toast.error('Fill in amount, date and counter account');
      return;
    }
    createManualMutation.mutate({
      accountId: id,
      counterAccountId: newTxCounterAccountId,
      amount: amt,
      date: newTxDate,
      description: newTxDescription.trim() || undefined,
      direction: newTxDirection,
    });
  };

  const handleOpenEdit = (row: { journalEntryId: string; date: string; description?: string | null }) => {
    setEditEntryId(row.journalEntryId);
    setEditDate(String(row.date).slice(0, 10));
    setEditDescription(row.description || '');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editEntryId || !editDate) return;
    updateEntryMutation.mutate({
      entryId: editEntryId,
      date: editDate,
      description: editDescription.trim(),
    });
  };

  const handleDeleteConfirm = () => {
    if (deleteEntryId) deleteEntryMutation.mutate(deleteEntryId);
  };

  if (accountLoading || !id) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!account) {
    return (
      <div>
        <p className="text-muted-foreground">Account not found.</p>
        <Link to="/settings"><Button variant="link" type="button">Back to Settings</Button></Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/settings">
            <Button variant="ghost" size="icon" type="button">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              {account.name} ({account.code})
            </h2>
            <p className="text-sm text-muted-foreground">{account.accountGroupName}</p>
          </div>
        </div>
        <Button onClick={() => setNewTxOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> New transaction
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Ledger</CardTitle>
            <p className="text-sm text-muted-foreground">Fiscal periods: year from 1 Jan; use Year to date for current year (1 Jan to today).</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={year} onValueChange={(v) => setYear(v ?? 'all')}>
              <SelectTrigger className="w-24">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All (historic)</SelectItem>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {year && year !== 'all' && year === String(currentYear) && (
              <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={ytd}
                  onChange={(e) => setYtd(e.target.checked)}
                  className="rounded border-input"
                />
                Year to date
              </label>
            )}
            {year && year !== 'all' && (
              <>
                <Select value={quarter} onValueChange={(v) => setQuarter(v ?? 'all')}>
                  <SelectTrigger className="w-28">
                    <SelectValue placeholder="Quarter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {[1, 2, 3, 4].map((q) => (
                      <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={month} onValueChange={(v) => setMonth(v ?? 'all')}>
                  <SelectTrigger className="w-28">
                    <SelectValue placeholder="Month" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <SelectItem key={m} value={String(m)}>{new Date(2000, m - 1, 1).toLocaleString('default', { month: 'short' })}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {ledgerLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <>
              {rows.length > 0 && (
                <p className="text-sm font-medium mb-2">
                  Period total: €{periodSum.toFixed(2)}
                </p>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-28 text-right">Debit</TableHead>
                    <TableHead className="w-28 text-right">Credit</TableHead>
                    <TableHead className="w-28 text-right">Balance</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No transactions in this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row: any) => (
                      <TableRow key={row.lineId}>
                        <TableCell className="whitespace-nowrap">{formatYyMmDd(row.date)}</TableCell>
                        <TableCell className="min-w-0 max-w-xs truncate" title={row.description || undefined}>
                          {row.description || '\u2014'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {row.debitAmount > 0 ? '€' + row.debitAmount.toFixed(2) : '\u2014'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {row.creditAmount > 0 ? '€' + row.creditAmount.toFixed(2) : '\u2014'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          €{row.runningBalance.toFixed(2)}
                        </TableCell>
                        <TableCell className="w-24">
                          {row.sourceRefType === 'manual' ? (
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleOpenEdit(row)}
                                title="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => setDeleteEntryId(row.journalEntryId)}
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            '\u2014'
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={newTxOpen} onOpenChange={setNewTxOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New transaction</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateTransaction} className="space-y-4">
            <div>
              <Label>Direction</Label>
              <Select value={newTxDirection} onValueChange={(v) => v && setNewTxDirection(v as 'pay_to' | 'pay_from')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pay_to">Pay to this account</SelectItem>
                  <SelectItem value="pay_from">Pay from this account</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Counter account *</Label>
              <Select value={newTxCounterAccountId} onValueChange={(v) => setNewTxCounterAccountId(v ?? '')} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select account">
                    {newTxCounterAccountId
                      ? (() => {
                          const sel = otherAccounts.find((a: any) => String(a.id) === String(newTxCounterAccountId));
                          return sel ? `${sel.code} ${sel.name}` : null;
                        })()
                      : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {otherAccounts.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.code} {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount *</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={newTxAmount}
                onChange={(e) => setNewTxAmount(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Date *</Label>
              <Input type="date" value={newTxDate} onChange={(e) => setNewTxDate(e.target.value)} required />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={newTxDescription}
                onChange={(e) => setNewTxDescription(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setNewTxOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createManualMutation.isPending}>
                Create
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editEntryId} onOpenChange={(open) => !open && setEditEntryId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit transaction</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div>
              <Label>Date *</Label>
              <Input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditEntryId(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateEntryMutation.isPending}>
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteEntryId} onOpenChange={(open: boolean) => !open && setDeleteEntryId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete transaction</DialogTitle>
            <p className="text-sm text-muted-foreground">
              This will permanently delete this manual journal entry. This action cannot be undone.
            </p>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setDeleteEntryId(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteConfirm}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
