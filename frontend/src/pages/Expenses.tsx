import { useState, useEffect } from 'react';
import { useExpenses, useDeleteExpense, useExpenseCategories, useExpenseAccounts } from '../hooks/useExpenses';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, Edit, Eye, Download, FileImage, Layers, ChevronUp, ChevronDown, FolderOpen } from 'lucide-react';
import { formatYyMmDd } from '@/lib/date';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FilePreviewDialog } from '@/components/FilePreviewDialog';
import { api } from '../lib/api';
import { compressImageForUpload } from '../lib/imageCompress';
import { useQueryClient } from '@tanstack/react-query';
import { useSuppliers } from '../hooks/useContacts';

const defaultFormValues = {
  vendor: '',
  date: new Date().toISOString().split('T')[0],
  amount: '',
  vatRate: '21',
  vat: '',
  categoryId: '' as string,
  accountId: '' as string,
  invoiceNumber: '',
  notes: '',
};

function truncate(str: string | null | undefined, len = 20): string {
  const s = String(str ?? '').trim();
  return s.length > len ? s.slice(0, len) + '\u2026' : s || '\u2014';
}

type ExpenseSortKey = 'date' | 'vendor' | 'category' | 'amount' | 'total' | 'status';
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
  sortKey: ExpenseSortKey;
  currentSortKey: ExpenseSortKey;
  sortDir: SortDir;
  onSort: (key: ExpenseSortKey) => void;
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

