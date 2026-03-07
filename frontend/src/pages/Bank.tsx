import { useState } from 'react';
import { useBankTransactions, useImportBankTransactions } from '../hooks/useBank';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Upload, Link as LinkIcon } from 'lucide-react';

export default function Bank() {
  const { data: transactions, isLoading } = useBankTransactions();
  const importMutation = useImportBankTransactions();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const formData = new FormData();
      formData.append('csv', file);
      await importMutation.mutateAsync(formData);
      // Reset input
      e.target.value = '';
    }
  };

  const filteredTransactions = transactions?.filter((tx: any) => {
    const matchesSearch = tx.counterparty?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          tx.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (filterType === 'unreconciled' && tx.reconciled) return false;
    if (filterType === 'reconciled' && !tx.reconciled) return false;
    if (filterType === 'in' && Number(tx.amount) <= 0) return false;
    if (filterType === 'out' && Number(tx.amount) > 0) return false;
    
    return matchesSearch;
  }) || [];

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
            disabled={importMutation.isPending}
          />
          <label htmlFor="csv-upload">
            <span className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 cursor-pointer">
              <Upload className="w-4 h-4 mr-2" />
              {importMutation.isPending ? 'Importing...' : 'Import CSV'}
            </span>
          </label>
        </div>
      </div>

      <Card>
        <CardHeader className="py-4">
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <Input 
              placeholder="Search counterparty or description..." 
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
                  <TableHead>Counterparty</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                      No transactions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransactions.map((tx: any) => (
                    <TableRow key={tx.id}>
                      <TableCell className="whitespace-nowrap">{new Date(tx.date).toLocaleDateString()}</TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate" title={tx.counterparty}>
                        {tx.counterparty || '-'}
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate" title={tx.description}>
                        {tx.description}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${Number(tx.amount) > 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
                        {Number(tx.amount) > 0 ? '+' : ''}€{Math.abs(Number(tx.amount)).toFixed(2)}
                      </TableCell>
                      <TableCell>
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
                      <TableCell>
                        {!tx.reconciled && (
                          <Button variant="ghost" size="sm" className="h-8">
                            <LinkIcon className="w-4 h-4 mr-1" /> Match
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
