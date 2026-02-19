import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { MapPin, AlertCircle, Download } from 'lucide-react';
import { Button } from './ui/button';

export function LiveMapPlaceholder() {
  return (
    <Card className="border-slate-200 shadow-sm bg-white">
      <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
        <CardTitle className="flex items-center gap-2 text-slate-900 font-semibold">
          <MapPin className="size-5 text-slate-600" />
          Live GPS Tracking
        </CardTitle>
      </CardHeader>
      <CardContent className="p-8">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <div className="flex justify-center">
            <div className="size-20 rounded-full bg-blue-50 flex items-center justify-center">
              <Download className="size-10 text-blue-500" />
            </div>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              GPS Tracking Setup Required
            </h3>
            <p className="text-slate-600">
              To enable live GPS tracking, you need to install the required map libraries.
            </p>
          </div>

          <div className="bg-slate-50 rounded-lg p-6 text-left space-y-4">
            <div className="flex items-start gap-3">
              <div className="size-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-semibold shrink-0">
                1
              </div>
              <div>
                <div className="font-medium text-slate-900 mb-1">Install Map Libraries</div>
                <div className="text-sm text-slate-600 mb-2">
                  Run this command in your terminal:
                </div>
                <code className="block bg-slate-900 text-green-400 px-4 py-2 rounded text-sm font-mono">
                  npm install react-leaflet@4.2.1 @types/leaflet
                </code>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="size-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-semibold shrink-0">
                2
              </div>
              <div>
                <div className="font-medium text-slate-900 mb-1">Install Traccar Server</div>
                <div className="text-sm text-slate-600">
                  Download from{' '}
                  <a
                    href="https://www.traccar.org/download/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    traccar.org/download
                  </a>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="size-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-semibold shrink-0">
                3
              </div>
              <div>
                <div className="font-medium text-slate-900 mb-1">Configure Your ST-906</div>
                <div className="text-sm text-slate-600">
                  Send SMS commands to set server IP and reporting interval
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 rounded-lg text-left">
            <AlertCircle className="size-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <div className="font-semibold mb-1">Network Installation Issue</div>
              <div>
                The npm install failed due to network connectivity. Please check your internet connection
                and try again. See <code className="bg-amber-100 px-1 rounded">TRACCAR_SETUP.md</code> for
                detailed instructions.
              </div>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={() => window.open('/TRACCAR_SETUP.md', '_blank')}
            className="w-full"
          >
            View Full Setup Guide
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
