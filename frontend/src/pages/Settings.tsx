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
import { useQueryClient } from '@tanstack/react-query';
import { useInvoiceConfig, useSaveInvoiceConfig, useUploadLogo, useIntegrationsSettings, useSaveIntegrationsSettings, useUsers, useCreateUser, useDeleteUser, useApprovalSettings, useSaveApprovalSettings, useAccountGroups, useAccountsAll, useSaveAccount, useDeleteAccount } from '../hooks/useSettings';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { Trash2, Edit, Plus, BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
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
          <TabsTrigger value="integrations" className="py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">Payments</TabsTrigger>
          <TabsTrigger value="users" className="py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">Users</TabsTrigger>
          <TabsTrigger value="approval" className="py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">Approval</TabsTrigger>
          <TabsTrigger value="accounts" className="py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">Chart of accounts</TabsTrigger>
        </TabsList>
        <div className="row-start-2 min-h-0">
          <TabsContent value="invoice" className="m-0 space-y-6">
            <InvoiceSettings />
            <FiscalSettings />
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
          <TabsContent value="accounts" className="m-0">
            <ChartOfAccountsSettings />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function InvoiceSettings() {
  const { data: config, isLoading } = useInvoiceConfig();
  const saveConfig = useSaveInvoiceConfig();
  const uploadLogo = useUploadLogo();
  
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
        geminiApiKey: '', // Never loaded; API only returns geminiApiKeySet
        geminiModel: config.geminiModel || 'gemini-2.0-flash'
      });
    }
  }, [config]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { geminiApiKey, ...rest } = formData;
      const payload = geminiApiKey ? { ...rest, geminiApiKey } : rest;
      await saveConfig.mutateAsync(payload);
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
          <div className="p-4 border rounded-lg space-y-3">
            <h3 className="font-medium">Company logo</h3>
            <p className="text-sm text-muted-foreground">Shown in the header of PDF invoices and in the app.</p>
            <div className="flex flex-wrap items-center gap-4">
              <div className="min-w-[80px] min-h-[50px] border border-border rounded-lg flex items-center justify-center bg-muted/50">
                {config?.logoPath ? (
                  <img src={`/api/invoice-config/logo?t=${config.logoPath}`} alt="" className="max-w-[80px] max-h-[50px] object-contain" />
                ) : (
                  <span className="text-sm text-muted-foreground">No logo</span>
                )}
              </div>
              <div className="space-y-2">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  className="block text-sm text-muted-foreground file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      await uploadLogo.mutateAsync(file);
                      toast.success('Logo uploaded');
                      e.target.value = '';
                    } catch {
                      toast.error('Failed to upload logo');
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">PNG or JPEG, max 2 MB</p>
              </div>
            </div>
          </div>
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
                <Input
                  type="password"
                  value={formData.geminiApiKey}
                  onChange={e => setFormData({ ...formData, geminiApiKey: e.target.value })}
                  placeholder={config?.geminiApiKeySet ? '•••••••• (leave blank to keep)' : 'Paste your Gemini API key'}
                  autoComplete="off"
                />
                {config?.geminiApiKeySet && (
                  <p className="text-xs text-muted-foreground">API key is set. Enter a new value to replace it, or leave blank to keep.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Model</Label>
                <Input value={formData.geminiModel} onChange={e => setFormData({ ...formData, geminiModel: e.target.value })} placeholder="e.g. gemini-2.0-flash" />
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

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function FiscalSettings() {
  const { data: config, isLoading } = useInvoiceConfig();
  const saveConfig = useSaveInvoiceConfig();
  const queryClient = useQueryClient();

  const [fiscalYearEnabled, setFiscalYearEnabled] = useState(false);
  const [fiscalYearStartMonth, setFiscalYearStartMonth] = useState(1);
  const [fiscalYearStartDay, setFiscalYearStartDay] = useState(1);
  const [fiscalStartInput, setFiscalStartInput] = useState('01/01');

  useEffect(() => {
    if (config) {
      setFiscalYearEnabled(Boolean(config.fiscalYearEnabled));
      const month = Math.min(12, Math.max(1, Number(config.fiscalYearStartMonth) || 1));
      const day = Math.min(31, Math.max(1, Number(config.fiscalYearStartDay) || 1));
      setFiscalYearStartMonth(month);
      setFiscalYearStartDay(day);
      setFiscalStartInput(`${pad2(month)}/${pad2(day)}`);
    }
  }, [config]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveConfig.mutateAsync({
        fiscalYearEnabled,
        fiscalYearStartMonth,
        fiscalYearStartDay,
      });
      queryClient.invalidateQueries({ queryKey: ['account-ledger'] });
      queryClient.invalidateQueries({ queryKey: ['vat'] });
      toast.success('Fiscal year settings saved');
    } catch (err) {
      toast.error('Failed to save fiscal settings');
    }
  };

  const handleFiscalStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 4);
    const formatted = raw.length <= 2 ? raw : raw.slice(0, 2) + '/' + raw.slice(2);
    setFiscalStartInput(formatted);
    if (raw.length >= 2) {
      const month = Math.min(12, Math.max(1, parseInt(raw.slice(0, 2), 10) || 1));
      setFiscalYearStartMonth(month);
    }
    if (raw.length === 4) {
      const day = Math.min(31, Math.max(1, parseInt(raw.slice(2, 4), 10) || 1));
      setFiscalYearStartDay(day);
    }
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fiscal year</CardTitle>
        <CardDescription>
          Default is calendar year (1 Jan - 31 Dec). With a custom start (e.g. 1 April), fiscal year can be adjusted to your needs for reports and financial start end dates.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-lg border p-4 bg-muted/30 space-y-4">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="fiscal-year-enabled"
                checked={fiscalYearEnabled}
                onChange={(e) => setFiscalYearEnabled(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-input"
              />
              <div className="flex-1 space-y-1">
                <Label htmlFor="fiscal-year-enabled" className="text-base font-medium cursor-pointer">
                  Use custom fiscal year
                </Label>
                <p className="text-sm text-muted-foreground">
                  When off, all periods use calendar year (1 Jan - 31 Dec). When on, set the first day of your fiscal year (e.g. 04/01 for UK).
                </p>
              </div>
            </div>
            <div className="space-y-1.5 pl-7">
              <Label htmlFor="fiscal-start-mmdd" className={!fiscalYearEnabled ? 'text-muted-foreground' : ''}>
                Set fiscal day start
              </Label>
              <Input
                id="fiscal-start-mmdd"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="set fiscal day start (mm/dd)"
                value={fiscalStartInput}
                onChange={handleFiscalStartChange}
                disabled={!fiscalYearEnabled}
                className="w-full max-w-xs font-mono"
                maxLength={5}
              />
            </div>
          </div>

          <Button type="submit" disabled={saveConfig.isPending}>
            {saveConfig.isPending ? 'Saving...' : 'Save fiscal settings'}
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
    paddleWebhookSecret: '',
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        stripeEnabled: Boolean(settings.stripeEnabled),
        stripeSecretKey: settings.stripeSecretKey || '',
        stripeWebhookSecret: settings.stripeWebhookSecret || '',
        paddleEnabled: Boolean(settings.paddleEnabled),
        paddleApiKey: settings.paddleApiKey || '',
        paddleWebhookSecret: settings.paddleWebhookSecret || '',
      });
    }
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveSettings.mutateAsync(formData);
      toast.success('Integrations saved');
    } catch (err) {
      toast.error('Failed to save integrations');
    }
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payments / Integrations</CardTitle>
        <CardDescription>Connect payment providers (e.g. Stripe, Paddle) to sync payments.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="p-4 border rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-lg">Stripe</h3>
                <p className="text-sm text-muted-foreground">Sync Stripe payments as sales.</p>
              </div>
              <Switch checked={formData.stripeEnabled} onCheckedChange={(c) => setFormData({ ...formData, stripeEnabled: c })} />
            </div>
            {formData.stripeEnabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Secret Key</Label>
                  <Input type="password" value={formData.stripeSecretKey} onChange={(e) => setFormData({ ...formData, stripeSecretKey: e.target.value })} placeholder="sk_..." />
                </div>
                <div className="space-y-2">
                  <Label>Webhook Secret</Label>
                  <Input type="password" value={formData.stripeWebhookSecret} onChange={(e) => setFormData({ ...formData, stripeWebhookSecret: e.target.value })} />
                </div>
              </div>
            )}
          </div>
          <div className="p-4 border rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-lg">Paddle</h3>
                <p className="text-sm text-muted-foreground">Sync Paddle payments as sales.</p>
              </div>
              <Switch checked={formData.paddleEnabled} onCheckedChange={(c) => setFormData({ ...formData, paddleEnabled: c })} />
            </div>
            {formData.paddleEnabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input type="password" value={formData.paddleApiKey} onChange={(e) => setFormData({ ...formData, paddleApiKey: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Webhook Secret</Label>
                  <Input type="password" value={formData.paddleWebhookSecret} onChange={(e) => setFormData({ ...formData, paddleWebhookSecret: e.target.value })} />
                </div>
              </div>
            )}
          </div>
          <Button type="submit" disabled={saveSettings.isPending}>
            {saveSettings.isPending ? 'Saving...' : 'Save'}
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

function ChartOfAccountsSettings() {
  const { data: groups, isLoading: groupsLoading } = useAccountGroups();
  const { data: accounts, isLoading: accountsLoading } = useAccountsAll();
  const deleteAccount = useDeleteAccount();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this account?')) {
      try {
        await deleteAccount.mutateAsync(id);
        toast.success('Account deleted');
      } catch (err: any) {
        toast.error(err.response?.data?.error || 'Failed to delete account');
      }
    }
  };

  const openEdit = (acc: any) => {
    setEditingAccount(acc);
    setIsDialogOpen(true);
  };

  const openCreate = (groupId?: string) => {
    setEditingAccount(groupId ? { accountGroupId: groupId } : null);
    setIsDialogOpen(true);
  };

  if (groupsLoading || accountsLoading) return <div>Loading...</div>;

  const accountsByGroup = (groups || []).reduce((acc: Record<string, any[]>, g: any) => {
    const gid = String(g.id);
    acc[g.id] = (accounts || []).filter((a: any) => String(a.accountGroupId) === gid).sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.code - b.code);
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader className="flex flex-row justify-between items-start">
        <div>
          <CardTitle>Chart of accounts</CardTitle>
          <CardDescription>Account groups and accounts for expenses, revenue, and reporting. Posting goes to journals.</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2" onClick={() => openCreate()}>
            <Plus className="w-4 h-4 mr-2" /> Add account
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingAccount?.id ? 'Edit account' : 'Add account'}</DialogTitle>
            </DialogHeader>
            <AccountForm groups={groups || []} initialData={editingAccount} onSuccess={() => setIsDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-6">
        {(groups || []).sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0)).map((g: any) => (
          <div key={g.id}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">{g.name} ({g.codeMin}-{g.codeMax})</h3>
              <Button variant="outline" size="sm" onClick={() => openCreate(g.id)}>Add account</Button>
            </div>
            <Table>
                <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-20">VAT %</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(accountsByGroup[g.id] || []).map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono">{a.code}</TableCell>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell className="text-muted-foreground">{a.description || '-'}</TableCell>
                    <TableCell>{a.defaultVatRate != null ? `${a.defaultVatRate}%` : '-'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Link to={`/accounts/${a.id}`} title="View ledger">
                          <Button variant="ghost" size="icon" type="button">
                            <BookOpen className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(a)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(a.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AccountForm({ groups, initialData, onSuccess }: { groups: any[]; initialData: any; onSuccess: () => void }) {
  const queryClient = useQueryClient();
  const saveAccount = useSaveAccount();
  const [formData, setFormData] = useState({
    id: initialData?.id || '',
    accountGroupId: initialData?.accountGroupId || (groups[0]?.id || ''),
    code: initialData?.code ?? '',
    name: initialData?.name || '',
    description: initialData?.description || '',
    defaultVatRate: initialData?.defaultVatRate != null ? initialData.defaultVatRate : '',
    sortOrder: initialData?.sortOrder ?? 0,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveAccount.mutateAsync({
        ...formData,
        defaultVatRate: formData.defaultVatRate === '' ? undefined : Number(formData.defaultVatRate),
      });
      await queryClient.refetchQueries({ queryKey: ['accounts', 'all'] });
      toast.success(initialData?.id ? 'Account updated' : 'Account created');
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save account');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Group *</Label>
        <Select value={formData.accountGroupId} onValueChange={v => setFormData({ ...formData, accountGroupId: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Select group">
              {formData.accountGroupId && (() => {
                const g = (groups || []).find((x: any) => x.id === formData.accountGroupId);
                return g ? `${g.name} (${g.codeMin}-${g.codeMax})` : null;
              })()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(groups || []).map((g: any) => (
              <SelectItem key={g.id} value={g.id}>{g.name} ({g.codeMin}-{g.codeMax})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Code *</Label>
        <Input type="number" required value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} placeholder="e.g. 450 (must be unique within group)" disabled={!!initialData?.id} />
        <p className="text-xs text-muted-foreground">Code must be unique. Pre-seeded codes (e.g. 400, 429, 800) are already in use.</p>
      </div>
      <div className="space-y-2">
        <Label>Name *</Label>
        <Input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Advertising & Marketing" />
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Input value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Optional" />
      </div>
      <div className="space-y-2">
        <Label>Default VAT %</Label>
        <Input type="number" step="0.01" min="0" max="100" value={formData.defaultVatRate} onChange={e => setFormData({ ...formData, defaultVatRate: e.target.value })} placeholder="Leave empty for non-expense" />
      </div>
      <div className="space-y-2">
        <Label>Sort order</Label>
        <Input type="number" min="0" value={formData.sortOrder} onChange={e => setFormData({ ...formData, sortOrder: parseInt(e.target.value, 10) || 0 })} />
      </div>
      <Button type="submit" className="w-full" disabled={saveAccount.isPending}>
        {saveAccount.isPending ? 'Saving...' : 'Save account'}
      </Button>
    </form>
  );
}
