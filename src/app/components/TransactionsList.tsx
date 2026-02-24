import { useState, useEffect } from 'react';
import { fetchTransactions, createTransaction } from '../api/client';
import { fetchVehicles, type Vehicle } from '../api/fleet';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Receipt, Plus, DollarSign, Calendar, Fuel, Wrench, Package, Truck as TruckIcon, Filter } from 'lucide-react';
import { toast } from 'sonner';

interface Transaction {
  id: string;
  poNumber: string;
  type: 'fuel' | 'maintenance' | 'parts' | 'rental';
  description: string;
  amount: number;
  assetId: string;
  date: string;
  receipt?: string;
}

interface TransactionsListProps {
  isAdmin: boolean;
}

export function TransactionsList({ isAdmin }: TransactionsListProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchTransactions()
        .then(data => {
          if (!Array.isArray(data)) {
            throw new Error('API returned non-array data');
          }
          setTransactions(data);
          setError(null);
        })
        .catch(err => {
          setError(err.message || 'Failed to load transactions');
          setTransactions([]);
        }),
      fetchVehicles()
        .then(data => {
          if (!Array.isArray(data)) {
            throw new Error('API returned non-array data');
          }
          setVehicles(data);
        })
        .catch(() => setVehicles([])),
    ]).finally(() => setLoading(false));
  }, []);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'fuel':
        return <Fuel className="size-4 text-orange-500" />;
      case 'maintenance':
        return <Wrench className="size-4 text-blue-500" />;
      case 'parts':
        return <Package className="size-4 text-purple-500" />;
      case 'rental':
        return <TruckIcon className="size-4 text-green-500" />;
      default:
        return <Receipt className="size-4 text-gray-500" />;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'fuel':
        return <Badge className="bg-orange-50 text-orange-700 border-orange-200 px-3 py-1 rounded-full font-medium text-xs shadow-sm shadow-orange-500/10 hover:bg-orange-100 transition-all duration-200 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/30 dark:shadow-lg dark:shadow-orange-500/20 dark:hover:bg-orange-500/30">Fuel</Badge>;
      case 'maintenance':
        return <Badge className="bg-blue-50 text-blue-700 border-blue-200 px-3 py-1 rounded-full font-medium text-xs shadow-sm shadow-blue-500/10 hover:bg-blue-100 transition-all duration-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30 dark:shadow-lg dark:shadow-blue-500/20 dark:hover:bg-blue-500/30">Maintenance</Badge>;
      case 'parts':
        return <Badge className="bg-purple-50 text-purple-700 border-purple-200 px-3 py-1 rounded-full font-medium text-xs shadow-sm shadow-purple-500/10 hover:bg-purple-100 transition-all duration-200 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/30 dark:shadow-lg dark:shadow-purple-500/20 dark:hover:bg-purple-500/30">Parts</Badge>;
      case 'rental':
        return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 px-3 py-1 rounded-full font-medium text-xs shadow-sm shadow-emerald-500/10 hover:bg-emerald-100 transition-all duration-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30 dark:shadow-lg dark:shadow-emerald-500/20 dark:hover:bg-emerald-500/30">Rental</Badge>;
      default:
        return <Badge className="bg-slate-100 text-slate-700 border-slate-200 px-3 py-1 rounded-full font-medium text-xs shadow-sm shadow-slate-500/10 hover:bg-slate-200 transition-all duration-200 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/30 dark:shadow-lg dark:shadow-slate-500/20 dark:hover:bg-slate-500/30">{type}</Badge>;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleCreateTransaction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      const newTransaction = await createTransaction({
        poNumber: formData.get('poNumber') as string,
        type: formData.get('type') as string,
        description: formData.get('description') as string,
        amount: Number(formData.get('amount')),
        assetId: formData.get('assetId') as string,
      });
      setTransactions([newTransaction, ...transactions]);
      toast.success('Transaction recorded successfully');
    } catch {
      toast.error('Failed to record transaction');
    }
  };

  const totalAmount = transactions.reduce((sum, txn) => sum + txn.amount, 0);

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[200px]">
        <div className="text-gray-500">Loading transactions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[200px]">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <Receipt className="size-8 text-red-500" />
          </div>
          <h3 className="text-lg font-semibold text-red-900 mb-2">Error Loading Transactions</h3>
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Enhanced Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-amber-100 rounded-lg dark:bg-amber-500/20">
              <Receipt className="size-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Transactions</h2>
              <p className="text-slate-600 text-sm dark:text-slate-400">Track and analyze financial transactions</p>
            </div>
          </div>
        </div>
        {isAdmin && (
          <Dialog>
            <DialogTrigger className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 border border-blue-500/20 inline-flex items-center justify-center rounded-lg text-sm font-semibold transition-all duration-300 hover:-translate-y-1 px-4 py-2">
              <Plus className="size-4 mr-2" />
              New Transaction
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record Transaction</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateTransaction} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="poNumber">PO Number</Label>
                  <Input id="poNumber" name="poNumber" placeholder="PO-2026-XXXX" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Transaction Type</Label>
                  <Select name="type" required>
                    <SelectTrigger id="type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fuel">Fuel</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="parts">Parts</SelectItem>
                      <SelectItem value="rental">Rental</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="assetId">Asset</Label>
                  <Select name="assetId" required>
                    <SelectTrigger id="assetId">
                      <SelectValue placeholder="Select asset" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles.map(vehicle => (
                        <SelectItem key={vehicle.id} value={vehicle.id}>
                          {vehicle.unit_name} ({vehicle.id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" name="description" placeholder="Transaction details..." required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (PHP)</Label>
                  <Input id="amount" name="amount" type="number" placeholder="0" required />
                </div>
                <Button type="submit" className="w-full">Record Transaction</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Summary Card */}
      <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200/60 shadow-xl shadow-amber-500/10 dark:from-slate-800/50 dark:to-slate-900/50 dark:border dark:border-white/10 dark:shadow-xl dark:shadow-black/20">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-amber-100 rounded-lg dark:bg-amber-500/20">
                <Receipt className="size-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <div className="text-sm font-medium text-amber-700 dark:text-amber-300 uppercase tracking-wider">Total Transactions</div>
                <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">{transactions.length} recorded</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-amber-800 dark:text-amber-200">{formatCurrency(totalAmount)}</div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4 mt-4">
            <div className="text-center">
              <div className="text-xs text-amber-600 dark:text-amber-400">Fuel</div>
              <div className="text-lg font-bold text-amber-800 dark:text-amber-200">
                {formatCurrency(transactions.filter(t => t.type === 'fuel').reduce((sum, t) => sum + t.amount, 0))}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-blue-600 dark:text-blue-400">Maintenance</div>
              <div className="text-lg font-bold text-blue-800 dark:text-blue-200">
                {formatCurrency(transactions.filter(t => t.type === 'maintenance').reduce((sum, t) => sum + t.amount, 0))}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-purple-600 dark:text-purple-400">Parts</div>
              <div className="text-lg font-bold text-purple-800 dark:text-purple-200">
                {formatCurrency(transactions.filter(t => t.type === 'parts').reduce((sum, t) => sum + t.amount, 0))}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-emerald-600 dark:text-emerald-400">Rental</div>
              <div className="text-lg font-bold text-emerald-800 dark:text-emerald-200">
                {formatCurrency(transactions.filter(t => t.type === 'rental').reduce((sum, t) => sum + t.amount, 0))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Enhanced Filter Bar */}
      <Card className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5 dark:bg-slate-800/50 dark:border dark:border-white/10 dark:shadow-xl dark:shadow-black/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
              <Filter className="size-5" />
              <span className="font-medium">Filter</span>
            </div>
            <div className="flex-1">
              <Input 
                placeholder="Search transactions..." 
                className="bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 dark:focus:ring-amber-500/40"
              />
            </div>
            <Select defaultValue="all">
              <SelectTrigger className="w-32 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="fuel">Fuel</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="parts">Parts</SelectItem>
                <SelectItem value="rental">Rental</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="all">
              <SelectTrigger className="w-32 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600">
                <SelectValue placeholder="Asset" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vehicles</SelectItem>
                {vehicles.map(vehicle => (
                  <SelectItem key={vehicle.id} value={vehicle.id}>{vehicle.unit_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select defaultValue="newest">
              <SelectTrigger className="w-32 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
                <SelectItem value="amount-high">Amount High</SelectItem>
                <SelectItem value="amount-low">Amount Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Transactions List */}
      <div className="space-y-3">
        {Array.isArray(transactions) && transactions.length > 0 ? (
          transactions.map((txn) => {
          const vehicle = vehicles.find(v => v.id === txn.assetId);
          const vehicleName = vehicle ? vehicle.unit_name : `Asset ${txn.assetId}`;

          return (
            <Card key={txn.id} className="bg-white border border-slate-200/60 shadow-lg shadow-slate-900/5 hover:shadow-xl hover:shadow-slate-900/10 hover:-translate-y-1 transition-all duration-300 dark:bg-slate-800/50 dark:border dark:border-white/10 dark:shadow-xl dark:shadow-black/20 dark:hover:shadow-2xl dark:hover:shadow-black/30">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-amber-50 rounded-lg dark:bg-amber-500/20">
                      {getTypeIcon(txn.type)}
                    </div>
                    <div className="flex-1">
                      <div className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">{txn.description}</div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">
                        PO: {txn.poNumber}
                      </div>
                    </div>
                  </div>
                  {getTypeBadge(txn.type)}
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-500/20 rounded-lg border border-amber-200 dark:border-amber-500/30">
                    <div className="p-2 bg-amber-100 dark:bg-amber-500/30 rounded-lg">
                      <DollarSign className="size-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <div className="text-lg font-bold text-amber-800 dark:text-amber-200">{formatCurrency(txn.amount)}</div>
                      <div className="text-xs text-amber-600 dark:text-amber-400">Amount</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-500/20 rounded-lg border border-blue-200 dark:border-blue-500/30">
                    <div className="p-2 bg-blue-100 dark:bg-blue-500/30 rounded-lg">
                      <Calendar className="size-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <div className="text-lg font-bold text-blue-800 dark:text-blue-200">{formatDate(txn.date)}</div>
                      <div className="text-xs text-blue-600 dark:text-blue-400">Date</div>
                    </div>
                  </div>
                </div>

                {vehicleName && (
                  <div className="pt-4 border-t border-slate-200/60 dark:border-white/10">
                    <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                      <div className="p-1.5 bg-slate-100 dark:bg-slate-700/50 rounded-lg">
                        <TruckIcon className="size-4 text-slate-600 dark:text-slate-400" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-slate-700 dark:text-slate-300">{vehicleName}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-500">{txn.assetId}</div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
        ) : (
          <div className="p-12 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center dark:bg-slate-700/50">
                <Receipt className="size-8 text-slate-400 dark:text-slate-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No transactions yet</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Create your first transaction to get started.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}