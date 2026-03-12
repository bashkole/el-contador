import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBankTransactions } from '../hooks/useBank';
import { useExpenses } from '../hooks/useExpenses';
import { useSales } from '../hooks/useSales';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Search } from 'lucide-react';
import { formatYyMmDd } from '@/lib/date';
import { api } from '../lib/api';
import { useQueryClient, useQuery } from '@tanstack/react-query';

const PAGE_SIZE = 10;

function truncate(str: string | null | undefined, len = 20): string {
  const s = String(str ?? '').trim();
  return s.length > len ? s.slice(0, len) + '\u2026' : s || '\u2014';
}

type Suggestion = {
  bankTransactionId: string;
  bankDate: string;
  bankType: 'in' | 'out';
  bankAmount: number;
  bankDescription: string;
  targetId: string;
  targetType: 'expense' | 'sale' | 'transfer';
  targetLabel: string;
  targetAmount: number;
  pairedBankTransactionId?: string;
};

function Pagination({
  page,
  totalItems,
  pageSize,
  onPrev,
  onNext,
}: { page: number; totalItems: number; pageSize: number; onPrev: () => void; onNext: () => void }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const from = totalItems === 0 ? 0 : page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, totalItems);
  const showNav = totalItems > pageSize;
  return (
    <div className="flex items-center justify-between gap-2 py-2 text-sm text-muted-foreground">
      <span>{totalItems === 0 ? '' : `Showing ${from}-${to} of ${totalItems}`}</span>
      {showNav && (
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={onPrev} disabled={page <= 0}>Previous</Button>
          <Button variant="outline" size="sm" onClick={onNext} disabled={page >= totalPages - 1}>Next</Button>
        </div>
      )}
    </div>
  );
}

