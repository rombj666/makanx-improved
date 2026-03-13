
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { api, API_ORIGIN } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { toast } from 'react-hot-toast';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
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
  Search,
  ChevronLeft,
  ChevronRight,
  Map as MapIcon
} from 'lucide-react';
import debounce from 'lodash.debounce';
import { setOrganizerSelectedEvent } from '../../lib/organizerSelectedEvent';

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
    id: string;
    businessName: string;
  };
}

export function MapEditor() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [event, setEvent] = useState<Event | null>(null);
  const [booths, setBooths] = useState<Booth[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  
  // Map State
  const [mapUrl, setMapUrl] = useState('');
  const [viewport, setViewport] = useState({ scale: 1, x: 0, y: 0 });
  const [centerRequestKey, setCenterRequestKey] = useState(0);
  
  // UI State
  const [selectedBoothId, setSelectedBoothId] = useState<string | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadTab, setUploadTab] = useState<'upload' | 'url'>('upload');
  
  // Sidebar State
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [boothSearch, setBoothSearch] = useState('');
  const [boothFilter, setBoothFilter] = useState<'ALL' | 'AVAILABLE' | 'OCCUPIED'>('ALL');
  
  const [urlInput, setUrlInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchEventData();
    fetchVendors();
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    setOrganizerSelectedEvent({ eventId });
  }, [eventId]);

  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setViewport((prev) => ({
        ...prev,
        scale: Math.min(4, Math.max(0.25, prev.scale + delta)),
      }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel as any);
  }, []);

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
      const { data } = await api.get('/organizer/vendors', { params: { active: true, eventId } });
      if (data.success) {
        setVendors(data.data);
      }
    } catch (error) {
      console.error('Failed to load vendors');
    }
  };

  const handleCenterMap = () => {
    setCenterRequestKey(k => k + 1);
  };

  const handleZoom = (delta: number) => {
    setViewport(prev => ({
        ...prev,
        scale: Math.min(4, Math.max(0.25, prev.scale + delta))
    }));
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
    // We iterate vendors to find one where vendorProfile.id matches the input
    const vendor = vendors.find(v => v.vendorProfile?.id === vendorId);
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

  // File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size too large (max 10MB)');
      e.target.value = ''; // Reset input
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const { data } = await api.post(`/organizer/events/${eventId}/map`, formData, {
        headers: {
          'Content-Type': undefined, // Force axios to let browser set multipart/form-data with boundary
        },
      });

      if (data.success) {
        setMapUrl(data.data.mapImageUrl);
        toast.success('Map uploaded successfully');
        setIsUploadModalOpen(false);
      }
    } catch (error: any) {
      console.error(error);
      const msg = error.response?.data?.message || 'Upload failed';
      toast.error(msg);
    } finally {
      setIsUploading(false);
      e.target.value = ''; // Reset input so same file can be selected again if needed
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
    navigate(`/organizer?eventId=${eventId || searchParams.get('eventId') || ''}`);
  };

  const selectedBooth = booths.find(b => b.id === selectedBoothId);

  const handleFixMap = async () => {
    setIsUploading(true);
    try {
      const fixedUrl = '/maps/sg-food-fest-2026.jpg';
      const { data } = await api.patch(`/events/${eventId}/map-url`, {
        mapImageUrl: fixedUrl
      });
      if (data.success) {
        setMapUrl(fixedUrl);
        setUrlInput(fixedUrl);
        toast.success('Map fixed to default');
      }
    } catch (error) {
      toast.error('Failed to fix map');
    } finally {
      setIsUploading(false);
    }
  };

  // Filtered Booths
  const filteredBooths = useMemo(() => {
    return booths.filter(b => {
      const matchesSearch = b.name.toLowerCase().includes(boothSearch.toLowerCase()) || 
                           (b.vendor?.businessName?.toLowerCase() || '').includes(boothSearch.toLowerCase());
      
      if (!matchesSearch) return false;
      
      if (boothFilter === 'AVAILABLE') return !b.vendorId && b.status !== 'OCCUPIED';
      if (boothFilter === 'OCCUPIED') return b.vendorId || b.status === 'OCCUPIED';
      
      return true;
    });
  }, [booths, boothSearch, boothFilter]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
      {/* Sticky Top Toolbar */}
      <div className="sticky top-0 z-50 bg-white border-b px-4 py-2 flex items-center justify-between shadow-sm shrink-0 h-14">
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
                <span className="text-xs font-medium w-12 text-center">{Math.round(viewport.scale * 100)}%</span>
                <button onClick={() => handleZoom(0.1)} className="p-1.5 hover:bg-white rounded-md text-gray-600">
                    <ZoomIn size={16} />
                </button>
                <button onClick={handleCenterMap} className="p-1.5 hover:bg-white rounded-md text-gray-600 ml-1" title="Center Map">
                    <Maximize size={14} />
                </button>
            </div>

            <Button variant="outline" size="sm" onClick={() => setIsUploadModalOpen(true)}>
                <MapIcon size={16} className="mr-2" />
                Map Image
            </Button>
            
            <Button size="sm" onClick={handleAddBooth} className="bg-orange-600 hover:bg-orange-700">
                <Plus size={16} className="mr-2" />
                Add Booth
            </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative w-full">
        {/* Left Collapsible Sidebar */}
        <div 
          className={`bg-white border-r flex flex-col transition-all duration-300 z-20 absolute md:relative h-full shadow-lg md:shadow-none ${
            sidebarOpen ? 'w-72 translate-x-0' : 'w-0 -translate-x-full md:w-0 md:translate-x-0 overflow-hidden'
          }`}
        >
          <div className="p-3 border-b flex items-center justify-between min-w-[18rem]">
            <h2 className="font-bold text-gray-800">Booths ({booths.length})</h2>
            <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 hover:bg-gray-100 rounded">
              <ChevronLeft size={18} />
            </button>
          </div>
          
          <div className="p-3 border-b space-y-3 min-w-[18rem]">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
              <Input 
                placeholder="Search booths..." 
                className="pl-8 h-9 text-sm"
                value={boothSearch}
                onChange={(e) => setBoothSearch(e.target.value)}
              />
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={() => setBoothFilter('ALL')}
                className={`px-2 py-1 text-xs rounded-full border ${boothFilter === 'ALL' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-300'}`}
              >
                All
              </button>
              <button 
                onClick={() => setBoothFilter('AVAILABLE')}
                className={`px-2 py-1 text-xs rounded-full border ${boothFilter === 'AVAILABLE' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}
              >
                Available
              </button>
              <button 
                onClick={() => setBoothFilter('OCCUPIED')}
                className={`px-2 py-1 text-xs rounded-full border ${boothFilter === 'OCCUPIED' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300'}`}
              >
                Occupied
              </button>
            </div>

            <div className="flex gap-3 text-[10px] text-gray-500 pt-1">
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-100 border border-blue-500"></div> Available</div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-100 border border-green-500"></div> Occupied</div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-orange-100 border border-orange-500"></div> Selected</div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-w-[18rem]">
            {filteredBooths.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">No booths found</div>
            ) : (
              <div className="divide-y">
                {filteredBooths.map(booth => {
                  const isOccupied = booth.vendorId || booth.status === 'OCCUPIED';
                  const isSelected = selectedBoothId === booth.id;
                  
                  return (
                    <div 
                      key={booth.id}
                      onClick={() => setSelectedBoothId(booth.id)}
                      className={`p-3 cursor-pointer hover:bg-gray-50 flex items-center justify-between transition-colors ${
                        isSelected ? 'bg-orange-50 border-l-4 border-orange-500' : 'border-l-4 border-transparent'
                      }`}
                    >
                      <div>
                        <div className="font-medium text-sm text-gray-900">{booth.name}</div>
                        {booth.vendor ? (
                          <div className="text-xs text-gray-500 truncate max-w-[180px]">{booth.vendor.businessName}</div>
                        ) : (
                          <div className="text-xs text-gray-400 italic">Available</div>
                        )}
                      </div>
                      <div className={`w-2 h-2 rounded-full ${isOccupied ? 'bg-green-500' : 'bg-blue-500'}`} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Toggle (Visible when sidebar closed) */}
        {!sidebarOpen && (
          <button 
            onClick={() => setSidebarOpen(true)}
            className="absolute top-4 left-4 z-30 bg-white p-2 rounded shadow border hover:bg-gray-50"
          >
            <ChevronRight size={16} />
          </button>
        )}

        {/* Canvas Container */}
        <div 
          ref={mapContainerRef}
          className="flex-1 min-w-0 overflow-hidden relative h-full bg-gray-100"
        >
          <div className="absolute top-4 right-4 z-30 bg-white/95 backdrop-blur-md shadow-lg rounded-xl p-1 flex items-center">
            <button onClick={() => handleZoom(-0.1)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-700" aria-label="Zoom out">
              <ZoomOut size={16} />
            </button>
            <div className="text-xs font-semibold w-14 text-center text-gray-900">{Math.round(viewport.scale * 100)}%</div>
            <button onClick={() => handleZoom(0.1)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-700" aria-label="Zoom in">
              <ZoomIn size={16} />
            </button>
            <button onClick={handleCenterMap} className="p-2 hover:bg-gray-100 rounded-lg text-gray-700" aria-label="Fit to screen">
              <Maximize size={14} />
            </button>
          </div>
          {/* Removed pointer-events-none wrapper */}
          <div className="absolute inset-0">
             <MapCanvas 
               mapImageUrl={mapUrl}
               booths={booths}
               viewport={viewport}
               onViewportChange={setViewport}
               selectedBoothId={selectedBoothId}
               onBoothClick={(b) => setSelectedBoothId(b.id)}
               onBoothUpdate={updateBoothLocally}
               onBackgroundClick={() => setSelectedBoothId(null)}
               onFixMap={handleFixMap}
               centerRequestKey={centerRequestKey}
             />
          </div>
        </div>

        {/* Right Booth Inspector */}
        {selectedBooth && (
            <div className="w-80 bg-white border-l shadow-xl flex flex-col z-30 shrink-0 h-full absolute right-0 md:relative">
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
                                <option key={v.id} value={v.vendorProfile?.id || ''} disabled={!v.vendorProfile?.id}>
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
                        {/* Hidden X/Y fields as requested */}
                        {/* 
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
                        */}
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
            className={`px-4 py-2 text-sm font-medium ${uploadTab === 'upload' ? 'border-b-2 border-orange-500 text-orange-600' : 'text-gray-500'}`}
            onClick={() => setUploadTab('upload')}
          >
            <div className="flex items-center gap-2">
              <Upload size={16} /> Upload from Local
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
          <strong>Note:</strong> Uploaded images will be stored securely in Cloudinary.
        </div>

          {uploadTab === 'upload' ? (
            <div className="space-y-4 py-8 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer relative">
              <input 
                type="file" 
                accept="image/*" 
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
              <div className="bg-white p-3 rounded-full shadow-sm mb-2">
                <Upload size={24} className="text-orange-500" />
              </div>
              <p className="text-sm font-medium text-gray-700">Click to upload image</p>
              <p className="text-xs text-gray-500">JPG, PNG, WebP up to 10MB</p>
              {isUploading && <p className="text-xs text-orange-600 font-bold mt-2 animate-pulse">Uploading...</p>}
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
