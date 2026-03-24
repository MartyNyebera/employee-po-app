import { useState, useEffect, useRef } from 'react';
import { Truck, MapPin, Package, 
  MessageSquare, LogOut, Send,
  Image, Paperclip, CheckCircle } from 'lucide-react';

type DriverView = 'deliveries' | 'chat';

const DELIVERY_STATUSES = [
  { key: 'pickup', label: 'Pick Up', 
    color: 'bg-blue-500' },
  { key: 'on_the_way', label: 'On the Way', 
    color: 'bg-orange-500' },
  { key: 'delivered', label: 'Delivered', 
    color: 'bg-green-500' },
  { key: 'going_back', label: 'Going Back', 
    color: 'bg-purple-500' },
  { key: 'done', label: 'Done for Today', 
    color: 'bg-slate-500' },
];

export function DriverPortal() {
  const [view, setView] = useState
    <DriverView>('deliveries');
  const [driver, setDriver] = useState<any>(null);
  const [deliveries, setDeliveries] = useState
    <any[]>([]);
  const [messages, setMessages] = useState
    <any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [gpsActive, setGpsActive] = useState(false);
  const [unreadMessages, setUnreadMessages] = 
    useState(0);
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
    startGPS(session);
    
    // Poll messages every 10 seconds
    const msgInterval = setInterval(() => {
      loadMessages(session.id);
    }, 10000);

    return () => {
      clearInterval(msgInterval);
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

  const startGPS = (driverData: any) => {
    if (!navigator.geolocation) return;
    
    setGpsActive(true);
    
    const sendLocation = () => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            await fetch('/api/driver/location', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json' 
              },
              body: JSON.stringify({
                driver_id: driverData.id,
                driver_name: driverData.full_name,
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                speed: pos.coords.speed,
                heading: pos.coords.heading
              })
            });
          } catch {}
        },
        () => {},
        { 
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 10000
        }
      );
    };

    sendLocation();
    gpsIntervalRef.current = setInterval(
      sendLocation, 15000
    );
  };

  const loadDeliveries = async (id: number) => {
    try {
      const res = await fetch(
        `/api/driver/${id}/deliveries` 
      );
      const data = await res.json();
      setDeliveries(Array.isArray(data) ? data : []);
    } catch { setDeliveries([]); }
  };

  const loadMessages = async (id: number) => {
    try {
      const res = await fetch(
        `/api/driver/${id}/messages` 
      );
      const data = await res.json();
      setMessages(Array.isArray(data) ? data : []);
      setUnreadMessages(
        data.filter((m: any) => 
          !m.is_read && m.sender_type === 'admin'
        ).length
      );
    } catch { setMessages([]); }
  };

  const handleUpdateStatus = async (
    deliveryId: string, status: string
  ) => {
    try {
      await fetch(`/api/deliveries/${deliveryId}/status`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ status })
      });
      if (driver) loadDeliveries(driver.id);
    } catch {
      alert('Failed to update status');
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !driver) return;
    try {
      await fetch('/api/driver/messages', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          driver_id: driver.id,
          driver_name: driver.full_name,
          sender_type: 'driver',
          message: newMessage.trim()
        })
      });
      setNewMessage('');
      loadMessages(driver.id);
    } catch {
      alert('Failed to send message');
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
      await fetch('/api/driver/messages/upload', {
        method: 'POST',
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
    <div className="min-h-screen bg-slate-50 
      flex flex-col">
      {/* Header */}
      <div className="bg-slate-900 text-white 
        px-4 py-3 flex items-center 
        justify-between sticky top-0 z-40">
        <div>
          <p className="text-xs text-slate-400">
            KIMOEL DRIVER PORTAL
          </p>
          <p className="font-semibold text-sm">
            {driver?.full_name}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {gpsActive && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-green-400 
                rounded-full animate-pulse" />
              <span className="text-xs 
                text-green-400">GPS Live</span>
            </div>
          )}
          <button onClick={handleLogout}
            className="p-2 rounded-lg 
              hover:bg-slate-700">
            <LogOut className="size-5" />
          </button>
        </div>
      </div>

      {/* Nav */}
      <div className="bg-white border-b 
        border-slate-200 px-4 flex">
        {[
          { id: 'deliveries', label: 'Deliveries', 
            icon: Truck },
          { id: 'chat', label: 'Chat Admin', 
            icon: MessageSquare, 
            badge: unreadMessages },
        ].map(tab => (
          <button key={tab.id}
            onClick={() => setView(
              tab.id as DriverView
            )}
            className={`flex items-center gap-1.5 
              px-4 py-3 text-sm font-medium 
              border-b-2 transition-colors relative
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
            ) : deliveries.map(delivery => (
              <div key={delivery.id}
                className="bg-white rounded-xl 
                  border border-slate-200 p-4">
                <div className="flex justify-between 
                  items-start mb-3">
                  <div>
                    <p className="font-bold 
                      text-slate-900">
                      {delivery.delivery_number}
                    </p>
                    <p className="text-sm 
                      text-slate-600">
                      {delivery.customer_name}
                    </p>
                  </div>
                  <span className={`text-xs px-2 
                    py-1 rounded-full text-white
                    font-medium
                    ${DELIVERY_STATUSES.find(
                      s => s.key === delivery.status
                    )?.color || 'bg-slate-400'}`}>
                    {DELIVERY_STATUSES.find(
                      s => s.key === delivery.status
                    )?.label || delivery.status}
                  </span>
                </div>

                <div className="bg-slate-50 
                  rounded-lg p-3 mb-3">
                  <div className="flex items-start 
                    gap-2">
                    <MapPin className="size-4 
                      text-slate-500 mt-0.5 
                      flex-shrink-0" />
                    <p className="text-sm 
                      text-slate-700">
                      {delivery.delivery_address}
                    </p>
                  </div>
                </div>

                {delivery.items && (
                  <p className="text-xs 
                    text-slate-500 mb-3">
                    Items: {delivery.items}
                  </p>
                )}

                {/* Status Update Buttons */}
                <div className="space-y-2">
                  <p className="text-xs font-medium 
                    text-slate-700">
                    Update Status:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {DELIVERY_STATUSES.map(status => (
                      <button
                        key={status.key}
                        onClick={() => 
                          handleUpdateStatus(
                            delivery.id, status.key
                          )
                        }
                        className={`text-xs px-3 
                          py-1.5 rounded-lg font-medium
                          transition-all
                          ${delivery.status === status.key
                            ? `${status.color} text-white` 
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                      >
                        {delivery.status === status.key 
                          && (
                          <CheckCircle className="size-3 
                            inline mr-1" />
                        )}
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
              ) : messages.map(msg => (
                <div key={msg.id}
                  className={`flex 
                    ${msg.sender_type === 'driver' 
                      ? 'justify-end' 
                      : 'justify-start'
                    }`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${
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
                disabled={!newMessage.trim()}
                className="p-2 bg-blue-600 
                  text-white rounded-xl 
                  disabled:opacity-50"
              >
                <Send className="size-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
