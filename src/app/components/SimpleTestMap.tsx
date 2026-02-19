import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { MapPin } from 'lucide-react';

export function SimpleTestMap() {
  console.log('[SimpleTestMap] Component loading');
  
  return (
    <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
      <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
        <CardTitle className="flex items-center gap-2 text-slate-900 font-semibold">
          <MapPin className="size-5 text-slate-600" />
          GPS Tracking Test Map
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-[500px] relative bg-blue-50 border-2 border-blue-500">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <MapPin className="size-16 mx-auto mb-4 text-blue-500" />
              <div className="text-lg font-semibold text-blue-900">Map Container Test</div>
              <div className="text-sm text-blue-700 mt-2">If you can see this, the component is working!</div>
              <div className="text-xs text-blue-600 mt-4">Next: Add OpenStreetMap iframe here</div>
            </div>
          </div>
        </div>
        
        <div className="border-t border-slate-100 p-4 bg-slate-50/50">
          <div className="text-sm text-slate-600">
            <div className="font-medium mb-2">Test Status:</div>
            <div className="space-y-1">
              <div>✅ Component rendering</div>
              <div>✅ Container visible</div>
              <div>✅ Ready for map integration</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