export default function Reconciliation() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { data: bankTxs, isLoading: isLoadingBank } = useBankTransactions();
  const { data: expenses, isLoading: isLoadingExpenses } = useExpenses();
  const { data: sales, isLoading: isLoadingSales } = useSales();

  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [selectedBankTxIds, setSelectedBankTxIds] = useState<string[]>([]);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [openBankPage, setOpenBankPage] = useState(0);
  const [openExpensesPage, setOpenExpensesPage] = useState(0);
  const [openSalesPage, setOpenSalesPage] = useState(0);
  const [reconciledPage, setReconciledPage] = useState(0);
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [reconcileToAccountOpen, setReconcileToAccountOpen] = useState(false);
  const [ledgerAccountId, setLedgerAccountId] = useState('');
  const [accountNote, setAccountNote] = useState('');

  const { data: openJournalData } = useQuery({
    queryKey: ['reconciliation', 'open-journal-entries'],
    queryFn: async () => {
      const { data } = await api.get<{ entries: Array<{ journalEntryId: string; date: string; description: string; amount: number; side: string }> }>('/reconciliation/open-journal-entries');
      return data;
    },
  });
  const openJournalEntries = openJournalData?.entries ?? [];

  const { data: accountsList } = useQuery({
    queryKey: ['accounts', 'all'],
    queryFn: async () => {
      const { data } = await api.get('/accounts/all');
      return data;
    },
  });
  const liabilityAccounts = (accountsList || []).filter((a: any) => a.code >= 800 && a.code <= 999);

  const bankList = Array.isArray(bankTxs) ? bankTxs : [];
  const expensesList = Array.isArray(expenses) ? expenses : [];
  const salesList = Array.isArray(sales) ? sales : [];

  const openBankTxs = bankList.filter((tx: any) => !tx.reconciled);
  const openExpenses = expensesList.filter((ex: any) => !ex.reconciled);

  const openSales = salesList.filter((sale: any) => {
    if (sale.voided) return false;
    if (!sale.reconciled) return true;
    const hasMatchingBankTx = bankList.some(
      (tx: any) =>
        tx.reconciled &&
        tx.reconciliationRefType === 'sale' &&
        String(tx.reconciliationRefId) === String(sale.id)
    );
    return !hasMatchingBankTx;
  });
  const pairedTxs = bankList
    .filter((tx: any) => tx.reconciled)
    .sort(
    (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const searchLower = search.toLowerCase().trim();

  const filteredBankTxs = searchLower
    ? openBankTxs.filter(
        (tx: any) =>
          (tx.description || '').toLowerCase().includes(searchLower) ||
          (tx.reference || '').toLowerCase().includes(searchLower) ||
          String(tx.amount || '').includes(search.trim())
      )
    : openBankTxs;
  const filteredExpenses = searchLower
    ? openExpenses.filter(
        (ex: any) =>
          (ex.vendor || '').toLowerCase().includes(searchLower) ||
          String(ex.amount || '').includes(search.trim())
      )
    : openExpenses;
  const filteredSales = searchLower
    ? openSales.filter(
        (sale: any) =>
          (sale.customer || '').toLowerCase().includes(searchLower) ||
          (sale.invoiceNo || '').toLowerCase().includes(searchLower) ||
          String(sale.total || '').includes(search.trim())
      )
    : openSales;
  const filteredPairedTxs = searchLower
    ? pairedTxs.filter(
        (tx: any) =>
          (tx.description || '').toLowerCase().includes(searchLower) ||
          (tx.reconciliationRefType || '').toLowerCase().includes(searchLower) ||
          String(tx.amount || '').includes(search.trim())
      )
    : pairedTxs;

  const openBankOutTxs = filteredBankTxs.filter((tx: any) => tx.type === 'out');
  const openBankInTxs = filteredBankTxs.filter((tx: any) => tx.type === 'in');
  const assetJournalEntries = openJournalEntries.filter((e: any) => e.side === 'asset');
  const openExpensesPageSlice = filteredExpenses.slice(openExpensesPage * PAGE_SIZE, (openExpensesPage + 1) * PAGE_SIZE);
  const openSalesPageSlice = filteredSales.slice(openSalesPage * PAGE_SIZE, (openSalesPage + 1) * PAGE_SIZE);
  const pairedPageSlice = filteredPairedTxs.slice(reconciledPage * PAGE_SIZE, (reconciledPage + 1) * PAGE_SIZE);

  const bankTxIdFromUrl = searchParams.get('bankTxId');

  useEffect(() => {
    if (isLoadingBank || isLoadingExpenses || isLoadingSales) return;
    setLoadingSuggestions(true);
    api
      .get<{ suggestions: Suggestion[] }>('/reconciliation/suggestions')
      .then(({ data }) => setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []))
      .catch(() => setSuggestions([]))
      .finally(() => setLoadingSuggestions(false));
  }, [bankList, expensesList, salesList, isLoadingBank, isLoadingExpenses, isLoadingSales]);

  useEffect(() => {
    if (!bankTxIdFromUrl || openBankTxs.length === 0) return;
    const index = openBankTxs.findIndex((tx: any) => String(tx.id) === String(bankTxIdFromUrl));
    if (index === -1) return;
    setSearch('');
    const targetPage = Math.floor(index / PAGE_SIZE);
    setOpenBankPage(targetPage);
    const tx = openBankTxs[index];
    setSelectedTx(tx);
    setSelectedBankTxIds(tx.type === 'out' ? [String(tx.id)] : []);
    setSelectedExpenseIds([]);
    setSelectedSaleId(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('bankTxId');
      return next;
    }, { replace: true });
  }, [bankTxIdFromUrl, openBankTxs]);

  useEffect(() => {
    const maxBank = Math.max(0, Math.ceil(filteredBankTxs.length / PAGE_SIZE) - 1);
    if (openBankPage > maxBank) setOpenBankPage(maxBank);
  }, [filteredBankTxs.length, openBankPage]);
  useEffect(() => {
    const maxExp = Math.max(0, Math.ceil(filteredExpenses.length / PAGE_SIZE) - 1);
    if (openExpensesPage > maxExp) setOpenExpensesPage(maxExp);
  }, [filteredExpenses.length, openExpensesPage]);
  useEffect(() => {
    const maxSale = Math.max(0, Math.ceil(filteredSales.length / PAGE_SIZE) - 1);
    if (openSalesPage > maxSale) setOpenSalesPage(maxSale);
  }, [filteredSales.length, openSalesPage]);
  useEffect(() => {
    const maxPaired = Math.max(0, Math.ceil(filteredPairedTxs.length / PAGE_SIZE) - 1);
    if (reconciledPage > maxPaired) setReconciledPage(maxPaired);
  }, [filteredPairedTxs.length, reconciledPage]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
    queryClient.invalidateQueries({ queryKey: ['expenses'] });
    queryClient.invalidateQueries({ queryKey: ['sales'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['reconciliation', 'open-journal-entries'] });
  };

  const RECON_TOLERANCE = 0.5;

  const applyMatch = async (bankTransactionId: string, targetId: string, targetType: 'expense' | 'sale') => {
    try {
      await api.post('/reconciliation/match', {
        bankTransactionId,
        targetId,
        targetType,
      });
      setSuggestions((prev) =>
        prev.filter((s) => !(s.bankTransactionId === bankTransactionId && s.targetId === targetId))
      );
      setSelectedTx(null);
      setSelectedBankTxIds([]);
      setSelectedExpenseIds([]);
      setSelectedSaleId(null);
      invalidate();
    } catch (error: any) {
      console.error(error);
      alert('Failed to match: ' + (error.response?.data?.error || error.message));
    }
  };

  const applySuggestion = (s: Suggestion) => {
    if (s.targetType === 'transfer') {
      applyMatchTransfer(s.bankTransactionId, s.pairedBankTransactionId ?? s.targetId);
    } else {
      applyMatch(s.bankTransactionId, s.targetId, s.targetType as 'expense' | 'sale');
    }
  };

  const applyMatchTransfer = async (bankTransactionId: string, pairedBankTransactionId: string) => {
    try {
      await api.post('/reconciliation/match-transfer', { bankTransactionId, pairedBankTransactionId });
      setSuggestions((prev) =>
        prev.filter(
          (s) =>
            !(s.targetType === 'transfer' && s.bankTransactionId === bankTransactionId && (s.pairedBankTransactionId === pairedBankTransactionId || s.targetId === pairedBankTransactionId))
        )
      );
      setSelectedTx(null);
      setSelectedBankTxIds([]);
      setSelectedExpenseIds([]);
      setSelectedSaleId(null);
      invalidate();
    } catch (error: any) {
      console.error(error);
      alert('Failed to match transfer: ' + (error.response?.data?.error || error.message));
    }
  };

  const applyMatchExpenses = async (bankTransactionId: string, expenseIds: string[]) => {
    try {
      await api.post('/reconciliation/match-expenses', {
        bankTransactionId,
        expenseIds,
      });
      setSelectedTx(null);
      setSelectedBankTxIds([]);
      setSelectedExpenseIds([]);
      setSelectedSaleId(null);
      invalidate();
    } catch (error: any) {
      console.error(error);
      alert('Failed to match: ' + (error.response?.data?.error || error.message));
    }
  };

  const applyMatchBulk = async (bankTransactionIds: string[], expenseIds: string[]) => {
    try {
      await api.post('/reconciliation/match-bulk', {
        bankTransactionIds,
        expenseIds,
      });
      setSelectedTx(null);
      setSelectedBankTxIds([]);
      setSelectedExpenseIds([]);
      setSelectedSaleId(null);
      invalidate();
    } catch (error: any) {
      console.error(error);
      alert('Failed to match: ' + (error.response?.data?.error || error.message));
    }
  };

  const applyMatchAccount = async () => {
    if (!selectedTx || !ledgerAccountId) return;
    try {
      await api.post('/reconciliation/match-account', {
        bankTransactionId: selectedTx.id,
        accountType: 'loan',
        accountNote: accountNote.trim() || undefined,
        ledgerAccountId,
      });
      setReconcileToAccountOpen(false);
      setLedgerAccountId('');
      setAccountNote('');
      setSelectedTx(null);
      setSelectedBankTxIds([]);
      setSelectedExpenseIds([]);
      setSelectedSaleId(null);
      invalidate();
    } catch (error: any) {
      console.error(error);
      alert('Failed to reconcile to account: ' + (error.response?.data?.error || error.message));
    }
  };

  const applyMatchJournal = async (journalEntryId: string) => {
    if (!selectedTx) return;
    try {
      await api.post('/reconciliation/match-journal', {
        bankTransactionId: selectedTx.id,
        journalEntryId,
      });
      setSelectedTx(null);
      setSelectedBankTxIds([]);
      setSelectedExpenseIds([]);
      setSelectedSaleId(null);
      invalidate();
    } catch (error: any) {
      console.error(error);
      alert('Failed to match journal: ' + (error.response?.data?.error || error.message));
    }
  };

  const selectedExpenses = expensesList.filter((ex: any) => selectedExpenseIds.includes(String(ex.id)));
  const expensesTotal = selectedExpenses.reduce(
    (sum: number, ex: any) => sum + Number(ex.amount || 0) + Number(ex.vat || 0),
    0
  );
  const selectedSale = selectedSaleId ? salesList.find((s: any) => String(s.id) === String(selectedSaleId)) : null;
  const saleTotal = selectedSale ? Number(selectedSale.total) : 0;
  const selectedBankTxs = selectedBankTxIds.length > 0
    ? openBankOutTxs.filter((tx: any) => selectedBankTxIds.includes(tx.id))
    : selectedTx ? [selectedTx] : [];
  const bankAmount = selectedBankTxs.length > 0
    ? selectedBankTxs.reduce((sum: number, tx: any) => sum + Number(tx.amount || 0), 0)
    : selectedTx ? Number(selectedTx.amount) : 0;
  const isOut = selectedTx?.type === 'out' || selectedBankTxIds.length > 0;
  const itemsTotal = isOut ? expensesTotal : saleTotal;
  const diff = bankAmount - itemsTotal;
  const canApply =
    (selectedTx || selectedBankTxIds.length > 0) &&
    (isOut ? selectedExpenseIds.length >= 1 : !!selectedSaleId) &&
    Math.abs(diff) <= RECON_TOLERANCE;

  const singleBankTxForJournal = selectedBankTxIds.length <= 1 && (selectedTx || selectedBankTxIds.length === 1);
  const matchingJournalEntries = singleBankTxForJournal
    ? openJournalEntries.filter((e: any) => {
        const sideOk = isOut ? e.side === 'asset' : e.side === 'liability';
        return sideOk && Math.abs((e.amount || 0) - bankAmount) <= RECON_TOLERANCE;
      })
    : [];

  const handleConfirmMatch = () => {
    const bankIds = selectedBankTxIds.length > 0 ? selectedBankTxIds : (selectedTx ? [selectedTx.id] : []);
    if (isOut) {
      if (selectedExpenseIds.length === 0 || bankIds.length === 0) return;
      if (bankIds.length === 1 && selectedExpenseIds.length === 1) {
        applyMatch(bankIds[0], selectedExpenseIds[0], 'expense');
      } else if (bankIds.length === 1 && selectedExpenseIds.length > 1) {
        applyMatchExpenses(bankIds[0], selectedExpenseIds);
      } else {
        applyMatchBulk(bankIds, selectedExpenseIds);
      }
    } else {
      if (!selectedSaleId || !selectedTx) return;
      applyMatch(selectedTx.id, selectedSaleId, 'sale');
    }
  };

  const toggleExpenseSelection = (exId: string) => {
    const id = String(exId);
    setSelectedExpenseIds((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  };

  const toggleBankTxSelection = (tx: any) => {
    if (tx.type === 'in') {
      setSelectedTx(tx);
      setSelectedBankTxIds([]);
      setSelectedExpenseIds([]);
      setSelectedSaleId(null);
      return;
    }
    const id = String(tx.id);
    setSelectedBankTxIds((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
    setSelectedTx(tx);
    setSelectedSaleId(null);
  };

  const selectSale = (saleId: string | null) => {
    setSelectedSaleId(saleId);
  };

  const handleUnmatch = async (txId: string) => {
    if (!confirm('Are you sure you want to unmatch this transaction?')) return;
    try {
      await api.post('/reconciliation/unmatch', { bankTransactionId: txId });
      invalidate();
    } catch (error) {
      console.error(error);
      alert('Failed to unmatch');
    }
  };

  const onSearchChange = (value: string) => {
    setSearch(value);
    setOpenBankPage(0);
    setOpenExpensesPage(0);
    setOpenSalesPage(0);
    setReconciledPage(0);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Reconciliation</h2>
          <p className="text-muted-foreground">Match your bank transactions to invoices and expenses.</p>
        </div>
        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search all: bank, expenses, invoices, paired..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {(selectedTx || selectedBankTxIds.length > 0) && (selectedExpenseIds.length > 0 || selectedSaleId) && (
        <Card className="border-[var(--reconciliation-match-border)] bg-[var(--reconciliation-match-bg)]">
          <CardContent className="py-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <div className="text-sm">
              <span className="font-semibold">Matching:</span>{' '}
              {selectedBankTxs.length > 1
                ? `${selectedBankTxs.length} payment(s): €${Number(bankAmount).toFixed(2)}`
                : selectedBankTxs.length === 1
                  ? `${selectedBankTxs[0].description || 'Payment'} €${Number(bankAmount).toFixed(2)}`
                  : selectedTx
                    ? `${selectedTx.description} €${Number(bankAmount).toFixed(2)}`
                    : null}
              {isOut ? (
                <>
                  <span className="mx-2">with</span>
                  <span>
                    {selectedExpenseIds.length} expense(s): €{Number(itemsTotal).toFixed(2)}
                    {selectedExpenses.length > 0 && ` (${selectedExpenses.map((e: any) => e.vendor).join(', ')})`}
                  </span>
                </>
              ) : (
                <>
                  <span className="mx-2">with</span>
                  <span>invoice {selectedSale?.customer}: €{Number(saleTotal).toFixed(2)}</span>
                </>
              )}
              {Math.abs(diff) >= 0.01 && Math.abs(diff) <= RECON_TOLERANCE && (
                <span className="ml-2 text-amber-600"> (adjustment €{diff.toFixed(2)})</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!canApply && (selectedTx || selectedBankTxIds.length > 0) && (selectedExpenseIds.length > 0 || selectedSaleId) && (
                <span className="text-xs text-muted-foreground">
                  {Math.abs(diff) > RECON_TOLERANCE
                    ? `Totals must match within €${RECON_TOLERANCE} (diff €${Number(diff).toFixed(2)})`
                    : 'Select at least one item.'}
                </span>
              )}
              <Button onClick={handleConfirmMatch} disabled={!canApply}>
                Apply match{(selectedExpenseIds.length > 1 || selectedBankTxIds.length > 1) ? ' (multi)' : ''}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedTx && isOut && matchingJournalEntries.length > 0 && (
        <Card className="bg-[var(--reconciliation-match-muted-bg)]">
          <CardHeader>
            <CardTitle className="text-base">Match to journal (asset)</CardTitle>
            <p className="text-sm text-muted-foreground font-normal">Manual entries with same amount; match bank out to asset purchase.</p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-24 text-right">Amount</TableHead>
                  <TableHead className="w-[100px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matchingJournalEntries.map((e: any) => (
                  <TableRow key={e.journalEntryId}>
                    <TableCell className="whitespace-nowrap">{formatYyMmDd(e.date)}</TableCell>
                    <TableCell className="min-w-0 truncate">{truncate(e.description)}</TableCell>
                    <TableCell className="text-right">€{Number(e?.amount ?? 0).toFixed(2)}</TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => applyMatchJournal(e.journalEntryId)}>Match</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {selectedTx && !isOut && (
        <Card className="bg-[var(--reconciliation-match-muted-bg)]">
          <CardHeader>
            <CardTitle className="text-base">Incoming: account or journal</CardTitle>
            <p className="text-sm text-muted-foreground font-normal">Reconcile to a ledger account (e.g. director loan) or match to a manual journal entry.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setReconcileToAccountOpen(true)}>
                Reconcile to account
              </Button>
            </div>
            {matchingJournalEntries.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-24 text-right">Amount</TableHead>
                    <TableHead className="w-[100px]">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matchingJournalEntries.map((e: any) => (
                    <TableRow key={e.journalEntryId}>
                      <TableCell className="whitespace-nowrap">{formatYyMmDd(e.date)}</TableCell>
                      <TableCell className="min-w-0 truncate">{truncate(e.description)}</TableCell>
                      <TableCell className="text-right">€{Number(e?.amount ?? 0).toFixed(2)}</TableCell>
                      <TableCell>
                        <Button size="sm" onClick={() => applyMatchJournal(e.journalEntryId)}>Match</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={reconcileToAccountOpen} onOpenChange={setReconcileToAccountOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reconcile to account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Ledger account *</Label>
              <Select value={ledgerAccountId} onValueChange={(v) => setLedgerAccountId(v ?? '')} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select account (e.g. director loan)">
                    {ledgerAccountId
                      ? (() => {
                          const sel = liabilityAccounts.find((a: any) => String(a.id) === String(ledgerAccountId));
                          return sel ? `${sel.code} ${sel.name}` : ledgerAccountId;
                        })()
                      : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {liabilityAccounts.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.code} {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Note</Label>
              <Input value={accountNote} onChange={(e) => setAccountNote(e.target.value)} placeholder="Optional" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReconcileToAccountOpen(false)}>Cancel</Button>
              <Button onClick={applyMatchAccount} disabled={!ledgerAccountId}>Apply</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="bg-[var(--reconciliation-match-muted-bg)]">
        <CardHeader>
          <CardTitle>Possible matches</CardTitle>
          <p className="text-sm text-muted-foreground font-normal">
            Bank transactions and open items with the same amount (within €0.50). Confirm each match below.
          </p>
        </CardHeader>
        <CardContent>
          {loadingSuggestions && (
            <p className="text-sm text-muted-foreground">Loading possible matches...</p>
          )}
          {!loadingSuggestions && suggestions.length === 0 && (
            <p className="text-sm text-muted-foreground">No possible matches. Use the lists below to match manually or with multiple expenses.</p>
          )}
          {!loadingSuggestions && suggestions.length > 0 && (
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Date</TableHead>
                  <TableHead className="w-40">Description</TableHead>
                  <TableHead className="w-20">Amount</TableHead>
                  <TableHead className="w-40">Matched to</TableHead>
                  <TableHead className="w-24 text-right">Item amount</TableHead>
                  <TableHead className="w-[120px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suggestions.map((s) => (
                  <TableRow key={`${s.bankTransactionId}-${s.targetId}`}>
                    <TableCell className="w-24 whitespace-nowrap">{formatYyMmDd(s.bankDate)}</TableCell>
                    <TableCell className="min-w-0 truncate" title={s.bankDescription || undefined}>
                      {truncate(s.bankDescription)}
                    </TableCell>
                    <TableCell className={`w-20 whitespace-nowrap ${s.bankType === 'in' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {s.bankType === 'in' ? '+' : '-'}€{Number(s?.bankAmount ?? 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="min-w-0 truncate" title={`${s.targetType}: ${s.targetLabel}`}>
                      {s.targetType}: {truncate(s.targetLabel, 16)}
                    </TableCell>
                    <TableCell className="w-24 text-right whitespace-nowrap">€{Number(s?.targetAmount ?? 0).toFixed(2)}</TableCell>
                    <TableCell className="w-[120px]">
                      <Button size="sm" onClick={() => applySuggestion(s)}>
                        {s.targetType === 'transfer' ? 'Confirm transfer' : 'Confirm match'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Assets</CardTitle>
            <p className="text-sm text-muted-foreground font-normal">Bank account (e.g. 100) is an asset. All unreconciled bank transactions (in and out) and asset-side manual entries. Select to match to sale, expense, account, or journal entry.</p>
          </CardHeader>
          <CardContent>
            {isLoadingBank ? (
              <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
            ) : (
              <>
                <h3 className="text-sm font-semibold mb-2">Bank in</h3>
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Date</TableHead>
                      <TableHead className="w-20">Account</TableHead>
                      <TableHead className="min-w-0">Description</TableHead>
                      <TableHead className="w-24 text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {openBankInTxs.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-3 text-muted-foreground text-sm">No open bank in.</TableCell></TableRow>
                    ) : (
                      openBankInTxs.slice(0, PAGE_SIZE).map((tx: any) => (
                        <TableRow
                          key={tx.id}
                          className={`cursor-pointer ${selectedTx?.id === tx.id && selectedTx?.type === 'in' ? 'bg-[var(--reconciliation-selected-bg)] hover:bg-[var(--reconciliation-selected-hover)]' : ''}`}
                          onClick={() => toggleBankTxSelection(tx)}
                        >
                          <TableCell className="w-24 whitespace-nowrap">{formatYyMmDd(tx.date)}</TableCell>
                          <TableCell className="w-20 truncate">{tx.accountName ? truncate(tx.accountName, 12) : (tx.accountCode != null ? String(tx.accountCode) : '\u2014')}</TableCell>
                          <TableCell className="min-w-0 truncate">{truncate(tx.description || tx.reference)}</TableCell>
                          <TableCell className="w-24 text-right font-medium text-emerald-600 whitespace-nowrap">+€{Number(tx?.amount ?? 0).toFixed(2)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                <h3 className="text-sm font-semibold mb-2 mt-4">Bank out</h3>
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">Match</TableHead>
                      <TableHead className="w-24">Date</TableHead>
                      <TableHead className="w-20">Account</TableHead>
                      <TableHead className="min-w-0">Description</TableHead>
                      <TableHead className="w-24 text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {openBankOutTxs.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-3 text-muted-foreground text-sm">No open bank out.</TableCell></TableRow>
                    ) : (
                      openBankOutTxs.slice(0, PAGE_SIZE).map((tx: any) => {
                        const checked = selectedBankTxIds.includes(String(tx.id));
                        return (
                          <TableRow
                            key={tx.id}
                            className={`cursor-pointer ${checked ? 'bg-[var(--reconciliation-selected-bg)] hover:bg-[var(--reconciliation-selected-hover)]' : ''}`}
                            onClick={() => toggleBankTxSelection(tx)}
                          >
                            <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggleBankTxSelection(tx)}
                              />
                            </TableCell>
                            <TableCell className="w-24 whitespace-nowrap">{formatYyMmDd(tx.date)}</TableCell>
                            <TableCell className="w-20 truncate">{tx.accountName ? truncate(tx.accountName, 12) : (tx.accountCode != null ? String(tx.accountCode) : '\u2014')}</TableCell>
                            <TableCell className="min-w-0 truncate">{truncate(tx.description || tx.reference)}</TableCell>
                            <TableCell className="w-24 text-right font-medium text-red-600 whitespace-nowrap">-€{Number(tx?.amount ?? 0).toFixed(2)}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
                {assetJournalEntries.length > 0 && (
                  <>
                    <h3 className="text-sm font-semibold mb-2 mt-4">Manual entries (asset)</h3>
                    <Table className="table-fixed">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-24">Date</TableHead>
                          <TableHead className="min-w-0">Description</TableHead>
                          <TableHead className="w-24 text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {assetJournalEntries.slice(0, 5).map((e: any) => (
                          <TableRow key={e.journalEntryId}>
                            <TableCell className="w-24 whitespace-nowrap">{formatYyMmDd(e.date)}</TableCell>
                            <TableCell className="min-w-0 truncate">{truncate(e.description)}</TableCell>
                            <TableCell className="w-24 text-right">€{Number(e?.amount ?? 0).toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Liabilities</CardTitle>
            <p className="text-sm text-muted-foreground font-normal">Liability accounts (expenses, taxes, loans, bad debt). Match bank out from Assets to one or more expenses below, or reconcile to a ledger account.</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold mb-2">Unpaid Expenses (Outgoing)</h3>
                <p className="text-xs text-muted-foreground mb-2">
                  {(selectedTx || selectedBankTxIds.length > 0) && (selectedTx?.type === 'out' || openBankOutTxs.some((tx: any) => selectedBankTxIds.includes(tx.id))) ? 'Select one or more expenses to match with the selected payment(s).' : 'Select one or more bank out transactions (Assets) to match expenses.'}
                </p>
                {isLoadingExpenses ? (
                  <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
                ) : (
                  <>
                    <Table className="table-fixed">
                      <TableHeader>
                        <TableRow>
                          {(selectedTx || selectedBankTxIds.length > 0) && (selectedTx?.type === 'out' || selectedBankTxIds.length > 0) && <TableHead className="w-10">Match</TableHead>}
                          <TableHead className="w-24">Date</TableHead>
                          <TableHead className="min-w-0">Vendor</TableHead>
                          <TableHead className="w-24 text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredExpenses.length === 0 ? (
                          <TableRow><TableCell colSpan={((selectedTx || selectedBankTxIds.length > 0) && (selectedTx?.type === 'out' || selectedBankTxIds.length > 0)) ? 4 : 3} className="text-center py-4 text-muted-foreground">{openExpenses.length === 0 ? 'No open expenses.' : 'No matches for search.'}</TableCell></TableRow>
                        ) : (
                          openExpensesPageSlice.map((ex: any) => {
                            const exId = String(ex.id);
                            const checked = selectedExpenseIds.includes(exId);
                            const total = Number(ex.amount || 0) + Number(ex.vat || 0);
                            const showCheck = (selectedTx?.type === 'out' || selectedBankTxIds.length > 0);
                            return (
                              <TableRow
                                key={ex.id}
                                className={`cursor-pointer ${checked ? 'bg-[var(--reconciliation-selected-bg)] hover:bg-[var(--reconciliation-selected-hover)]' : ''}`}
                                onClick={() => showCheck && toggleExpenseSelection(ex.id)}
                              >
                                {showCheck && (
                                  <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={() => toggleExpenseSelection(ex.id)}
                                    />
                                  </TableCell>
                                )}
                                <TableCell className="w-24 whitespace-nowrap">{formatYyMmDd(ex.date)}</TableCell>
                                <TableCell className="min-w-0 truncate" title={ex.vendor || undefined}>{truncate(ex.vendor)}</TableCell>
                                <TableCell className="w-24 text-right whitespace-nowrap">€{Number(total).toFixed(2)}</TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                    <Pagination
                      page={openExpensesPage}
                      totalItems={filteredExpenses.length}
                      pageSize={PAGE_SIZE}
                      onPrev={() => setOpenExpensesPage((p) => Math.max(0, p - 1))}
                      onNext={() => setOpenExpensesPage((p) => Math.min(Math.ceil(filteredExpenses.length / PAGE_SIZE) - 1, p + 1))}
                    />
                  </>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">Unpaid Invoices (Incoming)</h3>
                <p className="text-xs text-muted-foreground mb-2">
                  {selectedTx?.type === 'in' ? 'Select one invoice to match with the bank transaction.' : 'Select a bank transaction (Bank in) to match an invoice.'}
                </p>
                {isLoadingSales ? (
                  <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
                ) : (
                  <>
                    <Table className="table-fixed">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-24">Date</TableHead>
                          <TableHead className="min-w-0">Customer</TableHead>
                          <TableHead className="w-24 text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSales.length === 0 ? (
                          <TableRow><TableCell colSpan={3} className="text-center py-4 text-muted-foreground">{openSales.length === 0 ? 'No open sales.' : 'No matches for search.'}</TableCell></TableRow>
                        ) : (
                          openSalesPageSlice.map((sale: any) => {
                            const isSelected = selectedSaleId !== null && String(sale.id) === String(selectedSaleId);
                            return (
                              <TableRow
                                key={sale.id}
                                className={`cursor-pointer ${isSelected ? 'bg-[var(--reconciliation-selected-bg)] hover:bg-[var(--reconciliation-selected-hover)]' : ''}`}
                                onClick={() => selectedTx?.type === 'in' && selectSale(isSelected ? null : sale.id)}
                              >
                                <TableCell className="w-24 whitespace-nowrap">{formatYyMmDd(sale.issueDate)}</TableCell>
                                <TableCell className="min-w-0 truncate" title={sale.customer || undefined}>
                                  {truncate(sale.customer)}
                                  {sale.reconciled && (
                                    <span className="ml-2 text-xs text-amber-600" title="Marked paid but no bank transaction linked; you can match again.">
                                      (needs match)
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="w-24 text-right whitespace-nowrap">€{Number(sale?.total ?? 0).toFixed(2)}</TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                    <Pagination
                      page={openSalesPage}
                      totalItems={filteredSales.length}
                      pageSize={PAGE_SIZE}
                      onPrev={() => setOpenSalesPage((p) => Math.max(0, p - 1))}
                      onNext={() => setOpenSalesPage((p) => Math.min(Math.ceil(filteredSales.length / PAGE_SIZE) - 1, p + 1))}
                    />
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Paired Transactions</CardTitle>
          <p className="text-sm text-muted-foreground font-normal">Bank transactions matched to invoices, expenses, accounts, or journal entries.</p>
        </CardHeader>
        <CardContent>
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Date</TableHead>
                <TableHead className="min-w-0">Description</TableHead>
                <TableHead className="w-24">Type</TableHead>
                <TableHead className="w-24 text-right">Amount</TableHead>
                <TableHead className="w-[200px]">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pairedPageSlice.map((tx: any) => {
                const pairedTx = tx.reconciliationRefType === 'transfer' && tx.reconciliationRefId
                  ? bankList.find((t: any) => String(t.id) === String(tx.reconciliationRefId))
                  : null;
                const refAccount = tx.reconciliationRefType === 'account' && tx.reconciliationRefId && accountsList
                  ? (accountsList as any[]).find((a: any) => String(a.id) === String(tx.reconciliationRefId))
                  : null;
                let typeLabel = tx.reconciliationRefType || '\u2014';
                if (tx.reconciliationRefType === 'transfer' && pairedTx) {
                  typeLabel = `Transfer to/from ${pairedTx.accountName || pairedTx.accountCode || 'other account'}`;
                } else if (tx.reconciliationRefType === 'account') {
                  typeLabel = refAccount ? `Account: ${refAccount.code ?? ''} ${refAccount.name ?? ''}`.trim() || 'Account' : 'Account';
                } else if (tx.reconciliationRefType === 'journal') {
                  typeLabel = 'Journal entry';
                }
                return (
                  <TableRow key={tx.id}>
                    <TableCell className="w-24 whitespace-nowrap">{formatYyMmDd(tx.date)}</TableCell>
                    <TableCell className="min-w-0 truncate" title={tx.description || undefined}>{truncate(tx.description)}</TableCell>
                    <TableCell className="w-24 min-w-0 truncate" title={typeLabel}>{truncate(typeLabel, 18)}</TableCell>
                    <TableCell className="w-24 text-right whitespace-nowrap">€{Number(tx?.amount ?? 0).toFixed(2)}</TableCell>
                    <TableCell className="w-[200px]">
                      <Button variant="outline" size="sm" onClick={() => handleUnmatch(tx.id)}>Unmatch</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredPairedTxs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">{pairedTxs.length === 0 ? 'No paired transactions yet.' : 'No matches for search.'}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <Pagination
            page={reconciledPage}
            totalItems={filteredPairedTxs.length}
            pageSize={PAGE_SIZE}
            onPrev={() => setReconciledPage((p) => Math.max(0, p - 1))}
            onNext={() => setReconciledPage((p) => Math.min(Math.ceil(filteredPairedTxs.length / PAGE_SIZE) - 1, p + 1))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
