import { useState, useEffect } from 'react';
import { Package, Clock, CheckCircle, XCircle, User, Calendar, Tag, Filter, Search, RefreshCw } from 'lucide-react';
import { fetchApi, getStoredAuth } from '../api/client';

interface MaterialRequest {
  id: number;
  request_number: string;
  employee_id: number;
  employee_name: string;
  item_name: string;
  item_code?: string;
  quantity_requested: number;
  unit: string;
  purpose: string;
  urgency: 'low' | 'normal' | 'high';
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  created_at: string;
  admin_notes?: string;
  reviewed_by?: string;
  reviewed_at?: string;
}

interface MaterialRequestsProps {
  onBack?: () => void;
}

export function MaterialRequests({ onBack }: MaterialRequestsProps) {
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<MaterialRequest | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);

  // Fetch all material requests
  const fetchRequests = async () => {
    try {
      setLoading(true);
      console.log('Fetching material requests...');
      const data = await fetchApi('/material-requests');
      console.log('Raw API response:', data);
      console.log('Type of data:', typeof data);
      console.log('Is array:', Array.isArray(data));
      
      // Ensure data is an array
      const requestsArray = Array.isArray(data) ? data : [];
      console.log('Setting requests:', requestsArray);
      setRequests(requestsArray);
    } catch (error) {
      console.error('Error fetching material requests:', error);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  // Filter requests
  const filteredRequests = requests.filter(request => {
    const matchesFilter = filter === 'all' || request.status === filter;
    const matchesSearch = request.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         request.employee_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (request.item_code && request.item_code.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  // Handle approve/reject
  const handleReview = async (requestId: number, status: 'approved' | 'rejected', adminNotes?: string) => {
    setProcessingId(requestId);
    try {
      const auth = getStoredAuth();
      const adminId = auth?.user?.id ? parseInt(auth.user.id) : 1; // Fallback to ID 1
      
      await fetchApi(`/api/material-requests/${requestId}/review`, {
        method: 'PUT',
        body: JSON.stringify({
          status,
          admin_notes: adminNotes || '',
          reviewed_by: adminId,
        }),
      });

      // Refresh requests
      await fetchRequests();
      setShowDetailsModal(false);
      setSelectedRequest(null);
    } catch (error) {
      console.error('Error reviewing request:', error);
      alert('Failed to update request');
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'approved': return 'bg-green-100 text-green-700 border-green-200';
      case 'rejected': return 'bg-red-100 text-red-700 border-red-200';
      case 'completed': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch(urgency) {
      case 'high': return 'bg-red-100 text-red-700';
      case 'normal': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'approved': return CheckCircle;
      case 'rejected': return XCircle;
      case 'completed': return Package;
      default: return Clock;
    }
  };

  const statusCounts = {
    all: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
    completed: requests.filter(r => r.status === 'completed').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-slate-500">
          <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />
          <span>Loading material requests...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Material Requests</h1>
          <p className="text-slate-600">Review and manage employee material requests</p>
        </div>
        <button
          onClick={fetchRequests}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="size-4" />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Object.entries(statusCounts).map(([status, count]) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`p-4 rounded-lg border transition-colors ${
              filter === status
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-white border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="text-2xl font-bold">{count}</div>
            <div className="text-sm capitalize">{status}</div>
          </button>
        ))}
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 size-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search requests..."
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {['all', 'pending', 'approved', 'rejected', 'completed'].map(status => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                filter === status
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Requests List */}
      {filteredRequests.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <Package className="size-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">No requests found</h3>
          <p className="text-slate-500">Try adjusting your search or filters</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRequests.map((request) => {
            const StatusIcon = getStatusIcon(request.status);
            return (
              <div
                key={request.id}
                className="bg-white border border-slate-200 rounded-xl p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-6">
                  <div className="flex-1">
                    <div className="flex items-start gap-4 mb-4">
                      <div className={`p-2 rounded-lg ${
                        request.status === 'pending' ? 'bg-yellow-50' :
                        request.status === 'approved' ? 'bg-green-50' :
                        request.status === 'rejected' ? 'bg-red-50' :
                        'bg-blue-50'
                      }`}>
                        <StatusIcon className={`size-5 ${
                          request.status === 'pending' ? 'text-yellow-600' :
                          request.status === 'approved' ? 'text-green-600' :
                          request.status === 'rejected' ? 'text-red-600' :
                          'text-blue-600'
                        }`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-slate-900">{request.item_name}</h3>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(request.status)}`}>
                            {request.status}
                          </span>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getUrgencyColor(request.urgency)}`}>
                            {request.urgency}
                          </span>
                        </div>
                        <div className="text-sm text-slate-600 mb-2">
                          {request.quantity_requested} {request.unit}
                          {request.item_code && ` • ${request.item_code}`}
                        </div>
                        <p className="text-sm text-slate-600 mb-3">{request.purpose}</p>
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          <div className="flex items-center gap-1">
                            <User className="size-3" />
                            <span>{request.employee_name}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="size-3" />
                            <span>{new Date(request.created_at).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Tag className="size-3" />
                            <span>{request.request_number}</span>
                          </div>
                        </div>
                        {request.admin_notes && (
                          <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                            <p className="text-sm text-slate-600">
                              <strong>Admin Notes:</strong> {request.admin_notes}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setSelectedRequest(request);
                        setShowDetailsModal(true);
                      }}
                      className="px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      View Details
                    </button>
                    {request.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleReview(request.id, 'approved')}
                          disabled={processingId === request.id}
                          className="px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                          {processingId === request.id ? 'Processing...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleReview(request.id, 'rejected')}
                          disabled={processingId === request.id}
                          className="px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                        >
                          {processingId === request.id ? 'Processing...' : 'Reject'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Details Modal */}
      {showDetailsModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Request Details</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-slate-500">Request Number</label>
                  <p className="font-medium">{selectedRequest.request_number}</p>
                </div>
                <div>
                  <label className="text-sm text-slate-500">Status</label>
                  <p className="font-medium">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(selectedRequest.status)}`}>
                      {selectedRequest.status}
                    </span>
                  </p>
                </div>
                <div>
                  <label className="text-sm text-slate-500">Employee</label>
                  <p className="font-medium">{selectedRequest.employee_name}</p>
                </div>
                <div>
                  <label className="text-sm text-slate-500">Date Requested</label>
                  <p className="font-medium">{new Date(selectedRequest.created_at).toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="text-sm text-slate-500">Item</label>
                  <p className="font-medium">{selectedRequest.item_name}</p>
                </div>
                <div>
                  <label className="text-sm text-slate-500">Quantity</label>
                  <p className="font-medium">{selectedRequest.quantity_requested} {selectedRequest.unit}</p>
                </div>
                <div>
                  <label className="text-sm text-slate-500">Urgency</label>
                  <p className="font-medium">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getUrgencyColor(selectedRequest.urgency)}`}>
                      {selectedRequest.urgency}
                    </span>
                  </p>
                </div>
                <div>
                  <label className="text-sm text-slate-500">Item Code</label>
                  <p className="font-medium">{selectedRequest.item_code || 'N/A'}</p>
                </div>
              </div>
              <div>
                <label className="text-sm text-slate-500">Purpose</label>
                <p className="font-medium">{selectedRequest.purpose}</p>
              </div>
              {selectedRequest.admin_notes && (
                <div>
                  <label className="text-sm text-slate-500">Admin Notes</label>
                  <p className="font-medium">{selectedRequest.admin_notes}</p>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
              {selectedRequest.status === 'pending' && (
                <>
                  <button
                    onClick={() => handleReview(selectedRequest.id, 'approved')}
                    disabled={processingId === selectedRequest.id}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {processingId === selectedRequest.id ? 'Processing...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleReview(selectedRequest.id, 'rejected')}
                    disabled={processingId === selectedRequest.id}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {processingId === selectedRequest.id ? 'Processing...' : 'Reject'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
