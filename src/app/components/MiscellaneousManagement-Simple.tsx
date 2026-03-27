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
  const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + parseFloat(typeof expense.amount === 'string' ? expense.amount : expense.amount.toString()), 0);

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
      console.log('🔄 Dispatching ordersUpdated event from Miscellaneous create');
      window.dispatchEvent(new CustomEvent('ordersUpdated'));
      
      // Also try direct refresh
      console.log('🔄 Triggering direct refresh');
      window.location.reload();
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
      console.log('🔄 Dispatching ordersUpdated event from Miscellaneous delete');
      window.dispatchEvent(new CustomEvent('ordersUpdated'));
      
      // Also try direct refresh
      console.log('🔄 Triggering direct refresh');
      window.location.reload();
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

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: '16px', color: '#6b7280' }}>Loading miscellaneous expenses...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px', marginBottom: '8px', color: '#111827' }}>
          Miscellaneous Expenses
        </h1>
        <p style={{ color: '#6b7280', marginBottom: '16px' }}>
          Track company expenses like food, vehicle parts, donations, and more
        </p>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            backgroundColor: '#3b82f6',
            color: 'white',
            padding: '12px 20px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Plus style={{ width: '16px', height: '16px' }} />
          Add Expense
        </button>
      </div>

      {/* Summary Card */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '16px',
        padding: '24px',
        marginBottom: '32px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
      }}>
        <h3 style={{ fontSize: '20px', marginBottom: '16px', color: '#111827' }}>
          Expense Summary
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '20px'
        }}>
          <div>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
              Total Expenses
            </div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ef4444' }}>
              {formatCurrency(totalExpenses)}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              {filteredExpenses.length} expenses
            </div>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
              Average Expense
            </div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3b82f6' }}>
              {formatCurrency(filteredExpenses.length > 0 ? totalExpenses / filteredExpenses.length : 0)}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              Per expense
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filter */}
      <div style={{ marginBottom: '32px', display: 'flex', gap: '16px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search style={{ position: 'absolute', left: '12px', top: '12px', width: '16px', height: '16px', color: '#9ca3af' }} />
          <input
            type="text"
            placeholder="Search expenses..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 12px 12px 44px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              fontSize: '14px'
            }}
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            fontSize: '14px'
          }}
        >
          <option value="all">All Categories</option>
          {EXPENSE_CATEGORIES.map(category => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>
      </div>

      {/* Expenses Table */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '16px',
        overflow: 'hidden'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ backgroundColor: '#f9fafb' }}>
            <tr>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#374151' }}>Date</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#374151' }}>Description</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#374151' }}>Category</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#374151' }}>Amount</th>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#374151' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredExpenses.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '60px', textAlign: 'center', color: '#6b7280' }}>
                  <div>
                    <p style={{ fontSize: '16px', marginBottom: '16px' }}>No miscellaneous expenses found</p>
                    <button
                      onClick={() => setShowCreateModal(true)}
                      style={{
                        padding: '12px 24px',
                        borderRadius: '8px',
                        border: '1px solid #d1d5db',
                        backgroundColor: 'white',
                        cursor: 'pointer'
                      }}
                    >
                      Add Your First Expense
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              filteredExpenses.map((expense) => (
                <tr key={expense.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Calendar style={{ width: '16px', height: '16px', color: '#6b7280' }} />
                      {new Date(expense.expenseDate).toLocaleDateString()}
                    </div>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div>
                      <p style={{ margin: '0 0 4px 0', fontWeight: '500' }}>{expense.description}</p>
                      <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>
                        Created {new Date(expense.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '600',
                      backgroundColor: '#dbeafe',
                      color: '#3b82f6'
                    }}>
                      {expense.category}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ fontWeight: '600', color: '#ef4444' }}>
                      {formatCurrency(expense.amount)}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleEdit(expense)}
                        style={{
                          padding: '6px',
                          borderRadius: '4px',
                          border: 'none',
                          color: '#3b82f6',
                          cursor: 'pointer'
                        }}
                      >
                        <Edit2 style={{ width: '16px', height: '16px' }} />
                      </button>
                      <button
                        onClick={() => handleDelete(expense.id, expense.description)}
                        style={{
                          padding: '6px',
                          borderRadius: '4px',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer'
                        }}
                      >
                        <Trash2 style={{ width: '16px', height: '16px' }} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          inset: '0',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          zIndex: '50'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '500px',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '24px',
              borderBottom: '1px solid #e5e7eb'
            }}>
              <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#111827', margin: 0 }}>
                {editingExpense ? 'Edit Expense' : 'Add Miscellaneous Expense'}
              </h2>
              <button
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
                style={{
                  padding: '8px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: '#6b7280',
                  cursor: 'pointer'
                }}
              >
                <X style={{ width: '16px', height: '16px' }} />
              </button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                    Description
                  </label>
                  <textarea
                    placeholder="Enter expense description..."
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid #d1d5db',
                      fontSize: '14px',
                      minHeight: '80px'
                    }}
                  />
                </div>
                
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                    Amount
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={editForm.amount}
                    onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid #d1d5db',
                      fontSize: '14px'
                    }}
                  />
                </div>
                
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                    Category
                  </label>
                  <select
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid #d1d5db',
                      fontSize: '14px'
                    }}
                  >
                    <option value="">Select category</option>
                    {EXPENSE_CATEGORIES.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                    Expense Date
                  </label>
                  <input
                    type="date"
                    value={editForm.expenseDate}
                    onChange={(e) => setEditForm({ ...editForm, expenseDate: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid #d1d5db',
                      fontSize: '14px'
                    }}
                  />
                </div>
                
                <div style={{ display: 'flex', gap: '12px', paddingTop: '20px' }}>
                  <button
                    type="button"
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
                    style={{
                      flex: 1,
                      padding: '12px 20px',
                      borderRadius: '8px',
                      border: '1px solid #d1d5db',
                      fontSize: '14px',
                      backgroundColor: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{
                      flex: 1,
                      padding: '12px 20px',
                      borderRadius: '8px',
                      border: '1px solid #3b82f6',
                      fontSize: '14px',
                      fontWeight: '500',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    {editingExpense ? 'Update' : 'Create'} Expense
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
