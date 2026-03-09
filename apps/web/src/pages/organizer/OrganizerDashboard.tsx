import { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { toast } from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { MapCanvas } from '../../components/map/MapCanvas';
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  BarChart3, 
  Menu, 
  Archive, 
  ArchiveRestore,
  Settings
} from 'lucide-react';

interface Event {
  id: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'ARCHIVED';
  mapImageUrl?: string;
}

import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Plus, MapPin, Calendar } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import * as htmlToImage from 'html-to-image';

export function OrganizerDashboard() {
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE');
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [booths, setBooths] = useState<any[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isDownloadingQr, setIsDownloadingQr] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  // Form state
  const [newEventName, setNewEventName] = useState('');
  const [newEventLocation, setNewEventLocation] = useState('');
  const [newEventStartDate, setNewEventStartDate] = useState('');

  useEffect(() => {
    fetchEvents();
  }, [activeTab]);

  useEffect(() => {
    if (selectedEventId) {
      fetchEventBooths(selectedEventId);  
    } else {
      setBooths([]);
    }
  }, [selectedEventId]);

  const fetchEvents = async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get(`/events?status=${activeTab}`);
      if (data.success) {
        setEvents(data.data);
        if (data.data.length > 0 && !selectedEventId) {
          // Only auto-select if we don't have one (or if refreshed list doesn't have it)
          if (!selectedEventId || !data.data.find((e: any) => e.id === selectedEventId)) {
             setSelectedEventId(data.data[0].id);
          }
        }
      }
    } catch (error) {
      toast.error('Failed to load events');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventName) return;

    setIsCreating(true);
    try {
      const { data } = await api.post('/events', {
        name: newEventName,
        location: newEventLocation || undefined,
        startDate: newEventStartDate || undefined,
        status: 'ACTIVE'
      });
      
      if (data.success) {
        toast.success('Event created successfully');
        setIsCreateModalOpen(false);
        setNewEventName('');
        setNewEventLocation('');
        setNewEventStartDate('');
        
        // Refresh events and select the new one
        await fetchEvents();
        setSelectedEventId(data.data.id);
        setActiveTab('ACTIVE'); // Ensure we are on active tab
      }
    } catch (error) {
      toast.error('Failed to create event');
    } finally {
      setIsCreating(false);
    }
  };


  const fetchEventBooths = async (id: string) => {
    try {
      const { data } = await api.get(`/booths/event/${id}`);
      if (data.success) {
        setBooths(data.data);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleArchive = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to archive this event?')) return;
    try {
      await api.patch(`/events/${id}/archive`);
      toast.success('Event archived');
      fetchEvents();
      if (selectedEventId === id) setSelectedEventId(null);
    } catch (error) {
      toast.error('Failed to archive event');
    }
  };

  const handleUnarchive = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to restore this event?')) return;
    try {
      await api.patch(`/events/${id}/unarchive`);
      toast.success('Event restored');
      fetchEvents();
      if (selectedEventId === id) setSelectedEventId(null);
    } catch (error) {
      toast.error('Failed to restore event');
    }
  };

  const selectedEvent = events.find(e => e.id === selectedEventId);
  const eventUrl = selectedEvent ? `${window.location.origin}/customer/${selectedEvent.slug}` : '';

  const downloadQR = async () => {
    if (!qrRef.current || !selectedEvent) return;
    setIsDownloadingQr(true);
    try {
      const dataUrl = await htmlToImage.toPng(qrRef.current, { cacheBust: true, pixelRatio: 2 });
      const link = document.createElement('a');
      link.download = `makanx-event-${selectedEvent.slug}-qr.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      toast.error('Failed to download QR code');
    } finally {
      setIsDownloadingQr(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-gray-50">
      {/* Header Actions */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            <Menu size={20} />
          </Button>
          <div className="flex flex-col">
            <h1 className="font-bold text-lg text-gray-900 leading-tight">
              {selectedEvent ? selectedEvent.name : 'Organizer Dashboard'}
            </h1>
            {selectedEvent && (
              <span className={`text-xs px-2 py-0.5 rounded-full w-fit ${
                selectedEvent.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {selectedEvent.status}
              </span>
            )}
          </div>
        </div>
        
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar relative">
          <Link to="/organizer/applications">
            <Button variant="outline" size="sm" className="whitespace-nowrap">
              <FileText size={16} className="mr-2" />
              Apps
            </Button>
          </Link>
          <Link to="/organizer/vendors">
            <Button variant="outline" size="sm" className="whitespace-nowrap">
              <Users size={16} className="mr-2" />
              Vendors
            </Button>
          </Link>
          <Link to="/organizer/sales">
            <Button variant="outline" size="sm" className="whitespace-nowrap">
              <BarChart3 size={16} className="mr-2" />
              Sales
            </Button>
          </Link>
          {selectedEvent && (
            <Button 
              size="sm" 
              variant="outline" 
              className="whitespace-nowrap"
              onClick={() => setIsQrModalOpen(true)}
            >
              Generate QR Code
            </Button>
          )}
          <Button 
            size="sm" 
            className="whitespace-nowrap bg-orange-600 hover:bg-orange-700"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus size={16} className="mr-2" />
            Create Event
          </Button>
          {selectedEvent && (
            <Link to={`/organizer/map/${selectedEvent.id}`}>
              <Button size="sm" variant="outline" className="whitespace-nowrap">
                <Settings size={16} className="mr-2" />
                Manage Booths
              </Button>
            </Link>
          )}
        </div>
      </div>

      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New Event"
      >
        <form onSubmit={handleCreateEvent} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Event Name *</label>
            <Input
              placeholder="e.g. Summer Food Fest 2026"
              value={newEventName}
              onChange={(e) => setNewEventName(e.target.value)}
              required
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Location (Optional)</label>
            <div className="relative">
              <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="e.g. Expo Hall 1"
                className="pl-9"
                value={newEventLocation}
                onChange={(e) => setNewEventLocation(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Start Date (Optional)</label>
            <div className="relative">
              <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                type="date"
                className="pl-9"
                value={newEventStartDate}
                onChange={(e) => setNewEventStartDate(e.target.value)}
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isCreating} disabled={!newEventName}>
              Create Event
            </Button>
          </div>
        </form>
      </Modal>
      {selectedEvent && (
        <Modal
          isOpen={isQrModalOpen}
          onClose={() => setIsQrModalOpen(false)}
          title="Event QR Code"
        >
          <div className="flex flex-col items-center gap-4">
            <div ref={qrRef} className="bg-white p-2 rounded">
              <QRCodeCanvas value={eventUrl} size={256} includeMargin />
            </div>
            <div className="text-xs break-all bg-gray-100 p-2 rounded border">
              {eventUrl}
            </div>
            <Button
              onClick={downloadQR}
              disabled={isDownloadingQr}
              className="w-full bg-black text-white hover:bg-gray-900"
            >
              Download QR Code
            </Button>
          </div>
        </Modal>
      )}

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar */}
        <div className={`
          absolute inset-y-0 left-0 w-72 bg-white border-r transform transition-transform duration-200 z-20
          lg:relative lg:translate-x-0
          ${isSidebarOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full'}
        `}>
          <div className="p-4 border-b">
            <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
              <button
                onClick={() => setActiveTab('ACTIVE')}
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${
                  activeTab === 'ACTIVE' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Active
              </button>
              <button
                onClick={() => setActiveTab('ARCHIVED')}
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${
                  activeTab === 'ARCHIVED' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Archived
              </button>
            </div>
          </div>

          <div className="overflow-y-auto h-full pb-20">
            {isLoading ? (
              <div className="p-8 text-center text-gray-500">Loading...</div>
            ) : events.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">No {activeTab.toLowerCase()} events found.</div>
            ) : (
              <div className="divide-y">
                {events.map(event => (
                  <div 
                    key={event.id}
                    onClick={() => { setSelectedEventId(event.id); setIsSidebarOpen(false); }}
                    className={`p-4 cursor-pointer hover:bg-orange-50 transition-colors group ${
                      selectedEventId === event.id ? 'bg-orange-50 border-l-4 border-orange-500' : 'border-l-4 border-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <span className="font-medium text-gray-900 line-clamp-1">{event.name}</span>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        {activeTab === 'ACTIVE' ? (
                          <button 
                            onClick={(e) => handleArchive(e, event.id)}
                            className="p-1.5 hover:bg-white rounded-md text-gray-500 hover:text-orange-600"
                            title="Archive"
                          >
                            <Archive size={16} />
                          </button>
                        ) : (
                          <button 
                            onClick={(e) => handleUnarchive(e, event.id)}
                            className="p-1.5 hover:bg-white rounded-md text-gray-500 hover:text-green-600"
                            title="Restore"
                          >
                            <ArchiveRestore size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto bg-gray-100 relative">
          {isSidebarOpen && (
            <div 
              className="absolute inset-0 bg-black/20 z-10 lg:hidden"
              onClick={() => setIsSidebarOpen(false)}
            />
          )}
          
          {selectedEvent ? (
            <div className="h-full p-4 md:p-8">
              <Card className="h-full flex flex-col shadow-md border-none">
                <CardHeader className="border-b py-4">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <LayoutDashboard size={18} className="text-orange-500" />
                    Event Layout Preview
                  </CardTitle>
                </CardHeader>
                <div className="flex-1 bg-gray-50 relative overflow-hidden">
                  <MapCanvas 
                    mapImageUrl={selectedEvent.mapImageUrl} 
                    booths={booths} 
                    readOnly 
                  />
                </div>
              </Card>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400 flex-col gap-4">
              <LayoutDashboard size={48} className="opacity-20" />
              <p>Select an event to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
