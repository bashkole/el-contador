import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useInvoiceConfig, useSaveInvoiceConfig, useIntegrationsSettings, useSaveIntegrationsSettings, useUsers, useCreateUser, useDeleteUser, useApprovalSettings, useSaveApprovalSettings, useSaveExpenseCategory, useDeleteExpenseCategory } from '../hooks/useSettings';
import { useExpenseCategories } from '../hooks/useExpenses';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { Trash2, Edit, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export default function Settings() {
  const { user } = useAuth();
  
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">Manage your application configuration and users.</p>
      </div>

      <Tabs defaultValue="invoice" className="w-full grid grid-cols-1 grid-rows-[auto_1fr] gap-4 [&>*]:min-w-0">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 h-auto p-1 bg-muted/50 rounded-lg row-start-1">
          <TabsTrigger value="invoice" className="py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">Invoice</TabsTrigger>
          <TabsTrigger value="integrations" className="py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">Integrations</TabsTrigger>
          <TabsTrigger value="users" className="py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">Users</TabsTrigger>
          <TabsTrigger value="approval" className="py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">Approval</TabsTrigger>
          <TabsTrigger value="categories" className="py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">Categories</TabsTrigger>
        </TabsList>
        <div className="row-start-2 min-h-0">
          <TabsContent value="invoice" className="m-0">
            <InvoiceSettings />
          </TabsContent>
          <TabsContent value="integrations" className="m-0">
            <IntegrationsSettings />
          </TabsContent>
          <TabsContent value="users" className="m-0">
            <UsersSettings currentUser={user} />
          </TabsContent>
          <TabsContent value="approval" className="m-0">
            <ApprovalSettings />
          </TabsContent>
          <TabsContent value="categories" className="m-0">
            <CategoriesSettings />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function InvoiceSettings() {
  const { data: config, isLoading } = useInvoiceConfig();
  const saveConfig = useSaveInvoiceConfig();
  
  const [formData, setFormData] = useState({
    companyName: '',
    tagline: '',
    email: '',
    vatNumber: '',
    companyNumber: '',
    address: '',
    footer: '',
    geminiApiKey: '',
    geminiModel: ''
  });

  useEffect(() => {
    if (config) {
      setFormData({
        companyName: config.companyName || '',
        tagline: config.tagline || '',
        email: config.email || '',
        vatNumber: config.vatNumber || '',
        companyNumber: config.companyNumber || '',
        address: config.address || '',
        footer: config.footer || '',
        geminiApiKey: config.geminiApiKey || '',
        geminiModel: config.geminiModel || 'gemini-2.0-flash'
      });
    }
  }, [config]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveConfig.mutateAsync(formData);
      toast.success('Invoice settings saved successfully');
    } catch (err) {
      toast.error('Failed to save settings');
    }
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoice / Company Details</CardTitle>
        <CardDescription>Used on every PDF invoice: header, footer, VAT number, company number, address.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Company Name</Label>
              <Input value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Tagline (under name)</Label>
              <Input value={formData.tagline} onChange={e => setFormData({...formData, tagline: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>VAT Number</Label>
              <Input value={formData.vatNumber} onChange={e => setFormData({...formData, vatNumber: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Company Number (KvK)</Label>
              <Input value={formData.companyNumber} onChange={e => setFormData({...formData, companyNumber: e.target.value})} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Address (multiline)</Label>
            <Textarea rows={3} value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>Footer (multiline)</Label>
            <Textarea rows={4} value={formData.footer} onChange={e => setFormData({...formData, footer: e.target.value})} />
          </div>
          
          <div className="pt-6 border-t space-y-4">
            <div>
              <h3 className="text-lg font-medium">Receipt data extraction (Gemini)</h3>
              <p className="text-sm text-muted-foreground">Used when extracting data from receipt or invoice PDFs. Get an API key from Google AI Studio.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Gemini API Key</Label>
                <Input type="password" value={formData.geminiApiKey} onChange={e => setFormData({...formData, geminiApiKey: e.target.value})} placeholder="Leave blank to keep current" />
              </div>
              <div className="space-y-2">
                <Label>Model</Label>
                <Input value={formData.geminiModel} onChange={e => setFormData({...formData, geminiModel: e.target.value})} />
              </div>
            </div>
          </div>
          
          <Button type="submit" disabled={saveConfig.isPending}>
            {saveConfig.isPending ? 'Saving...' : 'Save settings'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function IntegrationsSettings() {
  const { data: settings, isLoading } = useIntegrationsSettings();
  const saveSettings = useSaveIntegrationsSettings();

  const [formData, setFormData] = useState({
    stripeEnabled: false,
    stripeSecretKey: '',
    stripeWebhookSecret: '',
    paddleEnabled: false,
    paddleApiKey: '',
    paddleWebhookSecret: ''
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        stripeEnabled: settings.stripeEnabled || false,
        stripeSecretKey: settings.stripeSecretKey || '',
        stripeWebhookSecret: settings.stripeWebhookSecret || '',
        paddleEnabled: settings.paddleEnabled || false,
        paddleApiKey: settings.paddleApiKey || '',
        paddleWebhookSecret: settings.paddleWebhookSecret || ''
      });
    }
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveSettings.mutateAsync(formData);
      toast.success('Integrations saved successfully');
    } catch (err) {
      toast.error('Failed to save integrations');
    }
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Integrations</CardTitle>
        <CardDescription>Connect external services to automatically sync transactions.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="p-4 border rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-lg">Stripe</h3>
                <p className="text-sm text-muted-foreground">Sync Stripe payments as sales invoices.</p>
              </div>
              <Switch checked={formData.stripeEnabled} onCheckedChange={c => setFormData({...formData, stripeEnabled: c})} />
            </div>
            {formData.stripeEnabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Secret Key</Label>
                  <Input type="password" value={formData.stripeSecretKey} onChange={e => setFormData({...formData, stripeSecretKey: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Webhook Secret</Label>
                  <Input type="password" value={formData.stripeWebhookSecret} onChange={e => setFormData({...formData, stripeWebhookSecret: e.target.value})} />
                </div>
                <div className="col-span-full">
                  <p className="text-xs text-muted-foreground">Webhook URL: <code className="bg-muted px-1 py-0.5 rounded">/api/webhooks/stripe</code></p>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-lg">Paddle</h3>
                <p className="text-sm text-muted-foreground">Sync Paddle transactions as sales invoices.</p>
              </div>
              <Switch checked={formData.paddleEnabled} onCheckedChange={c => setFormData({...formData, paddleEnabled: c})} />
            </div>
            {formData.paddleEnabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input type="password" value={formData.paddleApiKey} onChange={e => setFormData({...formData, paddleApiKey: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Webhook Secret</Label>
                  <Input type="password" value={formData.paddleWebhookSecret} onChange={e => setFormData({...formData, paddleWebhookSecret: e.target.value})} />
                </div>
                <div className="col-span-full">
                  <p className="text-xs text-muted-foreground">Webhook URL: <code className="bg-muted px-1 py-0.5 rounded">/api/webhooks/paddle</code></p>
                </div>
              </div>
            )}
          </div>
          
          <Button type="submit" disabled={saveSettings.isPending}>
            {saveSettings.isPending ? 'Saving...' : 'Save integrations'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function UsersSettings({ currentUser }: { currentUser: any }) {
  const { data: users, isLoading } = useUsers();
  const deleteUser = useDeleteUser();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  if (currentUser?.role !== 'admin') {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">You do not have permission to manage users.</p>
        </CardContent>
      </Card>
    );
  }

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this user?')) {
      try {
        await deleteUser.mutateAsync(id);
        toast.success('User deleted');
      } catch (err) {
        toast.error('Failed to delete user');
      }
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row justify-between items-start">
        <div>
          <CardTitle>Users</CardTitle>
          <CardDescription>Create and manage users and their roles.</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2">
            <Plus className="w-4 h-4 mr-2" /> Create User
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create new user</DialogTitle>
            </DialogHeader>
            <CreateUserForm onSuccess={() => setIsDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? <div>Loading...</div> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Hierarchy Level</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users?.map((u: any) => (
                <TableRow key={u.id}>
                  <TableCell>{u.email}</TableCell>
                  <TableCell className="capitalize">{u.role}</TableCell>
                  <TableCell>{u.hierarchy_level}</TableCell>
                  <TableCell>
                    {u.id !== currentUser.userId && (
                      <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(u.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function CreateUserForm({ onSuccess }: { onSuccess: () => void }) {
  const createUser = useCreateUser();
  const [formData, setFormData] = useState({ email: '', password: '', role: 'user', hierarchy_level: 1 });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUser.mutateAsync(formData);
      toast.success('User created');
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create user');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Email</Label>
        <Input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
      </div>
      <div className="space-y-2">
        <Label>Password</Label>
        <Input type="password" required minLength={8} value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
      </div>
      <div className="space-y-2">
        <Label>Role</Label>
        <Select value={formData.role} onValueChange={v => setFormData({...formData, role: v || "user"})}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Hierarchy Level</Label>
        <Select value={formData.hierarchy_level.toString()} onValueChange={v => setFormData({...formData, hierarchy_level: parseInt(v || "0")})}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="0">0 - Top (no approval)</SelectItem>
            <SelectItem value="1">1 - First level</SelectItem>
            <SelectItem value="2">2 - Second level</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="w-full" disabled={createUser.isPending}>
        {createUser.isPending ? 'Creating...' : 'Create User'}
      </Button>
    </form>
  );
}

function ApprovalSettings() {
  const { data: settings, isLoading } = useApprovalSettings();
  const saveSettings = useSaveApprovalSettings();
  const { data: users } = useUsers();

  const [enabled, setEnabled] = useState(false);
  const [approvers, setApprovers] = useState<any[]>([]);

  useEffect(() => {
    if (settings) {
      setEnabled(!!settings.enabled);
      setApprovers(Array.isArray(settings.approvers) ? settings.approvers : []);
    }
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveSettings.mutateAsync({ enabled, approvers });
      toast.success('Approval settings saved');
    } catch (err) {
      toast.error('Failed to save approval settings');
    }
  };

  const addApprover = () => {
    if (approvers.length >= 5) return;
    setApprovers([...approvers, { userId: '', level: 0 }]);
  };

  const updateApprover = (index: number, field: string, value: any) => {
    const updated = [...approvers];
    updated[index] = { ...updated[index], [field]: value };
    setApprovers(updated);
  };

  const removeApprover = (index: number) => {
    const updated = [...approvers];
    updated.splice(index, 1);
    setApprovers(updated);
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Expense Approval</CardTitle>
        <CardDescription>When enabled, expenses submitted by non-admin users require approval.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex items-center gap-3">
            <Switch checked={enabled} onCheckedChange={setEnabled} id="approval-enabled" />
            <Label htmlFor="approval-enabled">Enable expense approval for non-admin users</Label>
          </div>

          <div className="space-y-4">
            <h3 className="font-medium">Approvers</h3>
            {approvers.map((approver, index) => (
              <div key={index} className="flex items-center gap-4 bg-muted/50 p-3 rounded-md">
                <div className="flex-1 space-y-2">
                  <Label>User</Label>
                  <Select value={approver.userId ? String(approver.userId) : ""} onValueChange={v => updateApprover(index, 'userId', parseInt(v || "0"))}>
                    <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                    <SelectContent>
                      {users?.map((u: any) => (
                        <SelectItem key={u.id} value={u.id.toString()}>{u.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 space-y-2">
                  <Label>Level</Label>
                  <Select value={approver.level != null ? String(approver.level) : ""} onValueChange={v => updateApprover(index, 'level', parseInt(v || "0"))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0 - Final Approval</SelectItem>
                      <SelectItem value="1">1 - First Line</SelectItem>
                      <SelectItem value="2">2 - Second Line</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" variant="ghost" size="icon" className="mt-8 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => removeApprover(index)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            
            {approvers.length < 5 && (
              <Button type="button" variant="outline" onClick={addApprover} size="sm">
                <Plus className="w-4 h-4 mr-2" /> Add Approver
              </Button>
            )}
          </div>
          
          <Button type="submit" disabled={saveSettings.isPending}>
            {saveSettings.isPending ? 'Saving...' : 'Save approval settings'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function CategoriesSettings() {
  const { data: categories, isLoading } = useExpenseCategories();
  const deleteCategory = useDeleteExpenseCategory();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this category?')) {
      try {
        await deleteCategory.mutateAsync(id);
        toast.success('Category deleted');
      } catch (err) {
        toast.error('Failed to delete category');
      }
    }
  };

  const openEdit = (cat: any) => {
    setEditingCategory(cat);
    setIsDialogOpen(true);
  };

  const openCreate = () => {
    setEditingCategory(null);
    setIsDialogOpen(true);
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <Card>
      <CardHeader className="flex flex-row justify-between items-start">
        <div>
          <CardTitle>Expense Categories</CardTitle>
          <CardDescription>Categories used for expenses and PnL reporting.</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> Add Category
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingCategory ? 'Edit Category' : 'Add Category'}</DialogTitle>
            </DialogHeader>
            <CategoryForm initialData={editingCategory} onSuccess={() => setIsDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>VAT %</TableHead>
              <TableHead>Account Code</TableHead>
              <TableHead>Sort Order</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories?.sort((a:any, b:any) => (a.sortOrder || 0) - (b.sortOrder || 0)).map((c: any) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{c.description || '-'}</TableCell>
                <TableCell>{c.defaultVatRate}%</TableCell>
                <TableCell>{c.accountCode || '-'}</TableCell>
                <TableCell>{c.sortOrder}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(c.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CategoryForm({ initialData, onSuccess }: { initialData: any, onSuccess: () => void }) {
  const saveCategory = useSaveExpenseCategory();
  const [formData, setFormData] = useState({
    id: initialData?.id || '',
    name: initialData?.name || '',
    description: initialData?.description || '',
    defaultVatRate: initialData?.defaultVatRate || 21,
    accountCode: initialData?.accountCode || '',
    sortOrder: initialData?.sortOrder || 0
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveCategory.mutateAsync(formData);
      toast.success(initialData ? 'Category updated' : 'Category created');
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save category');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Name *</Label>
        <Input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Office supplies" />
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Input value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Optional" />
      </div>
      <div className="space-y-2">
        <Label>Default VAT %</Label>
        <Input type="number" step="0.01" min="0" max="100" value={formData.defaultVatRate} onChange={e => setFormData({...formData, defaultVatRate: parseFloat(e.target.value)})} />
      </div>
      <div className="space-y-2">
        <Label>Account Code</Label>
        <Input value={formData.accountCode} onChange={e => setFormData({...formData, accountCode: e.target.value})} placeholder="e.g. 6100" />
      </div>
      <div className="space-y-2">
        <Label>Sort Order</Label>
        <Input type="number" min="0" value={formData.sortOrder} onChange={e => setFormData({...formData, sortOrder: parseInt(e.target.value)})} />
      </div>
      <Button type="submit" className="w-full" disabled={saveCategory.isPending}>
        {saveCategory.isPending ? 'Saving...' : 'Save Category'}
      </Button>
    </form>
  );
}
