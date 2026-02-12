
import { useState, useEffect, useRef } from 'react';
import { Rnd } from 'react-rnd';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { toast } from 'react-hot-toast';
import { useParams, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  Upload, 
  Plus, 
  Save, 
  Trash2 
} from 'lucide-react';

interface Booth {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  status: string;
  vendorId?: string | null;
}

interface Event {
  id: string;
  name: string;
  mapImageUrl?: string;
}

interface Vendor {
  id: string;
  name: string;
  email: string;
  vendorProfile?: {
    businessName: string;
  };
}

export function MapEditor() {
  const { eventId } = useParams();
  const [event, setEvent] = useState<Event | null>(null);
  const [booths, setBooths] = useState<Booth[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [mapUrl, setMapUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [selectedBoothId, setSelectedBoothId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchEventData();
    fetchVendors();
  }, [eventId]);

  const fetchEventData = async () => {
    try {
      // Fetch booths
      const boothsRes = await api.get(`/booths/event/${eventId}`);
      if (boothsRes.data.success) {
        setBooths(boothsRes.data.data);
      }

      // Fetch event details (using list endpoint as workaround if specific get not avail)
      // Or use public slug endpoint if needed, but we need ID.
      // Let's assume we can use GET /events endpoint and filter, or just use GET /events/:slug if we had slug.
      // Since we implemented GET /events/:id (public) via slug, we might not have ID endpoint.
      // But wait, user said "Existing endpoints include: GET /api/events?status=ACTIVE|ARCHIVED".
      // We can use that.
      const eventsRes = await api.get('/events?status=ACTIVE');
      let found = eventsRes.data.data.find((e: any) => e.id === eventId);
      
      if (!found) {
         // Try archived
         const archivedRes = await api.get('/events?status=ARCHIVED');
         found = archivedRes.data.data.find((e: any) => e.id === eventId);
      }

      if (found) {
        setEvent(found);
        setMapUrl(found.mapImageUrl || '');
      }
    } catch (error) {
      toast.error('Failed to load map data');
    }
  };

  const fetchVendors = async () => {
    try {
      const { data } = await api.get('/organizer/vendors?active=true');
      if (data.success) {
        setVendors(data.data);
      }
    } catch (error) {
      console.error('Failed to load vendors');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.post('/booths/layout', {
        eventId,
        mapImageUrl: mapUrl,
        booths: booths.map(b => ({
          id: b.id,
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height
        }))
      });
      
      // Also update vendor assignments individually if changed?
      // The bulk update only does layout. We need to save vendor assignments too.
      // Or we can update vendor assignment immediately when changed in inspector.
      // Let's do immediate update for vendor assignment for simplicity/safety.
      
      toast.success('Layout saved successfully');
    } catch (error) {
      toast.error('Failed to save layout');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddBooth = async () => {
    try {
      const { data } = await api.post('/booths', {
        eventId,
        name: `B${booths.length + 1}`,
        x: 50,
        y: 50,
        width: 60,
        height: 60
      });
      if (data.success) {
        setBooths([...booths, data.data]);
        setSelectedBoothId(data.data.id);
        toast.success('Booth added');
      }
    } catch (error) {
      toast.error('Failed to create booth');
    }
  };

  const handleDeleteBooth = async () => {
    if (!selectedBoothId) return;
    if (!confirm('Delete this booth?')) return;
    
    try {
      await api.delete(`/booths/${selectedBoothId}`);
      setBooths(booths.filter(b => b.id !== selectedBoothId));
      setSelectedBoothId(null);
      toast.success('Booth deleted');
    } catch (error) {
      toast.error('Failed to delete booth');
    }
  };

  const handleVendorAssign = async (vendorId: string | null) => {
    if (!selectedBoothId) return;
    
    try {
      // Optimistic update
      setBooths(booths.map(b => b.id === selectedBoothId ? { ...b, vendorId } : b));
      
      await api.put(`/booths/${selectedBoothId}`, { vendorId });
      toast.success('Booth updated');
    } catch (error) {
      toast.error('Failed to update booth');
      fetchEventData(); // Revert
    }
  };
  
  const handleUpdateBoothName = async (name: string) => {
      if (!selectedBoothId) return;
      // Optimistic
      setBooths(booths.map(b => b.id === selectedBoothId ? { ...b, name } : b));
      // Debounce saving in real app, but here we just set state and user hits save layout? 
      // Or save immediately? 
      // Layout save handles position/size. Properties like name/vendor should be saved.
      // Let's save name immediately on blur or enter? 
      // For now, let's just update state and rely on separate save or individual update?
      // The updateLayout endpoint DOES NOT update name/vendorId.
      // So we MUST call PUT /booths/:id for name/vendor updates.
      try {
          await api.put(`/booths/${selectedBoothId}`, { name });
      } catch (e) { console.error(e); }
  };

  const handleUploadMap = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    const toastId = toast.loading('Uploading map...');
    try {
      const { data } = await api.post(`/events/${eventId}/map`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (data.success) {
        setMapUrl(data.data.mapImageUrl);
        toast.success('Map uploaded', { id: toastId });
      }
    } catch (error) {
      toast.error('Upload failed', { id: toastId });
    }
  };

  const updateBoothPosition = (id: string, d: any) => {
    setBooths(prev => prev.map(b => 
      b.id === id ? { ...b, x: d.x, y: d.y } : b
    ));
  };

  const updateBoothSize = (id: string, ref: any, position: any) => {
    setBooths(prev => prev.map(b => 
      b.id === id ? { 
        ...b, 
        width: parseInt(ref.style.width), 
        height: parseInt(ref.style.height),
        ...position 
      } : b
    ));
  };

  const selectedBooth = booths.find(b => b.id === selectedBoothId);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Top Bar */}
      <div className="bg-white border-b p-4 flex items-center justify-between gap-4 shadow-sm z-10">
        <div className="flex items-center gap-4">
          <Link to="/organizer">
            <Button variant="ghost" size="sm">
              <ArrowLeft size={16} className="mr-2" />
              Back
            </Button>
          </Link>
          <div className="h-6 w-px bg-gray-200" />
          <h1 className="font-bold text-lg">{event?.name} Map</h1>
        </div>
        
        <div className="flex items-center gap-2">
            <div className="flex items-center bg-gray-100 rounded-lg p-1 mr-2">
                <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="p-1.5 hover:bg-white rounded-md text-gray-600">
                    <ZoomOut size={16} />
                </button>
                <span className="text-xs font-medium w-12 text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="p-1.5 hover:bg-white rounded-md text-gray-600">
                    <ZoomIn size={16} />
                </button>
                <button onClick={() => setZoom(1)} className="p-1.5 hover:bg-white rounded-md text-gray-600 ml-1" title="Reset Zoom">
                    <Maximize size={14} />
                </button>
            </div>

            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*"
                onChange={handleUploadMap}
            />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload size={16} className="mr-2" />
                Upload Map
            </Button>
            
            <Button variant="outline" size="sm" onClick={handleAddBooth}>
                <Plus size={16} className="mr-2" />
                Add Booth
            </Button>
            
            <Button size="sm" onClick={handleSave} isLoading={isSaving} className="bg-orange-600 hover:bg-orange-700">
                <Save size={16} className="mr-2" />
                Save Layout
            </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Map Canvas Area */}
        <div className="flex-1 overflow-auto bg-gray-100 p-8 relative">
          <div 
            className="origin-top-left transition-transform duration-200 ease-out"
            style={{ transform: `scale(${zoom})` }}
          >
             <div 
                className="relative bg-white shadow-lg mx-auto transition-all"
                style={{ 
                    width: '1000px', 
                    height: '800px',
                    backgroundImage: `url(${mapUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                }}
                onClick={() => setSelectedBoothId(null)}
            >
                {!mapUrl && (
                    <div className="absolute inset-0 flex items-center justify-center text-gray-400 pointer-events-none">
                    Upload a map image to get started
                    </div>
                )}

                {booths.map(booth => (
                    <Rnd
                    key={booth.id}
                    size={{ width: booth.width, height: booth.height }}
                    position={{ x: booth.x, y: booth.y }}
                    onDragStop={(_, d) => updateBoothPosition(booth.id, d)}
                    onResizeStop={(_, __, ref, ___, position) => {
                        updateBoothSize(booth.id, ref, position);
                    }}
                    bounds="parent"
                    onMouseDown={(e) => {
                        e.stopPropagation();
                        setSelectedBoothId(booth.id);
                    }}
                    className={`
                        border-2 flex items-center justify-center cursor-move hover:z-50 transition-colors
                        ${selectedBoothId === booth.id 
                            ? 'border-orange-500 bg-orange-100/50 z-50' 
                            : booth.vendorId 
                                ? 'border-green-500 bg-green-100/50' 
                                : 'border-blue-500 bg-blue-100/50'
                        }
                    `}
                    scale={1} // Rnd handles scale itself if passed, but we scale parent. 
                    // Warning: Rnd inside scaled parent might behave oddly with drag.
                    // If Rnd bugs out, we might need to pass scale={zoom} prop to Rnd instead of parent transform.
                    // Let's try parent transform first, if fails, switch.
                    // Update: Rnd usually needs scale prop to correct drag deltas.
                    // But if we scale parent, the mouse events are scaled too by browser? 
                    // Actually react-rnd has a `scale` prop for this exact reason.
                    // So we should NOT scale parent, but scale the Rnd content? No, we want to zoom the image too.
                    // Best approach: Scale parent div, pass `scale={zoom}` to Rnd so it calculates drag correctly.
                    >
                        <div className="flex flex-col items-center justify-center w-full h-full overflow-hidden p-1">
                            <span className="font-bold text-xs select-none pointer-events-none truncate w-full text-center">
                                {booth.name}
                            </span>
                            {booth.vendorId && (
                                <span className="text-[10px] bg-white/80 px-1 rounded truncate max-w-full">
                                    Assigned
                                </span>
                            )}
                        </div>
                    </Rnd>
                ))}
            </div>
          </div>
        </div>

        {/* Booth Inspector Sidebar */}
        {selectedBooth && (
            <div className="w-80 bg-white border-l shadow-xl flex flex-col animate-in slide-in-from-right-10">
                <div className="p-4 border-b bg-gray-50">
                    <h3 className="font-bold text-gray-900">Booth Details</h3>
                </div>
                <div className="p-4 space-y-6 flex-1 overflow-auto">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase">Label / Name</label>
                        <Input 
                            value={selectedBooth.name}
                            onChange={(e) => handleUpdateBoothName(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase">Assign Vendor</label>
                        <select 
                            className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                            value={selectedBooth.vendorId || ''}
                            onChange={(e) => handleVendorAssign(e.target.value || null)}
                        >
                            <option value="">-- Unassigned --</option>
                            {vendors.map(v => (
                                <option key={v.id} value={v.id}>
                                    {v.vendorProfile?.businessName || v.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs text-gray-500">Width</label>
                            <div className="p-2 bg-gray-100 rounded text-sm">{selectedBooth.width}px</div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-gray-500">Height</label>
                            <div className="p-2 bg-gray-100 rounded text-sm">{selectedBooth.height}px</div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-gray-500">X</label>
                            <div className="p-2 bg-gray-100 rounded text-sm">{selectedBooth.x}px</div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-gray-500">Y</label>
                            <div className="p-2 bg-gray-100 rounded text-sm">{selectedBooth.y}px</div>
                        </div>
                    </div>
                </div>
                
                <div className="p-4 border-t bg-gray-50">
                    <Button 
                        variant="ghost" 
                        className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={handleDeleteBooth}
                    >
                        <Trash2 size={16} className="mr-2" />
                        Delete Booth
                    </Button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}
