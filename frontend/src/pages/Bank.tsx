import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useBankTransactions, useBankImportPreview, useConfirmBankImport, useUpdateBankTransaction, useDeleteBankTransaction, type BankImportPreviewRow } from '../hooks/useBank';
import { useAccountsAll } from '../hooks/useSettings';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Upload, Link as LinkIcon, Pencil, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { formatYyMmDd } from '@/lib/date';

const PAGE_SIZE = 10;

function truncate(str: string | null | undefined, len = 20): string {
  const s = String(str ?? '').trim();
  return s.length > len ? s.slice(0, len) + '\u2026' : s || '\u2014';
}

type SortKey = 'date' | 'reference' | 'description' | 'amount' | 'status';
type SortDir = 'asc' | 'desc';

function SortableTh({
  label,
  sortKey,
  currentSortKey,
  sortDir,
  onSort,
  className = '',
}: {
  label: string;
  sortKey: SortKey;
  currentSortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const isActive = currentSortKey === sortKey;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 font-medium hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring rounded"
      >
        {label}
        {isActive ? (sortDir === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />) : null}
      </button>
    </TableHead>
  );
}

type ReviewRow = BankImportPreviewRow & { selected: boolean };

const ASSET_CODE_MIN = 100;
const ASSET_CODE_MAX = 199;

