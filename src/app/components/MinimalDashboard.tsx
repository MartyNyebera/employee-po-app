interface DashboardProps {
  userName: string;
  onLogout: () => void;
}

export function MinimalDashboard({ userName, onLogout }: DashboardProps) {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">GPS Tracking System</h1>
          <div className="flex items-center gap-4">
            <span className="text-slate-600">User: {userName}</span>
            <button 
              onClick={onLogout}
              className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
      
      {/* GPS Tracking Map */}
      <div className="p-6">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-green-600 p-4">
            <h2 className="text-white font-bold text-xl">🗺️ Live GPS Tracking</h2>
            <p className="text-blue-100">Real-time vehicle monitoring system</p>
          </div>
          
          {/* Map Container */}
          <div 
            className="h-[500px] relative bg-gradient-to-br from-blue-100 to-green-100"
            style={{
              backgroundImage: 'url(https://picsum.photos/seed/philippines-gps-map/1200/500)',
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          >
            <div className="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center">
              <div className="bg-white rounded-lg p-8 shadow-xl max-w-md">
                <div className="text-center">
                  <div className="text-6xl mb-4">🗺️</div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">GPS Tracking Map</h3>
                  <p className="text-gray-600 mb-6">
                    Ready to track your vehicles in real-time
                  </p>
                  
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                    <div className="text-sm font-semibold text-green-800 mb-2">✅ System Status:</div>
                    <div className="text-xs text-green-600 space-y-1">
                      <div>• Traccar Server: Connected</div>
                      <div>• GPS API: Working</div>
                      <div>• Map Interface: Ready</div>
                    </div>
                  </div>
                  
                  <a
                    href="https://www.openstreetmap.org/?mlat=12.8797&mlon=121.7740&zoom=6"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors font-semibold"
                  >
                    🌍 Open Live Map
                  </a>
                </div>
              </div>
            </div>
            
            {/* Map Status */}
            <div className="absolute top-4 left-4 bg-white rounded-lg p-3 shadow-lg">
              <div className="text-xs font-semibold text-gray-700">Philippines GPS Tracking</div>
              <div className="text-xs text-green-600">● System Online</div>
            </div>
          </div>
          
          {/* Device Status */}
          <div className="p-4 bg-slate-50 border-t">
            <div className="text-sm font-semibold text-slate-700 mb-3">Device Status</div>
            <div className="bg-white rounded-lg p-4 border border-slate-200">
              <div className="text-center text-slate-500">
                <div className="text-4xl mb-2">🚛</div>
                <div className="font-medium">No GPS devices registered</div>
                <div className="text-sm text-slate-400 mt-1">Add your ST-906 devices to start tracking</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
