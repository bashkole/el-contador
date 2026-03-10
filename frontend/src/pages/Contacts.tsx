import { useState, useEffect } from 'react';
import { useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer, type Customer } from '../hooks/useContacts';
import { useSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier, type Supplier } from '../hooks/useContacts';
import { usePayees, useCreatePayee, useUpdatePayee, useDeletePayee, type Payee } from '../hooks/useContacts';
import { useExpenseCategories as useExpenseCategoriesHook } from '../hooks/useExpenses';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pencil, Trash2 } from 'lucide-react';

type ContactType = 'client' | 'supplier' | 'payee';

const emptyContact = {
  name: '',
  email: '',
  address: '',
  phone: '',
  vatNumber: '',
  companyNumber: '',
  accountNumber: '',
  notes: '',
};

export default function Contacts() {
  const [activeTab, setActiveTab] = useState<ContactType>('client');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | Supplier | Payee | null>(null);
  const [form, setForm] = useState(emptyContact);
  const [supplierCategoryId, setSupplierCategoryId] = useState<string | null>(null);

  const { data: customers, isLoading: loadingCustomers } = useCustomers();
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();

  const { data: suppliers, isLoading: loadingSuppliers } = useSuppliers();
  const { data: categories } = useExpenseCategoriesHook();
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const deleteSupplier = useDeleteSupplier();

  const { data: payees, isLoading: loadingPayees } = usePayees();
  const createPayee = useCreatePayee();
  const updatePayee = useUpdatePayee();
  const deletePayee = useDeletePayee();

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name ?? '',
        email: editing.email ?? '',
        address: editing.address ?? '',
        phone: editing.phone ?? '',
        vatNumber: editing.vatNumber ?? '',
        companyNumber: editing.companyNumber ?? '',
        accountNumber: editing.accountNumber ?? '',
        notes: editing.notes ?? '',
      });
      setSupplierCategoryId((editing as Supplier).categoryId ?? null);
    } else {
      setForm(emptyContact);
      setSupplierCategoryId(null);
    }
  }, [editing]);

  const handleOpenCreate = () => {
    setEditing(null);
    setForm(emptyContact);
    setSupplierCategoryId(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (row: Customer | Supplier | Payee) => {
    setEditing(row);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditing(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (activeTab === 'client') {
        if (editing?.id) {
          await updateCustomer.mutateAsync({ id: editing.id, ...form });
        } else {
          await createCustomer.mutateAsync(form);
        }
      } else if (activeTab === 'supplier') {
        const body = { ...form, categoryId: supplierCategoryId || undefined };
        if (editing?.id) {
          await updateSupplier.mutateAsync({ id: editing.id, ...body });
        } else {
          await createSupplier.mutateAsync(body);
        }
      } else {
        if (editing?.id) {
          await updatePayee.mutateAsync({ id: editing.id, ...form });
        } else {
          await createPayee.mutateAsync(form);
        }
      }
      handleCloseDialog();
    } catch (err) {
      console.error(err);
      alert('Failed to save contact');
    }
  };

  const handleDelete = async (type: ContactType, id: string) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    try {
      if (type === 'client') await deleteCustomer.mutateAsync(id);
      else if (type === 'supplier') await deleteSupplier.mutateAsync(id);
      else await deletePayee.mutateAsync(id);
    } catch (err) {
      console.error(err);
      alert('Failed to delete contact');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Contacts</h2>
        <p className="text-muted-foreground">Manage clients, suppliers and payees. Add account numbers for bank or ledger reference.</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ContactType)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="client">Clients</TabsTrigger>
          <TabsTrigger value="supplier">Suppliers</TabsTrigger>
          <TabsTrigger value="payee">Payees</TabsTrigger>
        </TabsList>

        <TabsContent value="client" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <span className="text-sm font-medium">Customers you invoice</span>
              <Button onClick={handleOpenCreate}>Add client</Button>
            </CardHeader>
            <CardContent>
              {loadingCustomers ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Account number</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(customers ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No clients yet. Add one to get started.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (customers ?? []).map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell>{row.accountNumber || '-'}</TableCell>
                          <TableCell>{row.email || '-'}</TableCell>
                          <TableCell>{row.phone || '-'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEdit(row)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete('client', row.id)}>
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
        </TabsContent>

        <TabsContent value="supplier" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <span className="text-sm font-medium">Vendors you purchase from</span>
              <Button onClick={handleOpenCreate}>Add supplier</Button>
            </CardHeader>
            <CardContent>
              {loadingSuppliers ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Account number</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(suppliers ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No suppliers yet. Add one to get started.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (suppliers ?? []).map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell>{row.accountNumber || '-'}</TableCell>
                          <TableCell>{(row as Supplier).categoryName || '-'}</TableCell>
                          <TableCell>{row.email || '-'}</TableCell>
                          <TableCell>{row.phone || '-'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEdit(row)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete('supplier', row.id)}>
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
        </TabsContent>

        <TabsContent value="payee" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <span className="text-sm font-medium">Payees (freelancers, refund recipients, etc.)</span>
              <Button onClick={handleOpenCreate}>Add payee</Button>
            </CardHeader>
            <CardContent>
              {loadingPayees ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Account number</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(payees ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No payees yet. Add one to get started.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (payees ?? []).map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell>{row.accountNumber || '-'}</TableCell>
                          <TableCell>{row.email || '-'}</TableCell>
                          <TableCell>{row.phone || '-'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEdit(row)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete('payee', row.id)}>
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
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Edit contact' : activeTab === 'client' ? 'Add client' : activeTab === 'supplier' ? 'Add supplier' : 'Add payee'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Phone</label>
                <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">VAT number</label>
                <Input value={form.vatNumber} onChange={(e) => setForm((p) => ({ ...p, vatNumber: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Company number</label>
                <Input value={form.companyNumber} onChange={(e) => setForm((p) => ({ ...p, companyNumber: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Account number</label>
              <Input
                value={form.accountNumber}
                onChange={(e) => setForm((p) => ({ ...p, accountNumber: e.target.value }))}
                placeholder="Bank or ledger account reference"
              />
            </div>
            {activeTab === 'supplier' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Default category</label>
                <Select value={supplierCategoryId ?? ''} onValueChange={(v) => setSupplierCategoryId(v || null)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {(categories ?? []).sort((a: { sortOrder?: number }, b: { sortOrder?: number }) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((cat: { id: string; name: string }) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">Address</label>
              <Input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Notes</label>
              <Input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Cancel
              </Button>
              <Button type="submit">
                {editing ? 'Save' : 'Add'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
