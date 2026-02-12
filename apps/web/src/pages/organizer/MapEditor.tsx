
import { useState, useEffect, useRef, useCallback } from 'react';
import { api, API_ORIGIN } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { toast } from 'react-hot-toast';
import { useParams, useNavigate } from 'react-router-dom';
import { MapCanvas } from '../../components/map/MapCanvas';
import { 
  ArrowLeft, 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  Upload, 
  Plus, 
  Trash2,
  Check,
  Link as LinkIcon,
  Image as ImageIcon
} from 'lucide-react';
import debounce from 'lodash.debounce';

interface Booth {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  status: string;
  vendorId?: string | null;
  vendor?: {
    businessName: string;
  };
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
  const navigate = useNavigate();
  const [event, setEvent] = useState<Event | null>(null);
  const [booths, setBooths] = useState<Booth[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  
  // Map State
  const [mapUrl, setMapUrl] = useState('');
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDraggingMap, setIsDraggingMap] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  
  // UI State
  const [selectedBoothId, setSelectedBoothId] = useState<string | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadTab, setUploadTab] = useState<'static' | 'url'>('static');
  
  // Sample static maps
  const STATIC_MAPS = [
    { name: 'Singapore Food Fest 2026', url: '/maps/sg-food-fest-2026.jpg' },
    { name: 'Expo Hall 1 Layout', url: '/maps/expo-hall-1.jpg' },
    { name: 'Outdoor Market', url: '/maps/outdoor-market.jpg' },
  ];

  const [urlInput, setUrlInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchEventData();
    fetchVendors();
    
    // Auto-fit logic on load would go here, but we need image dimensions first.
    // For now, center it.
    centerMap();
  }, [eventId]);

  // Debounced Save for auto-save
  const debouncedSaveBooth = useCallback(
    debounce(async (id: string, data: Partial<Booth>) => {
      try {
        await api.put(`/booths/${id}`, data);
        setHasUnsavedChanges(false);
      } catch (error) {
        console.error('Auto-save failed', error);
        toast.error('Auto-save failed');
      }
    }, 500),
    []
  );

  const fetchEventData = async () => {
    try {
      const boothsRes = await api.get(`/booths/event/${eventId}`);
      if (boothsRes.data.success) {
        setBooths(boothsRes.data.data);
      }

      const eventsRes = await api.get('/events?status=ACTIVE');
      let found = eventsRes.data.data.find((e: any) => e.id === eventId);
      
      if (!found) {
         const archivedRes = await api.get('/events?status=ARCHIVED');
         found = archivedRes.data.data.find((e: any) => e.id === eventId);
      }

      if (found) {
        setEvent(found);
        
        // Resolve URL immediately for state
        const rawUrl = found.mapImageUrl || '';
        const resolvedUrl = rawUrl.startsWith('http') 
          ? rawUrl 
          : rawUrl.startsWith('/maps/') 
            ? rawUrl 
            : rawUrl.startsWith('/') 
              ? `${API_ORIGIN}${rawUrl}`
              : rawUrl;
            
        setMapUrl(resolvedUrl);
        setUrlInput(rawUrl); // Input keeps the raw value (relative or absolute)
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

  const centerMap = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 }); // In real implementation, calculate center based on container size
  };

  const handleZoom = (delta: number) => {
    setZoom(prev => Math.min(3, Math.max(0.4, prev + delta)));
  };

  const [isPanning, setIsPanning] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsPanning(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsPanning(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handleMapPointerDown = (e: React.PointerEvent) => {
    // Start panning if Space is held OR middle mouse button (button 1)
    if (isPanning || e.button === 1) {
       setIsDraggingMap(true);
       setLastMousePos({ x: e.clientX, y: e.clientY });
       (e.target as HTMLElement).setPointerCapture(e.pointerId);
       e.preventDefault(); // Prevent default scroll/selection
    }
  };

  const handleMapPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingMap) return;
    const dx = e.clientX - lastMousePos.x;
    const dy = e.clientY - lastMousePos.y;
    setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMapPointerUp = (e: React.PointerEvent) => {
    setIsDraggingMap(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };
  
  const handleFitMap = () => {
    // Simple fit logic: reset to 100% and center
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    // In future: calculate bounds of booths or image size to fit perfectly
  };

  // Booth Operations
  const handleAddBooth = async () => {
    try {
      const { data } = await api.post('/booths', {
        eventId,
        name: `B${booths.length + 1}`,
        x: 100, // Default positions
        y: 100,
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

  const updateBoothLocally = (id: string, data: Partial<Booth>) => {
    setBooths(prev => prev.map(b => b.id === id ? { ...b, ...data } : b));
    setHasUnsavedChanges(true);
    debouncedSaveBooth(id, data);
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
    
    // Find vendor details for UI update
    const vendor = vendors.find(v => v.id === vendorId);
    const vendorName = vendor?.vendorProfile?.businessName || vendor?.name;

    // Optimistic Update
    setBooths(prev => prev.map(b => 
      b.id === selectedBoothId ? { 
        ...b, 
        vendorId, 
        vendor: vendorId ? { businessName: vendorName || '' } : undefined 
      } : b
    ));

    try {
      await api.put(`/booths/${selectedBoothId}`, { vendorId });
      toast.success('Vendor assigned');
    } catch (error) {
      toast.error('Failed to assign vendor');
      fetchEventData(); // Revert
    }
  };

  // Map Upload
  const handleStaticMapSelect = async (url: string) => {
    setIsUploading(true);
    try {
      const { data } = await api.patch(`/events/${eventId}/map-url`, {
        mapImageUrl: url
      });
      if (data.success) {
        setMapUrl(url); // Local path works directly
        toast.success('Map updated');
        setIsUploadModalOpen(false);
      }
    } catch (error) {
      toast.error('Update failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleUrlUpload = async () => {
    if (!urlInput.startsWith('http')) {
      toast.error('Invalid URL');
      return;
    }

    setIsUploading(true);
    try {
      const { data } = await api.patch(`/events/${eventId}/map-url`, {
        mapImageUrl: urlInput
      });
      if (data.success) {
        setMapUrl(urlInput);
        toast.success('Map URL updated');
        setIsUploadModalOpen(false);
      }
    } catch (error) {
      toast.error('Update failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleBack = () => {
    toast.success('Layout saved');
    navigate('/organizer');
  };

  const selectedBooth = booths.find(b => b.id === selectedBoothId);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden">
      {/* Top Bar */}
      <div className="bg-white border-b px-4 py-2 flex items-center justify-between shadow-sm z-20 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ArrowLeft size={16} className="mr-2" />
            Back
          </Button>
          <div className="h-6 w-px bg-gray-200" />
          <h1 className="font-bold text-lg truncate max-w-[200px]">{event?.name} Map</h1>
          <div className="flex items-center gap-2 ml-4">
             {hasUnsavedChanges ? (
               <span className="text-xs text-orange-500 animate-pulse">Saving...</span>
             ) : (
               <span className="text-xs text-green-600 flex items-center">
                 <Check size={12} className="mr-1" /> All changes saved
               </span>
             )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
            <div className="flex items-center bg-gray-100 rounded-lg p-1 mr-2">
                <button onClick={() => handleZoom(-0.1)} className="p-1.5 hover:bg-white rounded-md text-gray-600">
                    <ZoomOut size={16} />
                </button>
                <span className="text-xs font-medium w-12 text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => handleZoom(0.1)} className="p-1.5 hover:bg-white rounded-md text-gray-600">
                    <ZoomIn size={16} />
                </button>
                <button onClick={handleFitMap} className="p-1.5 hover:bg-white rounded-md text-gray-600 ml-1" title="Fit Map">
                    <Maximize size={14} />
                </button>
            </div>

            <Button variant="outline" size="sm" onClick={() => setIsUploadModalOpen(true)}>
                <Upload size={16} className="mr-2" />
                Map Image
            </Button>
            
            <Button size="sm" onClick={handleAddBooth} className="bg-orange-600 hover:bg-orange-700">
                <Plus size={16} className="mr-2" />
                Add Booth
            </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Canvas Container */}
        <div 
          ref={mapContainerRef}
          className={`flex-1 bg-gray-100 overflow-hidden relative ${isPanning ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
          onPointerDown={handleMapPointerDown}
          onPointerMove={handleMapPointerMove}
          onPointerUp={handleMapPointerUp}
          onPointerLeave={handleMapPointerUp}
          style={{ touchAction: 'none' }}
          onWheel={(e) => {
             // Always zoom on wheel, no modifier needed for better UX? 
             // Or keep ctrl requirement? User asked for "Zoom: mouse wheel zoom in/out". 
             // Usually mapping apps zoom on scroll.
             // Let's enable direct zoom.
             e.preventDefault();
             handleZoom(e.deltaY > 0 ? -0.1 : 0.1);
          }}
        >
          <div className="absolute inset-0 pointer-events-none">
             <MapCanvas 
               mapImageUrl={mapUrl}
               booths={booths}
               scale={zoom}
               offset={offset}
               selectedBoothId={selectedBoothId}
               onBoothClick={(b) => setSelectedBoothId(b.id)}
               onBoothUpdate={updateBoothLocally}
               onBackgroundClick={() => setSelectedBoothId(null)}
             />
          </div>
        </div>

        {/* Booth Inspector Sidebar */}
        {selectedBooth && (
            <div className="w-80 bg-white border-l shadow-xl flex flex-col z-30 shrink-0 h-full">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                    <h3 className="font-bold text-gray-900">Booth Details</h3>
                    <button onClick={() => setSelectedBoothId(null)} className="text-gray-400 hover:text-gray-600">
                      &times;
                    </button>
                </div>
                <div className="p-4 space-y-6 flex-1 overflow-y-auto">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase">Label</label>
                        <Input 
                            value={selectedBooth.name}
                            onChange={(e) => updateBoothLocally(selectedBooth.id, { name: e.target.value })}
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
                            <Input 
                              type="number" 
                              value={selectedBooth.width} 
                              onChange={(e) => updateBoothLocally(selectedBooth.id, { width: parseInt(e.target.value) || 0 })}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-gray-500">Height</label>
                            <Input 
                              type="number" 
                              value={selectedBooth.height} 
                              onChange={(e) => updateBoothLocally(selectedBooth.id, { height: parseInt(e.target.value) || 0 })}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-gray-500">X</label>
                            <Input 
                              type="number" 
                              value={selectedBooth.x} 
                              onChange={(e) => updateBoothLocally(selectedBooth.id, { x: parseInt(e.target.value) || 0 })}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-gray-500">Y</label>
                            <Input 
                              type="number" 
                              value={selectedBooth.y} 
                              onChange={(e) => updateBoothLocally(selectedBooth.id, { y: parseInt(e.target.value) || 0 })}
                            />
                        </div>
                    </div>
                </div>
                
                <div className="p-4 border-t bg-gray-50 mt-auto">
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

      {/* Upload Modal */}
      <Modal 
        isOpen={isUploadModalOpen} 
        onClose={() => setIsUploadModalOpen(false)}
        title="Update Map Image"
      >
        <div className="flex gap-2 mb-4 border-b">
          <button 
            className={`px-4 py-2 text-sm font-medium ${uploadTab === 'static' ? 'border-b-2 border-orange-500 text-orange-600' : 'text-gray-500'}`}
            onClick={() => setUploadTab('static')}
          >
            <div className="flex items-center gap-2">
              <ImageIcon size={16} /> Static Maps
            </div>
          </button>
          <button 
            className={`px-4 py-2 text-sm font-medium ${uploadTab === 'url' ? 'border-b-2 border-orange-500 text-orange-600' : 'text-gray-500'}`}
            onClick={() => setUploadTab('url')}
          >
            <div className="flex items-center gap-2">
              <LinkIcon size={16} /> External URL
            </div>
          </button>
        </div>

        <div className="mb-4 p-3 bg-blue-50 text-blue-800 text-xs rounded border border-blue-100">
          <strong>Note:</strong> We are using temporary static map hosting (`/public/maps`). 
          Backend uploads are disabled for this version. Later we will migrate to Cloudinary/S3.
        </div>

        {uploadTab === 'static' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {STATIC_MAPS.map((map) => (
                <div 
                  key={map.url}
                  className="border rounded-lg p-2 cursor-pointer hover:border-orange-500 hover:bg-orange-50 transition-all"
                  onClick={() => handleStaticMapSelect(map.url)}
                >
                  <div className="aspect-video bg-gray-100 rounded mb-2 overflow-hidden">
                    <img src={map.url} alt={map.name} className="w-full h-full object-cover" />
                  </div>
                  <p className="text-sm font-medium text-center">{map.name}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Image URL</label>
              <Input 
                placeholder="https://example.com/map.jpg" 
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleUrlUpload} isLoading={isUploading} disabled={!urlInput}>
                Update Map
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
