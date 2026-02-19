import { useState, useEffect } from 'react';
import { fetchAssetById, updateAsset } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Alert, AlertDescription } from './ui/alert';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import {
  ChevronLeft,
  MapPin,
  Clock,
  Fuel,
  Battery,
  Gauge,
  AlertTriangle,
  Power,
  Wrench,
  TrendingUp,
  Navigation,
  Shield,
  Activity,
  Pencil,
} from 'lucide-react';
import { toast } from 'sonner';

interface AssetDetailsProps {
  assetId: string;
  onBack: () => void;
  isAdmin: boolean;
}

type AssetType = Awaited<ReturnType<typeof fetchAssetById>>;

function EditAssetDialog({
  asset,
  onSaved,
}: {
  asset: NonNullable<AssetType>;
  onSaved: (a: NonNullable<AssetType>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: asset.name,
    status: asset.status,
    location: asset.location,
    lat: asset.coordinates.lat,
    lng: asset.coordinates.lng,
    driver: asset.driver ?? '',
    lastUpdate: asset.lastUpdate ?? '',
    engineHours: asset.engineHours,
    idleTime: asset.idleTime,
    fuelLevel: asset.fuelLevel,
    batteryVoltage: asset.batteryVoltage,
    speed: asset.speed,
    inGeofence: asset.inGeofence,
    efficiencyScore: asset.efficiencyScore,
  });

  useEffect(() => {
    setForm({
      name: asset.name,
      status: asset.status,
      location: asset.location,
      lat: asset.coordinates.lat,
      lng: asset.coordinates.lng,
      driver: asset.driver ?? '',
      lastUpdate: asset.lastUpdate ?? '',
      engineHours: asset.engineHours,
      idleTime: asset.idleTime,
      fuelLevel: asset.fuelLevel,
      batteryVoltage: asset.batteryVoltage,
      speed: asset.speed,
      inGeofence: asset.inGeofence,
      efficiencyScore: asset.efficiencyScore,
    });
  }, [asset]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateAsset(asset.id, {
        name: form.name,
        status: form.status,
        location: form.location,
        lat: form.lat,
        lng: form.lng,
        driver: form.driver || undefined,
        lastUpdate: form.lastUpdate || undefined,
        engineHours: form.engineHours,
        idleTime: form.idleTime,
        fuelLevel: form.fuelLevel,
        batteryVoltage: form.batteryVoltage,
        speed: form.speed,
        inGeofence: form.inGeofence,
        efficiencyScore: form.efficiencyScore,
      });
      onSaved(updated);
      setOpen(false);
      toast.success('Asset updated');
    } catch (e) {
      toast.error('Failed to update asset');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <Pencil className="size-4 mr-2" />
          Edit tracking details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit asset details</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="idle">Idle</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Location</Label>
            <Input
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-2">
              <Label>Lat</Label>
              <Input
                type="number"
                step="any"
                value={form.lat}
                onChange={(e) => setForm((f) => ({ ...f, lat: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Lng</Label>
              <Input
                type="number"
                step="any"
                value={form.lng}
                onChange={(e) => setForm((f) => ({ ...f, lng: parseFloat(e.target.value) || 0 }))}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Driver</Label>
            <Input
              value={form.driver}
              onChange={(e) => setForm((f) => ({ ...f, driver: e.target.value }))}
              placeholder="Optional"
            />
          </div>
          <div className="grid gap-2">
            <Label>Last update (e.g. 2 min ago)</Label>
            <Input
              value={form.lastUpdate}
              onChange={(e) => setForm((f) => ({ ...f, lastUpdate: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-2">
              <Label>Engine hours</Label>
              <Input
                type="number"
                value={form.engineHours}
                onChange={(e) => setForm((f) => ({ ...f, engineHours: parseInt(e.target.value, 10) || 0 }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Idle time (min)</Label>
              <Input
                type="number"
                value={form.idleTime}
                onChange={(e) => setForm((f) => ({ ...f, idleTime: parseInt(e.target.value, 10) || 0 }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-2">
              <Label>Fuel %</Label>
              <Input
                type="number"
                value={form.fuelLevel}
                onChange={(e) => setForm((f) => ({ ...f, fuelLevel: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Battery (V)</Label>
              <Input
                type="number"
                step="0.1"
                value={form.batteryVoltage}
                onChange={(e) => setForm((f) => ({ ...f, batteryVoltage: parseFloat(e.target.value) || 0 }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-2">
              <Label>Speed (km/h)</Label>
              <Input
                type="number"
                value={form.speed}
                onChange={(e) => setForm((f) => ({ ...f, speed: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Efficiency %</Label>
              <Input
                type="number"
                value={form.efficiencyScore}
                onChange={(e) => setForm((f) => ({ ...f, efficiencyScore: parseInt(e.target.value, 10) || 0 }))}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="inGeofence"
              checked={form.inGeofence}
              onChange={(e) => setForm((f) => ({ ...f, inGeofence: e.target.checked }))}
              className="rounded"
            />
            <Label htmlFor="inGeofence">In geofence</Label>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? 'Saving...' : 'Save changes'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function AssetDetails({ assetId, onBack, isAdmin }: AssetDetailsProps) {
  const [asset, setAsset] = useState<Awaited<ReturnType<typeof fetchAssetById>>>(null);
  const [loading, setLoading] = useState(true);
  const [isImmobilized, setIsImmobilized] = useState(false);

  useEffect(() => {
    fetchAssetById(assetId).then((a) => {
      setAsset(a);
      setLoading(false);
    });
  }, [assetId]);

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[200px]">
        <div className="text-gray-500">Loading asset...</div>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription>Asset not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  const handleImmobilize = () => {
    setIsImmobilized(!isImmobilized);
    toast.success(
      isImmobilized 
        ? `${asset.name} has been re-enabled` 
        : `${asset.name} has been immobilized`,
      {
        description: isImmobilized 
          ? 'Engine can now be started' 
          : 'Remote kill switch activated',
      }
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500';
      case 'idle':
        return 'bg-yellow-500';
      case 'offline':
        return 'bg-gray-400';
      default:
        return 'bg-gray-400';
    }
  };

  const getEfficiencyColor = (score: number) => {
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getBatteryColor = (voltage: number) => {
    if (voltage >= 12.5) return 'text-green-600';
    if (voltage >= 11.8) return 'text-yellow-600';
    return 'text-red-600';
  };

  const estimatedFuelConsumption = (asset.engineHours * 12.5).toFixed(1); // Mock: 12.5L per hour
  const nextMaintenanceHours = Math.ceil(asset.engineHours / 250) * 250;
  const hoursUntilMaintenance = nextMaintenanceHours - asset.engineHours;

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ChevronLeft className="size-5" />
        </Button>
        <div className="flex-1">
          <h1 className="font-semibold text-lg">{asset.name}</h1>
          <p className="text-sm text-gray-500">{asset.id}</p>
        </div>
        <div className={`size-3 rounded-full ${getStatusColor(asset.status)}`} />
      </div>

      {/* Immobilization Alert */}
      {isImmobilized && (
        <Alert className="bg-red-50 border-red-200">
          <Power className="size-4 text-red-600" />
          <AlertDescription className="text-red-800">
            This asset is currently immobilized. Engine cannot be started.
          </AlertDescription>
        </Alert>
      )}

      {/* Admin Controls */}
      {isAdmin && (
        <Card className="border-slate-200 bg-slate-50/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="size-4" />
              Admin Controls
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <EditAssetDialog asset={asset} onSaved={(updated) => setAsset(updated)} />
            <Button
              variant={isImmobilized ? 'default' : 'destructive'}
              className="w-full"
              onClick={handleImmobilize}
            >
              <Power className="size-4 mr-2" />
              {isImmobilized ? 'Enable Engine' : 'Remote Immobilize'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Location & Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="size-4" />
            Location & Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="text-sm text-gray-500 mb-1">Current Location</div>
            <div className="font-medium">{asset.location}</div>
            <div className="text-xs text-gray-500 mt-1">
              {asset.coordinates.lat.toFixed(4)}°N, {asset.coordinates.lng.toFixed(4)}°E
            </div>
          </div>
          
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-2">
              <Navigation className="size-4 text-blue-500" />
              <span className="text-sm">Geofence Status</span>
            </div>
            <Badge variant={asset.inGeofence ? 'default' : 'destructive'}>
              {asset.inGeofence ? 'Inside Zone' : 'Outside Zone'}
            </Badge>
          </div>

          <div className="text-xs text-gray-400">
            Last updated: {asset.lastUpdate}
          </div>
        </CardContent>
      </Card>

      {/* Real-time Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="size-4" />
            Real-time Metrics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Gauge className="size-4 text-blue-500" />
                <span className="text-sm text-gray-500">Speed</span>
              </div>
              <div className="text-2xl font-semibold">{asset.speed}</div>
              <div className="text-xs text-gray-500">km/h</div>
            </div>
            
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="size-4 text-purple-500" />
                <span className="text-sm text-gray-500">Engine Hours</span>
              </div>
              <div className="text-2xl font-semibold">{asset.engineHours}</div>
              <div className="text-xs text-gray-500">total hours</div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Fuel className="size-4 text-orange-500" />
                <span className="text-sm text-gray-500">Fuel Level</span>
              </div>
              <span className="text-sm font-semibold">{asset.fuelLevel}%</span>
            </div>
            <Progress value={asset.fuelLevel} className="h-2" />
            {asset.fuelLevel < 20 && (
              <div className="text-xs text-orange-600 mt-1 flex items-center gap-1">
                <AlertTriangle className="size-3" />
                Low fuel warning
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Battery className="size-4 text-green-500" />
                <span className="text-sm text-gray-500">Battery Health</span>
              </div>
              <span className={`text-sm font-semibold ${getBatteryColor(asset.batteryVoltage)}`}>
                {asset.batteryVoltage}V
              </span>
            </div>
            {asset.batteryVoltage < 11.8 && (
              <div className="text-xs text-red-600 flex items-center gap-1">
                <AlertTriangle className="size-3" />
                Battery voltage critical
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Fuel & Idle Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Fuel className="size-4" />
            Fuel & Idle Monitoring
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-500 mb-1">Idle Time Today</div>
              <div className="text-xl font-semibold text-yellow-600">{asset.idleTime} min</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 mb-1">Est. Fuel Used</div>
              <div className="text-xl font-semibold">{estimatedFuelConsumption}L</div>
            </div>
          </div>
          
          {asset.idleTime > 60 && (
            <Alert className="bg-yellow-50 border-yellow-200">
              <AlertTriangle className="size-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800 text-sm">
                High idle time detected. Consider operator training to reduce fuel waste.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Efficiency Score */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="size-4" />
            Efficiency Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center">
            <div className={`text-5xl font-bold mb-2 ${getEfficiencyColor(asset.efficiencyScore)}`}>
              {asset.efficiencyScore}%
            </div>
            <div className="text-sm text-gray-500 mb-4">
              Based on speed, idle time, and utilization
            </div>
            <Progress value={asset.efficiencyScore} className="h-2" />
          </div>
          {asset.driver && (
            <div className="text-sm text-gray-600 mt-4 text-center">
              Operator: <span className="font-semibold">{asset.driver}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Maintenance Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="size-4" />
            Maintenance Schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="text-sm text-gray-500 mb-1">Next Service Due</div>
            <div className="font-semibold">{nextMaintenanceHours} engine hours</div>
            <div className="text-sm text-gray-600 mt-1">
              {hoursUntilMaintenance} hours remaining
            </div>
          </div>
          
          <div>
            <div className="text-sm text-gray-500 mb-2">Service Progress</div>
            <Progress 
              value={(hoursUntilMaintenance / 250) * 100} 
              className="h-2"
            />
          </div>

          {hoursUntilMaintenance < 50 && (
            <Alert className="bg-orange-50 border-orange-200">
              <Wrench className="size-4 text-orange-600" />
              <AlertDescription className="text-orange-800 text-sm">
                Maintenance due soon. Schedule service within {hoursUntilMaintenance} hours.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}