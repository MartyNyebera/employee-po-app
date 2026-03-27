import { useState, useEffect } from 'react';
import { fetchMiscellaneousExpenses, createMiscellaneousExpense, updateMiscellaneousExpense, deleteMiscellaneousExpense } from '../api/client';
import { DollarSign, TrendingDown, Calendar, User, Search, Filter, X, Plus, Edit2, Trash2, Package } from 'lucide-react';
import { toast } from 'sonner';

interface MiscellaneousExpense {
  id: string;
  description: string;
  amount: number;
  category: string;
  expenseDate: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const EXPENSE_CATEGORIES = [
  'Food',
  'Vehicle Parts',
  'Donations',
  'Office Supplies',
  'Fuel',
  'Maintenance',
  'Utilities',
  'Travel',
  'Training',
  'Other'
];

export function MiscellaneousManagement() {
  const [expenses, setExpenses] = useState<MiscellaneousExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<MiscellaneousExpense | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [editForm, setEditForm] = useState({
    description: '',
    amount: '',
    category: '',
    expenseDate: new Date().toISOString().split('T')[0]
  });

  // Fetch expenses
  const fetchExpenses = async () => {
    try {
      setLoading(true);
      const data = await fetchMiscellaneousExpenses();
      setExpenses(data || []);
    } catch (error) {
      console.error('Error fetching miscellaneous expenses:', error);
      toast.error('Failed to load miscellaneous expenses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  // Filter expenses
  const filteredExpenses = expenses.filter(expense => {
    const matchesSearch = expense.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         expense.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || expense.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // Calculate totals
  const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const expensesByCategory = EXPENSE_CATEGORIES.map(category => ({
    category,
    amount: filteredExpenses.filter(e => e.category === category).reduce((sum, e) => sum + e.amount, 0),
    count: filteredExpenses.filter(e => e.category === category).length
  }));

  // Handle create/update
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!editForm.description || !editForm.amount || !editForm.category || !editForm.expenseDate) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const expenseData = {
        description: editForm.description,
        amount: parseFloat(editForm.amount),
        category: editForm.category,
        expense_date: editForm.expenseDate,
        created_by: 'Admin'
      };

      if (editingExpense) {
        await updateMiscellaneousExpense(editingExpense.id, expenseData);
        toast.success('Miscellaneous expense updated successfully');
      } else {
        await createMiscellaneousExpense(expenseData);
        toast.success('Miscellaneous expense created successfully');
      }

      await fetchExpenses();
      setShowCreateModal(false);
      setEditingExpense(null);
      setEditForm({
        description: '',
        amount: '',
        category: '',
        expenseDate: new Date().toISOString().split('T')[0]
      });

      // Trigger Business Overview refresh
      window.dispatchEvent(new CustomEvent('ordersUpdated'));
    } catch (error) {
      console.error('Error saving miscellaneous expense:', error);
      toast.error('Failed to save miscellaneous expense');
    }
  };

  // Handle delete
  const handleDelete = async (id: string, description: string) => {
    if (!confirm(`Are you sure you want to delete "${description}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteMiscellaneousExpense(id);
      toast.success('Miscellaneous expense deleted successfully');
      await fetchExpenses();
      
      // Trigger Business Overview refresh
      window.dispatchEvent(new CustomEvent('ordersUpdated'));
    } catch (error) {
      console.error('Error deleting miscellaneous expense:', error);
      toast.error('Failed to delete miscellaneous expense');
    }
  };

  // Handle edit
  const handleEdit = (expense: MiscellaneousExpense) => {
    setEditingExpense(expense);
    setEditForm({
      description: expense.description,
      amount: expense.amount.toString(),
      category: expense.category,
      expenseDate: expense.expenseDate
    });
    setShowCreateModal(true);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const getCategoryColor = (category: string) => {
    const colors: { [key: string]: string } = {
      'Food': 'bg-orange-100 text-orange-800',
      'Vehicle Parts': 'bg-blue-100 text-blue-800',
      'Donations': 'bg-purple-100 text-purple-800',
      'Office Supplies': 'bg-green-100 text-green-800',
      'Fuel': 'bg-red-100 text-red-800',
      'Maintenance': 'bg-yellow-100 text-yellow-800',
      'Utilities': 'bg-indigo-100 text-indigo-800',
      'Travel': 'bg-pink-100 text-pink-800',
      'Training': 'bg-cyan-100 text-cyan-800',
      'Other': 'bg-gray-100 text-gray-800'
    };
    return colors[category] || colors['Other'];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Miscellaneous Expenses</h1>
          <p className="text-gray-600 mt-1">Track company expenses like food, vehicle parts, donations, and more</p>
        </div>
        <Button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Expense
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              Total Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(totalExpenses)}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {filteredExpenses.length} expenses
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-blue-500" />
              Average Expense
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(filteredExpenses.length > 0 ? totalExpenses / filteredExpenses.length : 0)}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Per expense
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-green-500" />
              This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(
                filteredExpenses
                  .filter(e => new Date(e.expenseDate).getMonth() === new Date().getMonth())
                  .reduce((sum, e) => sum + e.amount, 0)
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Current month expenses
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Category Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Expenses by Category</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {expensesByCategory.map(({ category, amount, count }) => (
              <div key={category} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <Badge className={getCategoryColor(category)}>
                    {category}
                  </Badge>
                  <span className="text-sm text-gray-500">({count})</span>
                </div>
                <span className="font-semibold">{formatCurrency(amount)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search expenses..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filter by category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {EXPENSE_CATEGORIES.map(category => (
              <SelectItem key={category} value={category}>{category}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Expenses Table */}
      <Card>
        <CardHeader>
          <CardTitle>Expense List</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium text-gray-700">Date</th>
                  <th className="text-left p-3 font-medium text-gray-700">Description</th>
                  <th className="text-left p-3 font-medium text-gray-700">Category</th>
                  <th className="text-left p-3 font-medium text-gray-700">Amount</th>
                  <th className="text-left p-3 font-medium text-gray-700">Created By</th>
                  <th className="text-left p-3 font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((expense) => (
                  <tr key={expense.id} className="border-b hover:bg-gray-50">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        {new Date(expense.expenseDate).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="p-3">
                      <div>
                        <p className="font-medium">{expense.description}</p>
                        <p className="text-sm text-gray-500">
                          Created {new Date(expense.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge className={getCategoryColor(expense.category)}>
                        {expense.category}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <span className="font-semibold text-red-600">
                        {formatCurrency(expense.amount)}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-400" />
                        {expense.createdBy}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(expense)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(expense.id, expense.description)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {filteredExpenses.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <p>No miscellaneous expenses found</p>
                <Button
                  onClick={() => setShowCreateModal(true)}
                  variant="outline"
                  className="mt-4"
                >
                  Add Your First Expense
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  {editingExpense ? 'Edit Expense' : 'Add Miscellaneous Expense'}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingExpense(null);
                    setEditForm({
                      description: '',
                      amount: '',
                      category: '',
                      expenseDate: new Date().toISOString().split('T')[0]
                    });
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Enter expense description..."
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="amount">Amount</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={editForm.amount}
                    onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="category">Category</Label>
                  <Select value={editForm.category} onValueChange={(value) => setEditForm({ ...editForm, category: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map(category => (
                        <SelectItem key={category} value={category}>{category}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="expenseDate">Expense Date</Label>
                  <Input
                    id="expenseDate"
                    type="date"
                    value={editForm.expenseDate}
                    onChange={(e) => setEditForm({ ...editForm, expenseDate: e.target.value })}
                    required
                  />
                </div>
                
                <div className="flex gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowCreateModal(false);
                      setEditingExpense(null);
                      setEditForm({
                        description: '',
                        amount: '',
                        category: '',
                        expenseDate: new Date().toISOString().split('T')[0]
                      });
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1">
                    {editingExpense ? 'Update' : 'Create'} Expense
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
