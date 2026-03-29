import { useState } from 'react';
import { X, Package, AlertTriangle } from 'lucide-react';
import { fetchApi } from '../api/client';
import { toast } from 'sonner';

interface WithdrawInventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: {
    id: string;
    itemCode: string;
    itemName: string;
    quantity: number;
    unit: string;
  };
  onSuccess: () => void;
}

export function WithdrawInventoryModal({ isOpen, onClose, item, onSuccess }: WithdrawInventoryModalProps) {
  const [withdrawQuantity, setWithdrawQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const quantity = parseInt(withdrawQuantity);
    
    if (!quantity || quantity <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }
    
    if (quantity > item.quantity) {
      toast.error('Cannot withdraw more than available stock');
      return;
    }
    
    if (!reason.trim()) {
      toast.error('Please provide a reason for withdrawal');
      return;
    }

    setLoading(true);
    
    try {
      // Call the deduct API endpoint
      await fetchApi(`/inventory/${item.id}/deduct`, {
        method: 'PUT',
        body: JSON.stringify({
          quantity,
          reason: reason.trim(),
          withdrawnBy: 'Admin', // You can make this dynamic based on logged-in user
          withdrawalDate: new Date().toISOString()
        })
      });
      
      toast.success(`Successfully withdrew ${quantity} ${item.unit} of ${item.itemName}`);
      onSuccess();
      onClose();
      
      // Reset form
      setWithdrawQuantity('');
      setReason('');
      
    } catch (error: any) {
      console.error('Withdrawal error:', error);
      toast.error(error.message || 'Failed to withdraw inventory');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Withdraw Inventory</h2>
              <p className="text-sm text-gray-500">Reduce stock quantity</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Item Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{item.itemName}</p>
                <p className="text-sm text-gray-500">Code: {item.itemCode}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-gray-900">{item.quantity}</p>
                <p className="text-sm text-gray-500">{item.unit} available</p>
              </div>
            </div>
          </div>

          {/* Withdraw Quantity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Withdraw Quantity *
            </label>
            <div className="relative">
              <input
                type="number"
                value={withdrawQuantity}
                onChange={(e) => setWithdrawQuantity(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="Enter quantity"
                min="1"
                max={item.quantity}
                required
              />
              <span className="absolute right-4 top-2.5 text-gray-500 text-sm">{item.unit}</span>
            </div>
          </div>

          {/* Remaining Stock */}
          {withdrawQuantity && parseInt(withdrawQuantity) > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-600" />
                <span className="text-sm text-blue-800">
                  Remaining stock: {item.quantity - parseInt(withdrawQuantity)} {item.unit}
                </span>
              </div>
            </div>
          )}

          {/* Warning for low stock */}
          {withdrawQuantity && parseInt(withdrawQuantity) > 0 && (item.quantity - parseInt(withdrawQuantity)) <= 10 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600" />
                <span className="text-sm text-yellow-800">
                  Warning: Stock will be low after withdrawal
                </span>
              </div>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason for Withdrawal *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              placeholder="e.g., Used for project XYZ, Damaged items, etc."
              rows={3}
              required
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading || !withdrawQuantity || !reason}
            >
              {loading ? 'Withdrawing...' : 'Withdraw Stock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
