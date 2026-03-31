import { useState, useEffect, useRef } from 'react';
import { Truck, MapPin, MessageSquare, LogOut, Send,
  Paperclip, CheckCircle, Navigation, NavigationOff, Gauge } from 'lucide-react';
import ErrorBoundary from '../components/ErrorBoundary';
import { PageErrorFallback } from '../components/PageErrorFallback';

// Driver-specific fetch function
const fetchDriverApi = async (path: string, options?: RequestInit) => {
  const token = localStorage.getItem('driver_token');
  const headers = { 
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options?.headers 
  } as Record<string, string>;
  
  const fetchWithRetry = async (retries = 3, delay = 1000): Promise<Response> => {
    try {
      const res = await fetch(`/api${path}`, { ...options, headers });
      
      // Check if status is retryable
      const shouldRetry = [408, 429, 500, 502, 503, 504].includes(res.status);
      
      if (!res.ok && shouldRetry && retries > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchWithRetry(retries - 1, delay * 2);
      }
      
      return res;
    } catch (error) {
      // Network errors - retry
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchWithRetry(retries - 1, delay * 2);
      }
      throw error;
    }
  };
  
  const res = await fetchWithRetry();
  
  // Handle non-retryable errors
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`DriverPortal API request failed for ${path}: ${err.error || `HTTP ${res.status}`}`);
  }
  return res.json();
};

type DriverView = 'deliveries' | 'tracking' | 'chat';

const DELIVERY_STATUSES = [
  { key: 'Picked Up',  label: 'Picked Up',  color: 'bg-blue-500' },
  { key: 'In Transit', label: 'In Transit', color: 'bg-orange-500' },
  { key: 'Arrived',   label: 'Arrived',    color: 'bg-purple-500' },
  { key: 'Completed', label: 'Completed',  color: 'bg-green-500' },
];