export default function Expenses() {
  const queryClient = useQueryClient();
  const { data: expenses, isLoading } = useExpenses();
  const deleteExpense = useDeleteExpense();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedExpense, setSelectedExpense] = useState<any>(null);
  const [dialogMode, setDialogMode] = useState<'view' | 'edit' | null>(null);
  const [previewExpenseId, setPreviewExpenseId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState(defaultFormValues);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractionStatus, setExtractionStatus] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<number>>(new Set());
  const [multiEditCategoryOpen, setMultiEditCategoryOpen] = useState(false);
  const [multiEditCategoryId, setMultiEditCategoryId] = useState<string | null>(null);
  const [multiEditAccountId, setMultiEditAccountId] = useState<string | null>(null);
  const [multiEditSaving, setMultiEditSaving] = useState(false);
  const [sortBy, setSortBy] = useState<ExpenseSortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (key: ExpenseSortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir(key === 'date' || key === 'amount' || key === 'total' ? 'desc' : 'asc');
    }
  };

  const { data: categories } = useExpenseCategories();
  const { data: expenseAccounts } = useExpenseAccounts();
  const { data: suppliers } = useSuppliers();
  const useAccountId = (expenseAccounts && expenseAccounts.length > 0);

  const [batchOpen, setBatchOpen] = useState(false);
  const [batchStep, setBatchStep] = useState<1 | 2 | 3>(1);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchItems, setBatchItems] = useState<Array<{ index: number; fileName: string; vendor: string; date: string; vatRate: number; netAmount: number; vatAmount: number; total: number; invoiceNumber: string | null; notes: string }>>([]);
  const [batchUploading, setBatchUploading] = useState(false);
  const [batchUploadError, setBatchUploadError] = useState<string | null>(null);
  type SupplierMapping = { type: 'existing'; supplierId: string } | { type: 'new'; name: string; categoryId: string | null };
  const [supplierMappings, setSupplierMappings] = useState<Record<string, SupplierMapping>>({});
  const [previewItems, setPreviewItems] = useState<Array<{ index: number; fileName: string; vendor: string; date: string; vatRate: number; categoryName: string; total: number; netAmount: number; vatAmount: number }>>([]);
  const [batchSelectedIndexes, setBatchSelectedIndexes] = useState<Set<number>>(new Set());
  const [batchImporting, setBatchImporting] = useState(false);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this expense?')) {
      await deleteExpense.mutateAsync(id);
    }
  };

  // Reset form when opening edit dialog
  useEffect(() => {
    if (dialogMode === 'edit') {
      if (selectedExpense?.id) {
        setFormValues({
          vendor: selectedExpense.vendor ?? '',
          date: selectedExpense.date ? new Date(selectedExpense.date).toISOString().split('T')[0] : defaultFormValues.date,
          amount: selectedExpense.amount != null ? String(selectedExpense.amount) : '',
          vatRate: selectedExpense.vatRate != null ? String(selectedExpense.vatRate) : '21',
          vat: selectedExpense.vat != null ? String(selectedExpense.vat) : '',
          categoryId: selectedExpense.categoryId ?? '',
          accountId: selectedExpense.accountId ?? selectedExpense.categoryId ?? '',
          invoiceNumber: selectedExpense.invoiceNumber ?? '',
          notes: selectedExpense.notes ?? '',
        });
      } else {
        setFormValues(defaultFormValues);
      }
      setSelectedFile(null);
      setExtractionStatus('');
    }
  }, [dialogMode, selectedExpense?.id]);

  const handleExtractData = async () => {
    if (!selectedFile) return;
    setExtracting(true);
    setExtractionStatus('Analyzing invoice...');
    try {
      const fileToUpload = await compressImageForUpload(selectedFile, 1500);
      const formData = new FormData();
      formData.append('file', fileToUpload);
      const res = await api.post<{ success: boolean; data?: any }>('/expenses/extract', formData);
      const data = res.data?.data;
      if (res.data?.success && data) {
        const notesParts: string[] = [];
        if (data.description) notesParts.push(data.description);
        if (data.currency && data.currency !== 'EUR') notesParts.push(`Currency: ${data.currency}`);
        setFormValues((prev) => ({
          ...prev,
          vendor: data.vendor ?? prev.vendor,
          date: data.date ?? prev.date,
          amount: data.netAmount != null ? String(Number(data.netAmount).toFixed(2)) : prev.amount,
          vatRate: data.vatRate != null ? String(Math.round(data.vatRate)) : prev.vatRate,
          vat: data.vatAmount != null ? String(Number(data.vatAmount).toFixed(2)) : prev.vat,
          invoiceNumber: data.invoiceNumber ?? prev.invoiceNumber,
          notes: notesParts.length ? notesParts.join('\n') : prev.notes,
        }));
        setExtractionStatus('Data extracted. Review and save.');
      } else {
        setExtractionStatus('Could not extract data. Fill in manually.');
      }
    } catch (err: unknown) {
      const status = err && typeof err === 'object' && 'response' in err && err.response && typeof (err.response as { status?: number }).status === 'number'
        ? (err.response as { status: number }).status
        : null;
      if (status === 413) {
        setExtractionStatus('File too large. Use a smaller image or reduce quality. The server may have an upload size limit.');
      } else {
        setExtractionStatus('Extraction failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
      }
    } finally {
      setExtracting(false);
    }
  };

  const filteredExpenses = expenses?.filter((ex: any) => {
    const matchesSearch = (ex.vendor || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (ex.notes || '').toLowerCase().includes(searchTerm.toLowerCase());
    const isPaid = !!ex.bankTransactionId;
    if (filterStatus === 'open' && isPaid) return false;
    if (filterStatus === 'paired' && !isPaid) return false;
    return matchesSearch;
  }) || [];

  const sortedExpenses = [...filteredExpenses].sort((a: any, b: any) => {
    let cmp = 0;
    if (sortBy === 'date') {
      cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
    } else if (sortBy === 'vendor') {
      cmp = (a.vendor || '').localeCompare(b.vendor || '');
    } else if (sortBy === 'category') {
      cmp = (a.categoryName || '').localeCompare(b.categoryName || '');
    } else if (sortBy === 'amount') {
      cmp = Number(a.amount) - Number(b.amount);
    } else if (sortBy === 'total') {
      const totalA = Number(a.amount || 0) + Number(a.vat || 0);
      const totalB = Number(b.amount || 0) + Number(b.vat || 0);
      cmp = totalA - totalB;
    } else {
      cmp = (a.bankTransactionId ? 1 : 0) - (b.bankTransactionId ? 1 : 0);
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const toggleSelectExpense = (id: number) => {
    setSelectedExpenseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedExpenseIds.size === sortedExpenses.length) {
      setSelectedExpenseIds(new Set());
    } else {
      setSelectedExpenseIds(new Set(sortedExpenses.map((ex: any) => ex.id)));
    }
  };

  const handleMultiEditCategory = async () => {
    if (selectedExpenseIds.size === 0) return;
    setMultiEditSaving(true);
    try {
      const payload = useAccountId
        ? (multiEditAccountId != null ? { accountId: multiEditAccountId } : { accountId: null })
        : (multiEditCategoryId ? { categoryId: multiEditCategoryId } : { categoryId: null });
      await Promise.all(
        Array.from(selectedExpenseIds).map((id) =>
          api.put(`/expenses/${id}`, payload)
        )
      );
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setMultiEditCategoryOpen(false);
      setMultiEditCategoryId(null);
      setMultiEditAccountId(null);
      setSelectedExpenseIds(new Set());
    } catch (err) {
      console.error(err);
      alert('Failed to update accounts');
    } finally {
      setMultiEditSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Expenses</h2>
          <p className="text-muted-foreground">Manage your purchases and bills.</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedExpenseIds.size > 0 && (
            <Button
              variant="outline"
              onClick={() => setMultiEditCategoryOpen(true)}
            >
              <Layers className="h-4 w-4 mr-2" />
              Change category ({selectedExpenseIds.size})
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => {
              setBatchOpen(true);
              setBatchStep(1);
              setBatchId(null);
              setBatchItems([]);
              setBatchUploadError(null);
              setSupplierMappings({});
              setPreviewItems([]);
              setBatchSelectedIndexes(new Set());
              setBatchFiles([]);
            }}
          >
            <FolderOpen className="h-4 w-4 mr-2" />
            Batch import
          </Button>
          <Button onClick={() => {
            setSelectedExpense({});
            setDialogMode('edit');
          }}>Add Expense</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="py-4">
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <Input 
              placeholder="Search supplier or notes..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
            <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val || 'all')}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Expenses</SelectItem>
                <SelectItem value="open">Unpaid (Open)</SelectItem>
                <SelectItem value="paired">Paid (Paired)</SelectItem>
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
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={sortedExpenses.length > 0 && selectedExpenseIds.size === sortedExpenses.length}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <SortableTh label="Date" sortKey="date" currentSortKey={sortBy} sortDir={sortDir} onSort={handleSort} className="w-24" />
                  <SortableTh label="Supplier" sortKey="vendor" currentSortKey={sortBy} sortDir={sortDir} onSort={handleSort} className="w-40" />
                  <SortableTh label="Category" sortKey="category" currentSortKey={sortBy} sortDir={sortDir} onSort={handleSort} className="w-28" />
                  <SortableTh label="Net" sortKey="amount" currentSortKey={sortBy} sortDir={sortDir} onSort={handleSort} className="w-24 text-right" />
                  <SortableTh label="Total" sortKey="total" currentSortKey={sortBy} sortDir={sortDir} onSort={handleSort} className="w-24 text-right" />
                  <SortableTh label="Status" sortKey="status" currentSortKey={sortBy} sortDir={sortDir} onSort={handleSort} className="w-20" />
                  <TableHead className="w-[200px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedExpenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-4 text-muted-foreground">
                      No expenses found.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedExpenses.map((expense: any) => (
                    <TableRow key={expense.id}>
                      <TableCell className="w-10">
                        <Checkbox
                          checked={selectedExpenseIds.has(expense.id)}
                          onCheckedChange={() => toggleSelectExpense(expense.id)}
                          aria-label={`Select ${expense.vendor}`}
                        />
                      </TableCell>
                      <TableCell className="w-24 whitespace-nowrap">{formatYyMmDd(expense.date)}</TableCell>
                      <TableCell className="w-40 font-medium truncate" title={expense.vendor || undefined}>{truncate(expense.vendor)}</TableCell>
                      <TableCell className="w-28 truncate" title={expense.accountName || expense.categoryName || undefined}>{truncate(expense.accountName || expense.categoryName, 14) || '\u2014'}</TableCell>
                      <TableCell className="w-24 text-right whitespace-nowrap">€{Number(expense.amount).toFixed(2)}</TableCell>
                      <TableCell className="w-24 text-right whitespace-nowrap">€{(Number(expense.amount) + Number(expense.vat || 0)).toFixed(2)}</TableCell>
                      <TableCell className="w-20">
                        {expense.bankTransactionId ? (
                          <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-emerald-50 text-emerald-700">
                            Paid
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-amber-50 text-amber-700">
                            Open
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="w-[200px]">
                        <div className="flex items-center gap-1 flex-wrap">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 shrink-0"
                            onClick={() => {
                              setSelectedExpense(expense);
                              setDialogMode('view');
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => {
                              setSelectedExpense(expense);
                              setDialogMode('edit');
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {expense.fileName && (
                            <>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-blue-600 hover:text-blue-700"
                                onClick={() => setPreviewExpenseId(expense.id)}
                                title="Preview receipt"
                              >
                                <FileImage className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-blue-600 hover:text-blue-700"
                                onClick={() => window.open(`/api/expenses/${expense.id}/file`, '_blank')}
                                title="Download receipt"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDelete(expense.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!dialogMode} onOpenChange={(open) => !open && setDialogMode(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'view' ? 'Expense Details' : selectedExpense?.id ? 'Edit Expense' : 'Add Expense'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {dialogMode === 'view' && selectedExpense && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Supplier</div>
                    <div>{selectedExpense.vendor || '-'}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Date</div>
                    <div>{formatYyMmDd(selectedExpense.date)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Amount</div>
                    <div>€{Number(selectedExpense.amount).toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Account / Category</div>
                    <div>{selectedExpense.accountName || selectedExpense.categoryName || '-'}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-sm font-medium text-muted-foreground">Notes</div>
                    <div className="text-sm">{selectedExpense.notes || '-'}</div>
                  </div>
                  {selectedExpense.invoiceNumber && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Invoice #</div>
                      <div>{selectedExpense.invoiceNumber}</div>
                    </div>
                  )}
                  {selectedExpense.fileName && (
                    <div className="col-span-2 mt-2 flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setPreviewExpenseId(selectedExpense.id)}>
                        <FileImage className="mr-2 h-4 w-4" /> Preview Receipt
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => window.open(`/api/expenses/${selectedExpense.id}/file`, '_blank')}>
                        <Download className="mr-2 h-4 w-4" /> Download
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
            {dialogMode === 'edit' && (
              <form onSubmit={async (e) => {
                e.preventDefault();
                try {
                  if (selectedExpense?.id) {
                    await api.put(`/expenses/${selectedExpense.id}`, formValues);
                  } else {
                    const formData = new FormData();
                    Object.entries(formValues).forEach(([k, v]) => { if (v != null && v !== '') formData.append(k, String(v)); });
                    if (selectedFile) {
                      const fileToUpload = await compressImageForUpload(selectedFile, 1500);
                      formData.append('file', fileToUpload);
                    }
                    await api.post('/expenses', formData);
                  }
                  queryClient.invalidateQueries({ queryKey: ['expenses'] });
                  setDialogMode(null);
                } catch (error: unknown) {
                  console.error(error);
                  const status = error && typeof error === 'object' && 'response' in error && (error as { response?: { status?: number } }).response?.status;
                  if (status === 413) {
                    alert('File too large. Use a smaller image or reduce quality. The server upload limit may need to be increased.');
                  } else {
                    alert('Failed to save expense');
                  }
                }
              }} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Vendor / Supplier</label>
                  <Input name="vendor" value={formValues.vendor} onChange={(e) => setFormValues((p) => ({ ...p, vendor: e.target.value }))} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Date</label>
                    <Input type="date" name="date" value={formValues.date} onChange={(e) => setFormValues((p) => ({ ...p, date: e.target.value }))} required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Amount (Net)</label>
                    <Input type="number" step="0.01" name="amount" value={formValues.amount} onChange={(e) => setFormValues((p) => ({ ...p, amount: e.target.value }))} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">VAT Rate (%)</label>
                    <Select name="vatRate" value={formValues.vatRate} onValueChange={(v) => setFormValues((p) => ({ ...p, vatRate: v ?? '21' }))}>
                      <SelectTrigger><SelectValue placeholder="Select VAT" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">0%</SelectItem>
                        <SelectItem value="9">9%</SelectItem>
                        <SelectItem value="21">21%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">VAT Amount</label>
                    <Input type="number" step="0.01" name="vat" value={formValues.vat} onChange={(e) => setFormValues((p) => ({ ...p, vat: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{useAccountId ? 'Account' : 'Category'}</label>
                  <Select
                    value={useAccountId ? (formValues.accountId || '') : (formValues.categoryId || '')}
                    onValueChange={(v) => setFormValues((p) => ({
                      ...p,
                      accountId: useAccountId ? (v ?? '') : p.accountId,
                      categoryId: useAccountId ? p.categoryId : (v ?? ''),
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={useAccountId ? 'Select account' : 'Select category'}>
                        {useAccountId && formValues.accountId
                          ? (expenseAccounts || []).find((a: any) => a.id === formValues.accountId) && `${(expenseAccounts || []).find((a: any) => a.id === formValues.accountId)?.code} - ${(expenseAccounts || []).find((a: any) => a.id === formValues.accountId)?.name}`
                          : !useAccountId && formValues.categoryId
                            ? (categories || []).find((c: any) => c.id === formValues.categoryId)?.name
                            : undefined}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No {useAccountId ? 'account' : 'category'}</SelectItem>
                      {useAccountId
                        ? (expenseAccounts || []).sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.code - b.code)).map((acc: any) => (
                            <SelectItem key={acc.id} value={acc.id}>{acc.code} - {acc.name}</SelectItem>
                          ))
                        : (categories || []).sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((cat: any) => (
                            <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                          ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Invoice Number (Optional)</label>
                  <Input name="invoiceNumber" value={formValues.invoiceNumber} onChange={(e) => setFormValues((p) => ({ ...p, invoiceNumber: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Notes</label>
                  <Input name="notes" value={formValues.notes} onChange={(e) => setFormValues((p) => ({ ...p, notes: e.target.value }))} />
                </div>
                {!selectedExpense?.id && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Receipt/Invoice File</label>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp"
                        className="flex-1 min-w-0"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          setSelectedFile(f ?? null);
                          setExtractionStatus(f ? 'Select file and click Extract Data to auto-fill fields.' : '');
                        }}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!selectedFile || extracting}
                        onClick={handleExtractData}
                      >
                        {extracting ? 'Extracting...' : 'Extract Data'}
                      </Button>
                    </div>
                    {extractionStatus && (
                      <p className="text-xs text-muted-foreground">{extractionStatus}</p>
                    )}
                  </div>
                )}
                <div className="flex justify-end pt-4">
                  <Button type="submit">Save Expense</Button>
                </div>
              </form>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={multiEditCategoryOpen} onOpenChange={setMultiEditCategoryOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{useAccountId ? 'Change account' : 'Change category'}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Set {useAccountId ? 'account' : 'category'} for {selectedExpenseIds.size} selected expense{selectedExpenseIds.size !== 1 ? 's' : ''}.
          </p>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">{useAccountId ? 'Account' : 'Category'}</label>
            {useAccountId ? (
              <Select value={multiEditAccountId ?? ''} onValueChange={(v) => setMultiEditAccountId(v || null)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account">
                    {multiEditAccountId && (expenseAccounts || []).find((a: any) => a.id === multiEditAccountId)
                      ? `${(expenseAccounts || []).find((a: any) => a.id === multiEditAccountId)?.code} - ${(expenseAccounts || []).find((a: any) => a.id === multiEditAccountId)?.name}`
                      : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No account</SelectItem>
                  {(expenseAccounts || []).sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.code - b.code)).map((acc: any) => (
                    <SelectItem key={acc.id} value={acc.id}>{acc.code} - {acc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Select value={multiEditCategoryId ?? ''} onValueChange={(v) => setMultiEditCategoryId(v || null)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category">
                    {multiEditCategoryId ? (categories || []).find((c: any) => c.id === multiEditCategoryId)?.name : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No category</SelectItem>
                  {(categories || []).sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((cat: any) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setMultiEditCategoryOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleMultiEditCategory}
              disabled={multiEditSaving}
            >
              {multiEditSaving ? 'Updating...' : 'Apply'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Batch expense import {batchStep === 1 ? '– Select files' : batchStep === 2 ? '– Match suppliers' : '– Review and import'}
            </DialogTitle>
          </DialogHeader>
          {batchStep === 1 && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Select invoice files from your computer (PDF, JPG, PNG, WebP, GIF). Max 1MB per file. They will be copied temporarily and processed with AI extraction.
              </p>
              <p className="text-xs text-muted-foreground">
                If upload fails with many files (413), the web server in front of this app often has a 1MB total request limit. An administrator must raise it to at least 35M for this domain (nginx: client_max_body_size 35M; Apache: LimitRequestBody 36700160).
              </p>
              <div className="flex flex-col gap-2">
                <Input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.gif"
                  multiple
                  onChange={(e) => setBatchFiles(e.target.files ? Array.from(e.target.files) : [])}
                />
                <Button
                  disabled={batchFiles.length === 0 || batchUploading}
                  onClick={async () => {
                    setBatchUploadError(null);
                    setBatchUploading(true);
                    try {
                      const filesToUpload = await Promise.all(batchFiles.map((f) => compressImageForUpload(f, 1500)));
                      const formData = new FormData();
                      filesToUpload.forEach((f) => formData.append('files', f));
                      const { data } = await api.post<{ batchId: string; items: typeof batchItems }>('/expenses/batch/upload', formData);
                      setBatchId(data.batchId);
                      setBatchItems(data.items);
                      const vendors = [...new Set(data.items.map((i: any) => i.vendor))];
                      const initial: Record<string, SupplierMapping> = {};
                      vendors.forEach((v) => {
                        initial[v] = { type: 'new', name: v, categoryId: null };
                      });
                      setSupplierMappings(initial);
                      setBatchStep(2);
                    } catch (err: any) {
                      const status = err.response?.status;
                      if (status === 413) {
                        setBatchUploadError('Request too large. The web server (proxy) in front of this app is rejecting the request—it often has a 1MB total limit, so many small files can trigger this. An administrator must raise the limit for this domain: nginx use client_max_body_size 35M; Apache use LimitRequestBody 36700160. Then try again.');
                      } else {
                        setBatchUploadError(err.response?.data?.error || err.message || 'Upload failed');
                      }
                    } finally {
                      setBatchUploading(false);
                    }
                  }}
                >
                  {batchUploading ? 'Processing…' : `Upload and extract (${batchFiles.length} file${batchFiles.length !== 1 ? 's' : ''})`}
                </Button>
                {batchUploadError && (
                  <p className="text-sm text-destructive">{batchUploadError}</p>
                )}
              </div>
            </div>
          )}
          {batchStep === 2 && batchId && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Match each extracted vendor to an existing supplier or create a new one (name and category).
              </p>
              <div className="space-y-4 max-h-[50vh] overflow-y-auto">
                {[...new Set(batchItems.map((i) => i.vendor))].map((vendor) => (
                  <div key={vendor} className="flex flex-wrap items-end gap-2 p-2 border rounded">
                    <span className="font-medium w-full text-sm text-muted-foreground">{vendor}</span>
                    <Select
                      value={supplierMappings[vendor]?.type === 'existing' ? String((supplierMappings[vendor] as { type: 'existing'; supplierId: string }).supplierId) : 'new'}
                      onValueChange={(val) => {
                        if (val === 'new' || !val) {
                          setSupplierMappings((m) => ({ ...m, [vendor]: { type: 'new', name: vendor, categoryId: null } }));
                        } else {
                          setSupplierMappings((m) => ({ ...m, [vendor]: { type: 'existing', supplierId: val as string } }));
                        }
                      }}
                    >
                      <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder="Select or create" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">Create new supplier</SelectItem>
                        {(suppliers || []).map((s) => (
                          <SelectItem key={String(s.id)} value={String(s.id)}>
                            {s.name}
                            {s.categoryName ? ` (${s.categoryName})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {supplierMappings[vendor]?.type === 'new' && (
                      <>
                        <Input
                          placeholder="Supplier name"
                          value={(supplierMappings[vendor] as { type: 'new'; name: string; categoryId: string | null }).name}
                          onChange={(e) =>
                            setSupplierMappings((m) => ({
                              ...m,
                              [vendor]: { type: 'new', name: e.target.value, categoryId: (m[vendor] as { type: 'new'; categoryId: string | null })?.categoryId ?? null },
                            }))
                          }
                          className="w-[180px]"
                        />
                        <Select
                          value={(supplierMappings[vendor] as { type: 'new'; categoryId: string | null })?.categoryId ?? ''}
                          onValueChange={(val) =>
                            setSupplierMappings((m) => ({
                              ...m,
                              [vendor]: { type: 'new', name: (m[vendor] as { type: 'new'; name: string })?.name ?? vendor, categoryId: val || null },
                            }))
                          }
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Category" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">No category</SelectItem>
                            {(categories || []).sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((cat: any) => (
                              <SelectItem key={cat.id} value={cat.id}>
                                {cat.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setBatchStep(1)}>
                  Back
                </Button>
                <Button
                  onClick={async () => {
                    const mappings = Object.entries(supplierMappings).map(([vendor, m]) => {
                      if (m.type === 'existing') return { vendor, supplierId: m.supplierId };
                      return { vendor, newSupplier: { name: m.name.trim() || vendor, categoryId: m.categoryId || null } };
                    });
                    await api.post('/expenses/batch/suppliers', { batchId, mappings });
                    const { data } = await api.get<{ items: typeof previewItems }>('/expenses/batch/preview', { params: { batchId } });
                    setPreviewItems(data.items);
                    setBatchSelectedIndexes(new Set(data.items.map((i: any) => i.index)));
                    setBatchStep(3);
                  }}
                >
                  Continue to review
                </Button>
              </div>
            </div>
          )}
          {batchStep === 3 && batchId && previewItems.length > 0 && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Uncheck any transaction that has an error. Only checked rows will be imported.
              </p>
              <div className="border rounded overflow-auto max-h-[40vh]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={batchSelectedIndexes.size === previewItems.length}
                          onCheckedChange={(checked) => {
                            if (checked) setBatchSelectedIndexes(new Set(previewItems.map((i) => i.index)));
                            else setBatchSelectedIndexes(new Set());
                          }}
                          aria-label="Select all"
                        />
                      </TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>VAT %</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewItems.map((row) => (
                      <TableRow key={row.index}>
                        <TableCell>
                          <Checkbox
                            checked={batchSelectedIndexes.has(row.index)}
                            onCheckedChange={(checked) => {
                              setBatchSelectedIndexes((prev) => {
                                const next = new Set(prev);
                                if (checked) next.add(row.index);
                                else next.delete(row.index);
                                return next;
                              });
                            }}
                            aria-label={`Select ${row.vendor}`}
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatYyMmDd(row.date)}</TableCell>
                        <TableCell className="font-medium truncate max-w-[140px]" title={row.vendor}>{row.vendor}</TableCell>
                        <TableCell>{row.vatRate}%</TableCell>
                        <TableCell className="truncate max-w-[120px]">{row.categoryName}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">€{Number(row.total).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setBatchStep(2)}>
                  Back
                </Button>
                <Button
                  disabled={batchSelectedIndexes.size === 0 || batchImporting}
                  onClick={async () => {
                    setBatchImporting(true);
                    try {
                      await api.post('/expenses/batch/import', {
                        batchId,
                        selectedIndexes: Array.from(batchSelectedIndexes),
                      });
                      queryClient.invalidateQueries({ queryKey: ['expenses'] });
                      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                      setBatchOpen(false);
                      setBatchStep(1);
                      setBatchId(null);
                      setBatchItems([]);
                      setPreviewItems([]);
                    } catch (err) {
                      console.error(err);
                      alert('Import failed. Some rows may already exist or the batch expired.');
                    } finally {
                      setBatchImporting(false);
                    }
                  }}
                >
                  {batchImporting ? 'Importing…' : `Import ${batchSelectedIndexes.size} selected`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <FilePreviewDialog
        open={!!previewExpenseId}
        onOpenChange={(open) => !open && setPreviewExpenseId(null)}
        type="expense"
        id={previewExpenseId}
        title="Receipt / Invoice Preview"
      />
    </div>
  );
}