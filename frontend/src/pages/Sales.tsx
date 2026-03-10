import { useState, useEffect } from 'react';
import { useSales } from '../hooks/useSales';
import { useCustomers } from '../hooks/useContacts';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Edit, Eye, Download, FileImage, FileText, Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FilePreviewDialog } from '@/components/FilePreviewDialog';
import { api } from '../lib/api';
import { useQueryClient } from '@tanstack/react-query';

type LineItemRow = { description: string; quantity: number; unitPrice: string; vatRate: number };

const defaultLineRow = (): LineItemRow => ({ description: '', quantity: 1, unitPrice: '', vatRate: 21 });

function parseSaleLines(sale: any): LineItemRow[] {
  const lines = sale?.lines;
  if (!Array.isArray(lines) || lines.length === 0) return [defaultLineRow()];
  return lines.map((l: any) => ({
    description: l.description ?? '',
    quantity: 1,
    unitPrice: String(l.amount ?? ''),
    vatRate: Number(l.vatRate) || 21,
  }));
}

export default function Sales() {
  const queryClient = useQueryClient();
  const { data: sales, isLoading } = useSales();
  const { data: customers } = useCustomers();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [dialogMode, setDialogMode] = useState<'view' | 'edit' | null>(null);
  const [previewSaleId, setPreviewSaleId] = useState<string | null>(null);
  const [pdfPreviewSaleId, setPdfPreviewSaleId] = useState<string | null>(null);
  const [editLineItems, setEditLineItems] = useState<LineItemRow[]>([defaultLineRow()]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [billToName, setBillToName] = useState('');
  const [billToEmail, setBillToEmail] = useState('');
  const [billToAddress, setBillToAddress] = useState('');

  useEffect(() => {
    if (dialogMode === 'edit' && selectedSale) {
      setEditLineItems(selectedSale.id ? parseSaleLines(selectedSale) : [defaultLineRow()]);
      setSelectedCustomerId(selectedSale.customerId ?? '');
      setBillToName(selectedSale.customer ?? '');
      setBillToEmail(selectedSale.customerEmail ?? '');
      setBillToAddress(selectedSale.customerAddress ?? '');
    }
  }, [dialogMode, selectedSale]);

  const filteredSales = sales?.filter((sale: any) => {
    const matchesSearch = (sale.customer || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (sale.invoiceNo || '').toLowerCase().includes(searchTerm.toLowerCase());
    const isPaid = !!sale.reconciled;
    if (filterStatus === 'open' && isPaid) return false;
    if (filterStatus === 'paid' && !isPaid) return false;
    return matchesSearch;
  }) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Sales & Invoices</h2>
          <p className="text-muted-foreground">Manage your customer invoices.</p>
        </div>
        <Button onClick={() => {
          setSelectedSale({});
          setDialogMode('edit');
        }}>Create Invoice</Button>
      </div>

      <Card>
        <CardHeader className="py-4">
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <Input 
              placeholder="Search customer or invoice #..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
            <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val || 'all')}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Invoices</SelectItem>
                <SelectItem value="open">Unpaid (Open)</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-4 text-muted-foreground">
                      No invoices found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSales.map((sale: any) => (
                    <TableRow key={sale.id}>
                      <TableCell>{new Date(sale.issueDate).toLocaleDateString()}</TableCell>
                      <TableCell className="font-medium">{sale.invoiceNo}</TableCell>
                      <TableCell>{sale.customer}</TableCell>
                      <TableCell className="text-right">€{Number(sale.subtotal).toFixed(2)}</TableCell>
                      <TableCell className="text-right">€{Number(sale.total).toFixed(2)}</TableCell>
                      <TableCell>
                        {sale.reconciled ? (
                          <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-emerald-50 text-emerald-700">
                            Paid
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-amber-50 text-amber-700">
                            Open
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => {
                              setSelectedSale(sale);
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
                              setSelectedSale(sale);
                              setDialogMode('edit');
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {sale.fileName && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-blue-600 hover:text-blue-700"
                              onClick={() => setPreviewSaleId(sale.id)}
                              title="Preview attachment"
                            >
                              <FileImage className="h-4 w-4" />
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-blue-600 hover:text-blue-700"
                            onClick={() => setPdfPreviewSaleId(sale.id)}
                            title="Preview PDF invoice"
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-blue-600 hover:text-blue-700"
                            onClick={() => window.open(`/api/sales/${sale.id}/pdf?download=1`, '_blank')}
                            title="Download PDF invoice"
                          >
                            <Download className="h-4 w-4" />
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
        <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'view' ? 'Invoice Details' : selectedSale?.id ? 'Edit Invoice' : 'Create Invoice'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {dialogMode === 'view' && selectedSale && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Invoice No</div>
                    <div className="font-medium">{selectedSale.invoiceNo}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Issue Date</div>
                    <div>{new Date(selectedSale.issueDate).toLocaleDateString()}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Customer</div>
                    <div>{selectedSale.customer}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Total</div>
                    <div className="font-bold">€{Number(selectedSale.total).toFixed(2)}</div>
                  </div>
                  <div className="col-span-2 border-t pt-4 mt-2">
                    <div className="text-sm font-medium text-muted-foreground mb-2">Line Items</div>
                    {selectedSale.lines?.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">VAT %</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedSale.lines.map((line: any, i: number) => (
                            <TableRow key={i}>
                              <TableCell>{line.description || '-'}</TableCell>
                              <TableCell className="text-right">€{Number(line.amount ?? 0).toFixed(2)}</TableCell>
                              <TableCell className="text-right">{Number(line.vatRate ?? 0)}%</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-sm text-muted-foreground">No line items</div>
                    )}
                  </div>
                  {selectedSale.pdfPath && (
                    <div className="col-span-2 mt-4">
                      <Button variant="outline" className="w-full" onClick={() => window.open(`/api/sales/${selectedSale.id}/pdf`, '_blank')}>
                        <Download className="mr-2 h-4 w-4" /> Download PDF Invoice
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
            {dialogMode === 'edit' && (
              <form onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const lines = editLineItems
                  .filter((row) => row.description.trim() && row.unitPrice !== '' && Number(row.quantity) > 0)
                  .map((row) => ({
                    description: row.description.trim(),
                    amount: Number(row.quantity) * Number(row.unitPrice),
                    vatRate: Number(row.vatRate) || 0,
                  }));
                if (lines.length === 0) {
                  alert('Add at least one line item with description and unit price.');
                  return;
                }
                const payload = {
                  customer: billToName.trim(),
                  customerEmail: billToEmail.trim() || undefined,
                  customerAddress: billToAddress.trim() || undefined,
                  customerId: selectedCustomerId || undefined,
                  issueDate: formData.get('issueDate') as string,
                  dueDate: (formData.get('dueDate') as string) || undefined,
                  lines: JSON.stringify(lines),
                };
                try {
                  if (selectedSale?.id) {
                    await api.put(`/sales/${selectedSale.id}`, payload);
                  } else {
                    await api.post('/sales', payload);
                  }
                  queryClient.invalidateQueries({ queryKey: ['sales'] });
                  setDialogMode(null);
                } catch (error) {
                  console.error(error);
                  alert('Failed to save invoice');
                }
              }} className="space-y-4">
                <div className="space-y-3">
                  <div className="text-sm font-medium text-muted-foreground">Bill to</div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Customer</label>
                    <Select
                      value={selectedCustomerId || '_new_'}
                      onValueChange={(val) => {
                        const id = val === '_new_' || val == null ? '' : val;
                        setSelectedCustomerId(id);
                        const c = customers?.find((x) => x.id === id);
                        if (c) {
                          setBillToName(c.name);
                          setBillToEmail(c.email || '');
                          setBillToAddress(c.address || '');
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select or enter below" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_new_">— Enter manually —</SelectItem>
                        {(customers ?? []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Name</label>
                      <Input value={billToName} onChange={(e) => setBillToName(e.target.value)} required placeholder="Customer or company name" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Email</label>
                      <Input type="email" value={billToEmail} onChange={(e) => setBillToEmail(e.target.value)} placeholder="billing@example.com" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Address</label>
                    <Input value={billToAddress} onChange={(e) => setBillToAddress(e.target.value)} placeholder="Street, city, postal code" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Issue Date</label>
                    <Input type="date" name="issueDate" defaultValue={selectedSale?.issueDate ? new Date(selectedSale.issueDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]} required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Due Date</label>
                    <Input type="date" name="dueDate" defaultValue={selectedSale?.dueDate ? new Date(selectedSale.dueDate).toISOString().split('T')[0] : ''} />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Line items</div>
                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[32px]"></TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="w-[80px]">Qty</TableHead>
                          <TableHead className="w-[100px]">Unit price</TableHead>
                          <TableHead className="w-[80px]">VAT %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {editLineItems.map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="p-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setEditLineItems((prev) => prev.filter((_, j) => j !== i))}
                                disabled={editLineItems.length <= 1}
                              >
                                <Trash2 className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </TableCell>
                            <TableCell className="p-1">
                              <Input
                                className="h-8"
                                value={row.description}
                                onChange={(e) => setEditLineItems((prev) => prev.map((r, j) => (j === i ? { ...r, description: e.target.value } : r)))}
                                placeholder="Item description"
                              />
                            </TableCell>
                            <TableCell className="p-1">
                              <Input
                                type="number"
                                min={0}
                                step={1}
                                className="h-8"
                                value={row.quantity}
                                onChange={(e) => setEditLineItems((prev) => prev.map((r, j) => (j === i ? { ...r, quantity: Number(e.target.value) || 0 } : r)))}
                              />
                            </TableCell>
                            <TableCell className="p-1">
                              <Input
                                type="number"
                                min={0}
                                step={0.01}
                                className="h-8"
                                value={row.unitPrice}
                                onChange={(e) => setEditLineItems((prev) => prev.map((r, j) => (j === i ? { ...r, unitPrice: e.target.value } : r)))}
                                placeholder="0.00"
                              />
                            </TableCell>
                            <TableCell className="p-1">
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                step={0.01}
                                className="h-8"
                                value={row.vatRate}
                                onChange={(e) => setEditLineItems((prev) => prev.map((r, j) => (j === i ? { ...r, vatRate: Number(e.target.value) || 0 } : r)))}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-1"
                    onClick={() => setEditLineItems((prev) => [...prev, defaultLineRow()])}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add line
                  </Button>
                </div>
                <div className="flex justify-end pt-4">
                  <Button type="submit">Save Invoice</Button>
                </div>
              </form>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <FilePreviewDialog
        open={!!previewSaleId}
        onOpenChange={(open: boolean) => !open && setPreviewSaleId(null)}
        type="sale"
        id={previewSaleId}
        title="Invoice Attachment Preview"
      />

      <Dialog open={!!pdfPreviewSaleId} onOpenChange={(open) => !open && setPdfPreviewSaleId(null)}>
        <DialogContent className="sm:max-w-[90vw] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Generated Invoice (PDF)</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-[70vh] flex flex-col gap-4">
            {pdfPreviewSaleId && (
              <>
                <iframe
                  title="Invoice PDF"
                  src={`/api/sales/${pdfPreviewSaleId}/pdf`}
                  className="flex-1 w-full min-h-[65vh] border rounded bg-muted/30"
                />
                <div className="flex justify-end border-t pt-4">
                  <a href={`/api/sales/${pdfPreviewSaleId}/pdf?download=1`} download target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm">
                      <Download className="mr-2 h-4 w-4" /> Download PDF
                    </Button>
                  </a>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}