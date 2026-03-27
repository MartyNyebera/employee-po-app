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

  const getCategoryBadgeStyle = (category: string) => {
    const colors: { [key: string]: { bg: string, text: string, border: string } } = {
      'Food': { bg: '#fffbeb', text: '#d97706', border: '#f59e0b' },
      'Vehicle Parts': { bg: '#dbeafe', text: '#3b82f6', border: '#93c5fd' },
      'Donations': { bg: '#faf5ff', text: '#8b5cf6', border: '#c4b5fd' },
      'Office Supplies': { bg: '#f0fdf4', text: '#16a34a', border: '#86efac' },
      'Fuel': { bg: '#fef2f2', text: '#dc2626', border: '#fca5a5' },
      'Maintenance': { bg: '#fefce8', text: '#ca8a04', border: '#fde68a' },
      'Utilities': { bg: '#e0e7ff', text: '#3730a3', border: '#a5b4fc' },
      'Travel': { bg: '#fdf2f8', text: '#ec4899', border: '#fca5a5' },
      'Training': { bg: '#ecfecc', text: '#059669', border: '#a7f3d0' },
      'Other': { bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db' }
    };
    return colors[category] || colors['Other'];
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '64vh',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          border: '4px solid #e5e7eb',
          borderTop: '4px solid #3b82f6',
          animation: 'spin 1s linear infinite'
        }}></div>
        <div style={{
          fontSize: '16px',
          fontWeight: '500',
          color: '#6b7280',
          fontFamily: 'Inter, sans-serif'
        }}>
          Loading miscellaneous expenses...
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '32px'
      }}>
        <div>
          <h1 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#111827',
            margin: '0 0 8px 0',
            fontFamily: 'Plus Jakarta Sans, Inter, sans-serif'
          }}>
            Miscellaneous Expenses
          </h1>
          <p style={{
            fontSize: '14px',
            color: '#6b7280',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            Track company expenses like food, vehicle parts, donations, and more
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            backgroundColor: '#3b82f6',
            color: 'white',
            padding: '12px 20px',
            borderRadius: '8px',
            border: 'none',
            fontSize: '14px',
            fontWeight: '500',
            fontFamily: 'Inter, sans-serif',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = '#2563eb';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = '#3b82f6';
          }}
        >
          <Plus style={{ width: '16px', height: '16px' }} />
          Add Expense
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '20px',
        marginBottom: '32px'
      }}>
        {/* Total Expenses Card */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #fee2e2',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          transition: 'all 0.2s ease',
          borderLeft: '4px solid #ef4444'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: '#fee2e2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <TrendingDown style={{ width: '24px', height: '24px', color: '#ef4444' }} />
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#ef4444',
            margin: '0 0 8px 0',
            fontFamily: 'Plus Jakarta Sans, Inter, monospace'
          }}>
            {formatCurrency(totalExpenses)}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#6b7280',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            {filteredExpenses.length} expenses
          </p>
        </div>

        {/* Average Expense Card */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          transition: 'all 0.2s ease',
          borderLeft: '4px solid #3b82f6'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: '#dbeafe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <DollarSign style={{ width: '24px', height: '24px', color: '#3b82f6' }} />
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#3b82f6',
            margin: '0 0 8px 0',
            fontFamily: 'Plus Jakarta Sans, Inter, monospace'
          }}>
            {formatCurrency(filteredExpenses.length > 0 ? totalExpenses / filteredExpenses.length : 0)}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#6b7280',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            Per expense
          </p>
        </div>

        {/* This Month Card */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          transition: 'all 0.2s ease',
          borderLeft: '4px solid #10b981'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: '#d1fae5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Calendar style={{ width: '24px', height: '24px', color: '#10b981' }} />
            </div>
          </div>
          <h3 style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#10b981',
            margin: '0 0 8px 0',
            fontFamily: 'Plus Jakarta Sans, Inter, monospace'
          }}>
            {formatCurrency(
              filteredExpenses
                .filter(e => new Date(e.expenseDate).getMonth() === new Date().getMonth())
                .reduce((sum, e) => sum + e.amount, 0)
            )}
          </h3>
          <p style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#6b7280',
            margin: '0',
            fontFamily: 'Inter, sans-serif'
          }}>
            Current month expenses
          </p>
        </div>
      </div>

      {/* Category Breakdown */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        marginBottom: '32px'
      }}>
        <h3 style={{
          fontSize: '20px',
          fontWeight: '600',
          color: '#111827',
          margin: '0 0 16px 0',
          fontFamily: 'Plus Jakarta Sans, Inter, sans-serif'
        }}>
          Expenses by Category
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '16px'
        }}>
          {expensesByCategory.map(({ category, amount, count }) => (
            <div key={category} style={{
              padding: '16px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'all 0.2s ease'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '600',
                  ...getCategoryBadgeStyle(category)
                }}>
                  {category}
                </span>
                <span style={{
                  fontSize: '12px',
                  fontWeight: '400',
                  color: '#6b7280'
                }}>
                  ({count})
                </span>
              </div>
              <span style={{
                fontSize: '16px',
                fontWeight: '600',
                color: '#111827'
              }}>
                {formatCurrency(amount)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Search and Filter */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        marginBottom: '32px'
      }}>
        <div style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center'
        }}>
          <Search style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '16px',
            height: '16px',
            color: '#9ca3af'
          }} />
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
              fontSize: '14px',
              fontFamily: 'Inter, sans-serif',
              backgroundColor: 'white',
              transition: 'all 0.2s ease'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#3b82f6';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#d1d5db';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <Filter style={{
            width: '20px',
            height: '20px',
            color: '#6b7280'
          }} />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              fontSize: '14px',
              fontFamily: 'Inter, sans-serif',
              backgroundColor: 'white',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <option value="all">All Categories</option>
            {EXPENSE_CATEGORIES.map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Expenses Table */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '16px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        overflow: 'hidden'
      }}>
        <div style={{
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb',
          padding: '12px 16px'
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
            gap: '4px',
            fontSize: '12px',
            fontWeight: '600',
            color: '#374151',
            fontFamily: 'Inter, sans-serif'
          }}>
            <div>Date</div>
            <div>Description</div>
            <div>Category</div>
            <div>Amount</div>
            <div>Created By</div>
            <div>Actions</div>
          </div>
        </div>
        <div style={{
          maxHeight: '400px',
          overflowY: 'auto'
        }}>
          {filteredExpenses.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: '#6b7280',
              fontFamily: 'Inter, sans-serif'
            }}>
              <p style={{ fontSize: '16px', marginBottom: '16px' }}>
                No miscellaneous expenses found
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                style={{
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  backgroundColor: 'white',
                  fontSize: '14px',
                  fontFamily: 'Inter, sans-serif',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                Add Your First Expense
              </button>
            </div>
          ) : (
            filteredExpenses.map((expense) => (
              <div
                key={expense.id}
                style={{
                  borderBottom: '1px solid #e5e7eb',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '16px'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <Calendar style={{ width: '16px', height: '16px', color: '#6b7280' }} />
                    <span style={{
                      fontSize: '14px',
                      color: '#374151',
                      fontFamily: 'Inter, sans-serif'
                    }}>
                      {new Date(expense.expenseDate).toLocaleDateString()}
                    </span>
                  </div>
                  <div style={{
                    flex: 1
                  }}>
                    <div>
                      <p style={{
                        fontSize: '14px',
                        fontWeight: '500',
                        color: '#111827',
                        margin: '0 0 4px 0',
                        fontFamily: 'Inter, sans-serif'
                      }}>
                        {expense.description}
                      </p>
                      <p style={{
                        fontSize: '12px',
                        color: '#6b7280',
                        margin: '0',
                        fontFamily: 'Inter, sans-serif'
                      }}>
                        Created {new Date(expense.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '600',
                      ...getCategoryBadgeStyle(expense.category)
                    }}>
                      {expense.category}
                    </span>
                  </div>
                  <div>
                    <span style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#ef4444',
                      fontFamily: 'Plus Jakarta Sans, Inter, monospace'
                    }}>
                      {formatCurrency(expense.amount)}
                    </span>
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <User style={{ width: '16px', height: '16px', color: '#6b7280' }} />
                    <span style={{
                      fontSize: '14px',
                      color: '#374151',
                      fontFamily: 'Inter, sans-serif'
                    }}>
                      {expense.createdBy}
                    </span>
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <button
                      onClick={() => handleEdit(expense)}
                      style={{
                        padding: '6px',
                        borderRadius: '4px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: '#3b82f6',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = '#dbeafe';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
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
                        backgroundColor: 'transparent',
                        color: '#ef4444',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = '#fee2e2';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <Trash2 style={{ width: '16px', height: '16px' }} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          inset: '0',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: '50',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '500px',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '24px',
              borderBottom: '1px solid #e5e7eb'
            }}>
              <h2 style={{
                fontSize: '20px',
                fontWeight: '600',
                color: '#111827',
                margin: '0',
                fontFamily: 'Plus Jakarta Sans, Inter, sans-serif'
              }}>
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
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <X style={{ width: '16px', height: '16px' }} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '20px'
              }}>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '6px',
                    fontFamily: 'Inter, sans-serif'
                  }}>
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
                      fontFamily: 'Inter, sans-serif',
                      resize: 'vertical',
                      minHeight: '80px'
                    }}
                  />
                </div>
                
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '6px',
                    fontFamily: 'Inter, sans-serif'
                  }}>
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
                      fontSize: '14px',
                      fontFamily: 'Inter, sans-serif'
                    }}
                  />
                </div>
                
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '6px',
                    fontFamily: 'Inter, sans-serif'
                  }}>
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
                      fontSize: '14px',
                      fontFamily: 'Inter, sans-serif',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <option value="">Select category</option>
                    {EXPENSE_CATEGORIES.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '6px',
                    fontFamily: 'Inter, sans-serif'
                  }}>
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
                      fontSize: '14px',
                      fontFamily: 'Inter, sans-serif'
                    }}
                  />
                </div>
                
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  paddingTop: '20px'
                }}>
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
                      fontFamily: 'Inter, sans-serif',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
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
                      fontFamily: 'Inter, sans-serif',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {editingExpense ? 'Update' : 'Create'} Expense
                  </button>
                </div>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