export function DriverPortal() {
  const [view, setView] = useState<DriverView>('deliveries');
  const [driver, setDriver] = useState<any>(null);
  const [assignedVehicle, setAssignedVehicle] = useState<any>(null);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [gpsActive, setGpsActive] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState<number | null>(null);
  const [isVehicleLoading, setIsVehicleLoading] = useState(false);
  const [isDeliveriesLoading, setIsDeliveriesLoading] = useState(false);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [isStatusUpdating, setIsStatusUpdating] = useState<string | null>(null);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const gpsIntervalRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem(
      'driver_session'
    );
    if (!stored) {
      window.location.href = '/driver/login';
      return;
    }
    const session = JSON.parse(stored);
    setDriver(session);
    loadDeliveries(session.id);
    loadMessages(session.id);
    loadAssignedVehicle(session.id);

    // Poll messages every 10 seconds
    const msgInterval = setInterval(() => {
      loadMessages(session.id);
    }, 10000);

    // Poll vehicle ODO every 30 seconds
    const odoInterval = setInterval(() => {
      loadAssignedVehicle(session.id);
    }, 30000);

    return () => {
      clearInterval(msgInterval);
      clearInterval(odoInterval);
      if (gpsIntervalRef.current) {
        clearInterval(gpsIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView(
      { behavior: 'smooth' }
    );
  }, [messages]);

  const loadAssignedVehicle = async (driverId: number) => {
    setIsVehicleLoading(true);
    try {
      const data = await fetchDriverApi(`/driver/${driverId}/vehicle`);
      setAssignedVehicle(data);
    } catch (error) { 
      console.error('Failed to load assigned vehicle:', error);
      setAssignedVehicle(null); 
    } finally {
      setIsVehicleLoading(false);
    }
  };

  const startGPS = (driverData: any) => {
    if (!navigator.geolocation) {
      alert('GPS not supported on this device');
      return;
    }
    setGpsActive(true);
    const sendLocation = () => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          setCurrentSpeed(pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 0);
          try {
            await fetchDriverApi('/driver/location', {
              method: 'POST',
              body: JSON.stringify({
                driver_id: driverData.id,
                driver_name: driverData.full_name,
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                speed: pos.coords.speed || 0,
                heading: pos.coords.heading || 0
              })
            });
          } catch (error) {
            console.error('Failed to send GPS location:', error);
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
      );
    };
    sendLocation();
    gpsIntervalRef.current = setInterval(sendLocation, 15000);
  };

  const stopGPS = () => {
    if (gpsIntervalRef.current) {
      clearInterval(gpsIntervalRef.current);
      gpsIntervalRef.current = null;
    }
    setGpsActive(false);
    setCurrentSpeed(null);
  };

  const loadDeliveries = async (id: number) => {
    setIsDeliveriesLoading(true);
    try {
      const data = await fetchDriverApi(`/driver/${id}/deliveries`);
      setDeliveries(data);
    } catch (error) { 
      console.error('Failed to load deliveries:', error);
      setDeliveries([]); 
    } finally {
      setIsDeliveriesLoading(false);
    }
  };

  const loadMessages = async (id: number) => {
    setIsMessagesLoading(true);
    try {
      const data = await fetchDriverApi(`/driver/${id}/messages`);
      setMessages(Array.isArray(data) ? data : []);
      setUnreadMessages(
        data.filter((m: any) => 
          !m.is_read && m.sender_type === 'admin'
        ).length
      );
    } catch (error) { 
      console.error('Failed to load messages:', error);
      setMessages([]); 
    } finally {
      setIsMessagesLoading(false);
    }
  };

  const handleUpdateStatus = async (
    deliveryId: string, status: string, source?: string
  ) => {
    setIsStatusUpdating(deliveryId);
    try {
      const endpoint = source === 'legacy'
        ? `/driver-deliveries/${deliveryId}/status`
        : `/deliveries/${deliveryId}/status`;
      await fetchDriverApi(endpoint, {
        method: 'PUT',
        body: JSON.stringify({ status })
      });
      if (driver) loadDeliveries(driver.id);
    } catch (error) {
      console.error('Failed to update delivery status:', error);
      alert('Failed to update status');
    } finally {
      setIsStatusUpdating(null);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !driver) return;
    setIsSendingMessage(true);
    try {
      await fetchDriverApi('/driver/messages', {
        method: 'POST',
        body: JSON.stringify({
          driver_id: driver.id,
          driver_name: driver.full_name,
          sender_type: 'driver',
          message: newMessage
        })
      });
      setNewMessage('');
      loadMessages(driver.id);
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !driver) return;
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('driver_id', driver.id);
    formData.append('driver_name', driver.full_name);
    formData.append('sender_type', 'driver');
    
    try {
      const token = localStorage.getItem('driver_token');
      await fetch('/api/driver/messages/upload', {
        method: 'POST',
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
        body: formData
      });
      loadMessages(driver.id);
    } catch {
      alert('Failed to upload file');
    }
  };

  const handleLogout = () => {
    if (gpsIntervalRef.current) {
      clearInterval(gpsIntervalRef.current);
    }
    localStorage.removeItem('driver_session');
    localStorage.removeItem('driver_token');
    window.location.href = '/driver/login';
  };

  return (
    <ErrorBoundary fallback={<PageErrorFallback />}>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-40">
          <div>
            <p className="text-xs text-slate-400">KIMOEL DRIVER PORTAL</p>
            <p className="font-semibold text-sm">{driver?.full_name}</p>
          </div>
          <div className="flex items-center gap-3">
            {gpsActive && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-xs text-green-400">GPS Live</span>
              </div>
            )}
            <button onClick={handleLogout}
            className="p-2 rounded-lg hover:bg-slate-700">
            <LogOut className="size-5" />
          </button>
          </div>
        </div>

      {/* Nav */}
      <div className="bg-white border-b border-slate-200 px-4 flex">
        {[
          { id: 'deliveries', label: 'Deliveries', icon: Truck },
          { id: 'tracking', label: 'Tracking', icon: Navigation },
          { id: 'chat', label: 'Chat', icon: MessageSquare, badge: unreadMessages },
        ].map(tab => (
          <button key={tab.id}
            onClick={() => setView(tab.id as DriverView)}
            className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 transition-colors relative
              ${view === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500'
              }`}
          >
            <tab.icon className="size-4" />
            {tab.label}
            {tab.badge && tab.badge > 0 && (
              <span className="absolute top-1 
                right-0 bg-red-500 text-white 
                text-xs rounded-full w-4 h-4 
                flex items-center justify-center">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">

        {/* TRACKING VIEW */}
        {view === 'tracking' && (
          <div className="p-4 space-y-4">
            {/* Vehicle Info Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              {isVehicleLoading ? (
                <div className="flex justify-center p-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <Truck className="size-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Assigned Vehicle</p>
                      {assignedVehicle ? (
                        <>
                          <p className="font-bold text-slate-900">{assignedVehicle.unit_name}</p>
                          <p className="text-xs text-slate-500">{assignedVehicle.plate_number}</p>
                        </>
                      ) : (
                        <p className="text-sm text-slate-400 italic">No vehicle assigned yet</p>
                      )}
                    </div>
                  </div>
                  {assignedVehicle && (
                    <div className="bg-slate-50 rounded-lg p-3 flex items-center gap-3">
                      <Gauge className="size-5 text-slate-500" />
                      <div>
                        <p className="text-xs text-slate-500">Current Odometer</p>
                        <p className="text-lg font-bold text-slate-900">
                          {parseFloat(assignedVehicle.current_odometer || 0).toLocaleString('en-PH', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* GPS Control Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700 mb-3">GPS Tracking</p>
              {gpsActive ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                    <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-sm font-medium text-green-700">Tracking Active</span>
                    {currentSpeed !== null && (
                      <span className="ml-auto text-sm font-bold text-green-700">{currentSpeed} km/h</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 text-center">Sending location every 15 seconds</p>
                  <button
                    onClick={stopGPS}
                    className="w-full py-3 bg-red-600 text-white font-semibold rounded-xl flex items-center justify-center gap-2"
                  >
                    <NavigationOff className="size-5" />
                    Stop Tracking
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                    <div className="w-2.5 h-2.5 bg-slate-400 rounded-full" />
                    <span className="text-sm text-slate-500">Tracking Inactive</span>
                  </div>
                  {!assignedVehicle && (
                    <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg">⚠️ No vehicle assigned. Ask your admin to assign you a vehicle first.</p>
                  )}
                  <button
                    onClick={() => driver && startGPS(driver)}
                    className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl flex items-center justify-center gap-2"
                  >
                    <Navigation className="size-5" />
                    Start Tracking
                  </button>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="bg-blue-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-blue-800 mb-1">How it works</p>
              <p className="text-xs text-blue-700">Your GPS location is sent to admin every 15 seconds. Distance is automatically calculated and added to your vehicle's odometer.</p>
            </div>
          </div>
        )}


        {/* DELIVERIES VIEW */}
        {view === 'deliveries' && (
          <div className="p-4 space-y-4">
            {deliveries.length === 0 ? (
              <div className="text-center py-16">
                <Truck className="size-14 
                  text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">
                  No deliveries assigned yet
                </p>
              </div>
            ) : isDeliveriesLoading ? (
    <div className="flex justify-center p-4">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
    </div>
  ) : deliveries.map(delivery => (
              <div key={delivery.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-bold text-slate-900">
                      {delivery.delivery_number}
                    </p>
                    <p className="text-sm text-slate-600">{delivery.customer_name}</p>
                    {delivery.vehicle_name && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        🚗 {delivery.vehicle_name} · {delivery.plate_number}
                      </p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full text-white font-medium ${
                    DELIVERY_STATUSES.find(s => s.key === delivery.status)?.color || 'bg-slate-400'
                  }`}>
                    {delivery.status}
                  </span>
                </div>

                <div className="bg-slate-50 rounded-lg p-3 mb-3">
                  <div className="flex items-start gap-2">
                    <MapPin className="size-4 text-slate-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-slate-700">
                      {delivery.delivery_address
                        ? delivery.delivery_address
                            .split(/Contact:|Prepared By:|Line Items:/)[0]
                            .trim()
                        : 'No address provided'}
                    </p>
                  </div>
                </div>

                {delivery.items && (
                  <p className="text-xs text-slate-500 mb-3">Items: {delivery.items}</p>
                )}

                {/* Status Update Buttons */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-700">Update Status:</p>
                  <div className="flex flex-wrap gap-2">
                    {DELIVERY_STATUSES.map(status => (
                      <button
                        key={status.key}
                        onClick={() => handleUpdateStatus(delivery.id, status.key, delivery.source)}
                        disabled={isStatusUpdating !== null}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                          isStatusUpdating === delivery.id ? 'opacity-50 cursor-not-allowed' :
                          delivery.status === status.key
                            ? `${status.color} text-white`
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {delivery.status === status.key && <CheckCircle className="size-3 inline mr-1" />}
                        {status.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CHAT VIEW */}
        {view === 'chat' && (
          <div className="flex flex-col h-full"
            style={{ height: 'calc(100vh - 120px)'}}>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto 
              p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="size-12 
                    text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm">
                    No messages yet. 
                    Say hi to your admin!
                  </p>
                </div>
              ) : isMessagesLoading ? (
    <div className="flex justify-center p-4">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
    </div>
  ) : messages.map(msg => (
                <div key={msg.id}
                  className={`flex 
                    ${msg.sender_type === 'driver' 
                      ? 'justify-end' 
                      : 'justify-start'
                    }`}>
                  <div className={`max-w-[85%] sm:max-w-[80%] rounded-2xl px-4 py-2 ${
                    msg.sender_type === 'driver'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-white border border-slate-200 text-slate-900 rounded-bl-sm'
                  }`}>
                    {msg.image_url && (
                      <img
                        src={msg.image_url}
                        className="rounded-lg mb-2 
                          max-w-full"
                        alt="attachment"
                      />
                    )}
                    {msg.file_url && (
                      <a
                        href={msg.file_url}
                        target="_blank"
                        className={`text-xs underline block mb-1 ${
                          msg.sender_type === 'driver'
                            ? 'text-blue-200'
                            : 'text-blue-600'
                        }`}
                      >
                        📎 {msg.file_name}
                      </a>
                    )}
                    {msg.message && (
                      <p className="text-sm">
                        {msg.message}
                      </p>
                    )}
                    <p className={`text-xs mt-1 ${
                      msg.sender_type === 'driver'
                        ? 'text-blue-200'
                        : 'text-slate-400'
                    }`}>
                      {new Date(msg.created_at)
                        .toLocaleTimeString('en-PH', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="bg-white border-t 
              border-slate-200 p-3 flex 
              items-end gap-2">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*,.pdf,.doc,.docx"
                onChange={handleFileUpload}
              />
              <button
                onClick={() => 
                  fileInputRef.current?.click()
                }
                className="p-2 rounded-lg 
                  text-slate-500 
                  hover:bg-slate-100"
              >
                <Paperclip className="size-5" />
              </button>
              <input
                type="text"
                placeholder="Type a message..."
                className="flex-1 bg-slate-50 
                  rounded-xl px-4 py-2 text-sm 
                  outline-none border 
                  border-slate-200"
                value={newMessage}
                onChange={e => 
                  setNewMessage(e.target.value)
                }
                onKeyPress={e => {
                  if (e.key === 'Enter') 
                    handleSendMessage();
                }}
              />
              <button
                onClick={handleSendMessage}
                disabled={!newMessage.trim() || isSendingMessage}
                className="p-2 bg-blue-600 text-white rounded-xl disabled:opacity-50"
              >
                {isSendingMessage ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                ) : (
                  <Send className="size-5" />
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    </ErrorBoundary>
  );
}