export default function Bank() {
  const { data: transactions, isLoading } = useBankTransactions();
  const { data: allAccounts } = useAccountsAll();
  const previewMutation = useBankImportPreview();
  const confirmImportMutation = useConfirmBankImport();
  const updateMutation = useUpdateBankTransaction();
  const deleteMutation = useDeleteBankTransaction();

  const assetAccounts = (allAccounts ?? []).filter(
    (a: { code: number }) => a.code >= ASSET_CODE_MIN && a.code <= ASSET_CODE_MAX
  ).sort((a: { code: number }, b: { code: number }) => a.code - b.code);
  const defaultBankAccountId = assetAccounts.length > 0 ? assetAccounts[0].id : null;

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterAccountId, setFilterAccountId] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [editingTx, setEditingTx] = useState<any>(null);
  const [deletingTx, setDeletingTx] = useState<any>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ date: '', type: 'out' as 'in' | 'out', amount: '', reference: '', description: '', accountId: '' as string });
  const [importReviewOpen, setImportReviewOpen] = useState(false);
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [importAccountId, setImportAccountId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    if (defaultBankAccountId && importAccountId === null) setImportAccountId(defaultBankAccountId);
  }, [defaultBankAccountId, importAccountId]);

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir(key === 'date' || key === 'amount' ? 'desc' : 'asc');
    }
  };

  const openEdit = (tx: any) => {
    setEditingTx(tx);
    setEditForm({
      date: (tx.date || '').toString().slice(0, 10),
      type: tx.type === 'in' ? 'in' : 'out',
      amount: tx.amount != null ? String(Math.abs(Number(tx.amount))) : '',
      reference: tx.reference ?? '',
      description: tx.description ?? '',
      accountId: tx.accountId ?? '',
    });
  };

  const submitEdit = async () => {
    if (!editingTx?.id) return;
    const amount = Math.round((Number(editForm.amount) || 0) * 100) / 100;
    await updateMutation.mutateAsync({
      id: editingTx.id,
      date: editForm.date,
      type: editForm.type,
      amount,
      reference: editForm.reference,
      description: editForm.description,
      accountId: editForm.accountId || undefined,
    });
    setEditingTx(null);
  };

  const confirmDelete = async () => {
    if (!deletingTx?.id) return;
    setDeleteError(null);
    try {
      await deleteMutation.mutateAsync(deletingTx.id);
      setDeletingTx(null);
    } catch (err: any) {
      setDeleteError(err?.response?.data?.error ?? 'Failed to delete');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const formData = new FormData();
      formData.append('file', file);
      setImportError(null);
      try {
        const rows = await previewMutation.mutateAsync(formData);
        setReviewRows(rows.map((r) => ({ ...r, selected: true })));
        setImportReviewOpen(true);
      } catch (err: any) {
        setImportError(err?.response?.data?.error ?? 'Failed to parse CSV');
      }
      e.target.value = '';
    }
  };

  const setReviewRow = (index: number, upd: Partial<ReviewRow>) => {
    setReviewRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...upd } : r)));
  };

  const setReviewRowField = (index: number, field: keyof BankImportPreviewRow, value: string | number) => {
    setReviewRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  const selectedCount = reviewRows.filter((r) => r.selected).length;

  const handleImportSelected = async () => {
    const toImport = reviewRows.filter((r) => r.selected).map(({ date, type, amount, reference, description }) => ({
      date,
      type,
      amount: Math.round((Number(amount) || 0) * 100) / 100,
      reference: String(reference ?? '').trim(),
      description: String(description ?? '').trim() || 'Imported',
    }));
    if (toImport.length === 0) return;
    setImportError(null);
    try {
      await confirmImportMutation.mutateAsync({ rows: toImport, accountId: importAccountId || defaultBankAccountId });
      setImportReviewOpen(false);
      setReviewRows([]);
    } catch (err: any) {
      setImportError(err?.response?.data?.error ?? 'Import failed');
    }
  };

  const filteredTransactions = (transactions ?? []).filter((tx: any) => {
    const desc = (tx.description || '').toLowerCase();
    const ref = (tx.reference || '').toLowerCase();
    const amountStr = String(Math.abs(Number(tx.amount)) ?? '');
    const term = searchTerm.toLowerCase().trim();
    const matchesSearch = !term || desc.includes(term) || ref.includes(term) || amountStr.includes(term.replace(',', '.'));
    if (filterAccountId !== 'all' && tx.accountId !== filterAccountId) return false;
    if (filterType === 'unreconciled' && tx.reconciled) return false;
    if (filterType === 'reconciled' && !tx.reconciled) return false;
    if (filterType === 'in' && tx.type !== 'in') return false;
    if (filterType === 'out' && tx.type !== 'out') return false;
    return matchesSearch;
  });

  const sortedTransactions = [...filteredTransactions].sort((a: any, b: any) => {
    let cmp = 0;
    if (sortBy === 'date') {
      cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
    } else if (sortBy === 'reference') {
      cmp = (a.reference || '').localeCompare(b.reference || '');
    } else if (sortBy === 'description') {
      cmp = (a.description || '').localeCompare(b.description || '');
    } else if (sortBy === 'amount') {
      cmp = Math.abs(Number(a.amount)) - Math.abs(Number(b.amount));
    } else {
      cmp = (a.reconciled ? 1 : 0) - (b.reconciled ? 1 : 0);
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totalCount = sortedTransactions.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pageIndex = Math.min(page, Math.max(0, totalPages - 1));
  const pageSlice = sortedTransactions.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);

  useEffect(() => {
    if (pageIndex < page) setPage(pageIndex);
  }, [totalCount, page, pageIndex]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Bank Transactions</h2>
          <p className="text-muted-foreground">Manage and reconcile bank statements.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input 
            type="file" 
            accept=".csv" 
            className="hidden" 
            id="csv-upload" 
            onChange={handleFileUpload}
            disabled={previewMutation.isPending}
          />
          <label htmlFor="csv-upload">
            <span className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 cursor-pointer">
              <Upload className="w-4 h-4 mr-2" />
              {previewMutation.isPending ? 'Parsing...' : 'Import CSV'}
            </span>
          </label>
        </div>
      </div>

      <Card>
        <CardHeader className="py-4">
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <Input 
              placeholder="Search by reference, description or amount..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
            <Select value={filterType} onValueChange={(val) => setFilterType(val || 'all')}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Transactions</SelectItem>
                <SelectItem value="unreconciled">Unreconciled</SelectItem>
                <SelectItem value="reconciled">Reconciled</SelectItem>
                <SelectItem value="in">Money In</SelectItem>
                <SelectItem value="out">Money Out</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterAccountId} onValueChange={(val) => setFilterAccountId(val || 'all')}>
              <SelectTrigger className="w-[180px]">
                <span className="truncate">
                  {filterAccountId === 'all' ? 'All accounts' : (() => {
                    const sel = assetAccounts.find((a: { id: string }) => a.id === filterAccountId);
                    return sel ? `${sel.code} ${sel.name}` : 'Account...';
                  })()}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All accounts</SelectItem>
                {assetAccounts.map((a: { id: string; code: number; name: string }) => (
                  <SelectItem key={a.id} value={a.id}>{a.code} {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <SortableTh label="Date" sortKey="date" currentSortKey={sortBy} sortDir={sortDir} onSort={handleSort} className="w-24" />
                  <SortableTh label="Reference" sortKey="reference" currentSortKey={sortBy} sortDir={sortDir} onSort={handleSort} className="w-32" />
                  <SortableTh label="Description" sortKey="description" currentSortKey={sortBy} sortDir={sortDir} onSort={handleSort} className="w-32" />
                  <TableHead className="w-28">Account</TableHead>
                  <SortableTh label="Amount" sortKey="amount" currentSortKey={sortBy} sortDir={sortDir} onSort={handleSort} className="w-24 text-right" />
                  <SortableTh label="Status" sortKey="status" currentSortKey={sortBy} sortDir={sortDir} onSort={handleSort} className="w-24" />
                  <TableHead className="w-[200px] whitespace-nowrap">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {totalCount === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-4 text-muted-foreground">
                      No transactions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  pageSlice.map((tx: any) => (
                    <TableRow key={tx.id}>
                      <TableCell className="w-24 whitespace-nowrap">{formatYyMmDd(tx.date)}</TableCell>
                      <TableCell className="w-32 font-medium truncate" title={tx.reference || undefined}>
                        {truncate(tx.reference)}
                      </TableCell>
                      <TableCell className="w-32 truncate" title={tx.description || undefined}>
                        {truncate(tx.description)}
                      </TableCell>
                      <TableCell className="w-28 truncate" title={tx.accountName || (tx.accountCode != null ? String(tx.accountCode) : undefined)}>
                        {tx.accountCode != null ? `${tx.accountCode}` : '\u2014'}
                        {tx.accountName ? ` ${truncate(tx.accountName, 12)}` : ''}
                      </TableCell>
                      <TableCell className={`w-24 text-right font-medium whitespace-nowrap ${tx.type === 'in' ? 'text-emerald-600' : 'text-slate-900'}`}>
                        {tx.type === 'in' ? '+' : '-'}€{Math.abs(Number(tx.amount)).toFixed(2)}
                      </TableCell>
                      <TableCell className="w-24">
                        {tx.reconciled ? (
                          <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-emerald-50 text-emerald-700">
                            Reconciled
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-slate-100 text-slate-700">
                            Unreconciled
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="w-[200px] whitespace-nowrap">
                        <div className="flex items-center gap-1 flex-wrap">
                          <Button variant="ghost" size="sm" className="h-8 shrink-0" onClick={() => openEdit(tx)}>
                            <Pencil className="w-4 h-4 mr-1" /> Edit
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 shrink-0 text-destructive hover:text-destructive" onClick={() => { setDeletingTx(tx); setDeleteError(null); }}>
                            <Trash2 className="w-4 h-4 mr-1" /> Delete
                          </Button>
                          {!tx.reconciled && (
                            <Link to={`/reconciliation?bankTxId=${encodeURIComponent(tx.id)}`} className="shrink-0">
                              <Button variant="ghost" size="sm" className="h-8">
                                <LinkIcon className="w-4 h-4 mr-1" /> Match
                              </Button>
                            </Link>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {totalCount > 0 && (
              <div className="flex items-center justify-between gap-2 py-2 text-sm text-muted-foreground">
                <span>Showing {pageIndex * PAGE_SIZE + 1}-{Math.min((pageIndex + 1) * PAGE_SIZE, totalCount)} of {totalCount}</span>
                {totalCount > PAGE_SIZE && (
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={pageIndex <= 0}>
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={pageIndex >= totalPages - 1}>
                      Next
                    </Button>
                  </div>
                )}
              </div>
            )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingTx} onOpenChange={(open) => !open && setEditingTx(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit transaction</DialogTitle>
            <DialogDescription>
              Change date, amount, or description. {editingTx?.reconciled && (
                <span className="block mt-1 text-amber-600">This transaction is reconciled; editing may affect reporting.</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-2">
              <Label htmlFor="edit-date">Date</Label>
              <Input
                id="edit-date"
                type="date"
                className="col-span-3"
                value={editForm.date}
                onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-2">
              <Label>Type</Label>
              <Select value={editForm.type} onValueChange={(v) => v && setEditForm((f) => ({ ...f, type: v as 'in' | 'out' }))}>
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Money In</SelectItem>
                  <SelectItem value="out">Money Out</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-2">
              <Label htmlFor="edit-amount">Amount</Label>
              <Input
                id="edit-amount"
                type="number"
                step="0.01"
                min="0"
                className="col-span-3"
                value={editForm.amount}
                onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-2">
              <Label htmlFor="edit-reference">Reference</Label>
              <Input
                id="edit-reference"
                className="col-span-3"
                value={editForm.reference}
                onChange={(e) => setEditForm((f) => ({ ...f, reference: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-2">
              <Label htmlFor="edit-description">Description</Label>
              <Input
                id="edit-description"
                className="col-span-3"
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            {assetAccounts.length > 0 && (
              <div className="grid grid-cols-4 items-center gap-2">
                <Label>Account</Label>
                <Select value={editForm.accountId || defaultBankAccountId || ''} onValueChange={(v) => setEditForm((f) => ({ ...f, accountId: v }))}>
                  <SelectTrigger className="col-span-3">
                    <span className="truncate">
                      {(() => {
                        const sel = assetAccounts.find((a: { id: string }) => a.id === (editForm.accountId || defaultBankAccountId));
                        return sel ? `${sel.code} ${sel.name}` : 'Select account...';
                      })()}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {assetAccounts.map((a: { id: string; code: number; name: string }) => (
                      <SelectItem key={a.id} value={a.id}>{a.code} {a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter showCloseButton>
            <Button onClick={submitEdit} disabled={updateMutation.isPending || !editForm.date || !editForm.amount}>
              {updateMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingTx} onOpenChange={(open) => { if (!open) { setDeletingTx(null); setDeleteError(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete transaction</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this transaction? This cannot be undone.
              {deletingTx?.reconciled && (
                <span className="block mt-2 text-amber-600">This transaction is paired. Unmatch it in Reconciliation first before you can delete it.</span>
              )}
              {deleteError && (
                <span className="block mt-2 text-destructive">{deleteError}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending || !!deletingTx?.reconciled}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importReviewOpen} onOpenChange={(open) => { setImportReviewOpen(open); if (!open) { setReviewRows([]); setImportError(null); } }}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Review import</DialogTitle>
            <DialogDescription>
              Uncheck rows to exclude from import. Choose the account to import into, then click Import selected.
            </DialogDescription>
          </DialogHeader>
          {assetAccounts.length > 0 && (
            <div className="flex items-center gap-2 py-2 border-b">
              <Label className="shrink-0">Import to account</Label>
              <Select value={importAccountId || defaultBankAccountId || ''} onValueChange={(v) => setImportAccountId(v)}>
                <SelectTrigger className="w-[280px]">
                  <span className="truncate">
                    {(() => {
                      const sel = assetAccounts.find((a: { id: string }) => a.id === (importAccountId || defaultBankAccountId));
                      return sel ? `${sel.code} ${sel.name}` : 'Select account...';
                    })()}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {assetAccounts.map((a: { id: string; code: number; name: string }) => (
                    <SelectItem key={a.id} value={a.id}>{a.code} {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-center gap-2 py-2 border-b">
            <Button variant="outline" size="sm" onClick={() => setReviewRows((prev) => prev.map((r) => ({ ...r, selected: true })))}>
              Select all
            </Button>
            <Button variant="outline" size="sm" onClick={() => setReviewRows((prev) => prev.map((r) => ({ ...r, selected: false })))}>
              Deselect all
            </Button>
            <span className="text-sm text-muted-foreground ml-2">
              {selectedCount} of {reviewRows.length} selected
            </span>
          </div>
          <div className="overflow-auto flex-1 min-h-0 -mx-6 px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">Include</TableHead>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead className="w-24">Type</TableHead>
                  <TableHead className="w-28 text-right">Amount</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviewRows.map((row, i) => (
                  <TableRow key={i} className={row.selected ? '' : 'opacity-60 bg-muted/30'}>
                    <TableCell className="align-middle">
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={(e) => setReviewRow(i, { selected: e.target.checked })}
                        className="h-4 w-4 rounded border-input"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="date"
                        className="h-8 text-sm"
                        value={(row.date || '').toString().slice(0, 10)}
                        onChange={(e) => setReviewRowField(i, 'date', e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Select value={row.type} onValueChange={(v) => v && setReviewRowField(i, 'type', v as 'in' | 'out')}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="in">In</SelectItem>
                          <SelectItem value="out">Out</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        step="0.01"
                        className="h-8 text-sm text-right"
                        value={row.amount}
                        onChange={(e) => setReviewRowField(i, 'amount', e.target.value === '' ? 0 : Number(e.target.value))}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 text-sm"
                        value={row.reference ?? ''}
                        onChange={(e) => setReviewRowField(i, 'reference', e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 text-sm"
                        value={row.description ?? ''}
                        onChange={(e) => setReviewRowField(i, 'description', e.target.value)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {importError && (
            <p className="text-sm text-destructive mt-2">{importError}</p>
          )}
          <DialogFooter showCloseButton>
            <Button
              onClick={handleImportSelected}
              disabled={confirmImportMutation.isPending || selectedCount === 0}
            >
              {confirmImportMutation.isPending ? 'Importing...' : `Import selected (${selectedCount})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
