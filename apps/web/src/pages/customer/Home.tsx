import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Link, useParams } from 'react-router-dom';
import { EventMap } from './EventMap';

interface Event {
  id: string;
  name: string;
  slug: string;
  description: string;
  startDate: string;
  location: string;
}

export function CustomerHome() {
  const { slug } = useParams();
  const [events, setEvents] = useState<Event[]>([]);
  const [eventData, setEventData] = useState<any | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const bootstrapCustomer = useCallback(async (eventSlug: string) => {
    setIsBootstrapping(true);
    setBootstrapError(null);
    try {
      const res = await api.post('/auth/customer/qr', { slug: eventSlug });
      const { accessToken, event } = res.data.data;
      localStorage.setItem('customer_token', accessToken);
      api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
      setEventData(event);
    } catch (error: any) {
      const msg =
        error?.response?.data?.error ||
        (typeof error?.message === 'string' ? error.message : null) ||
        'Unable to start customer session.';
      setBootstrapError(msg);
      setEventData(null);
    } finally {
      setIsBootstrapping(false);
    }
  }, []);

  useEffect(() => {
    if (slug) {
      bootstrapCustomer(slug);
      return;
    }

    const fetchEvents = async () => {
      try {
        const { data } = await api.get('/events');
        if (data.success) {
          setEvents(data.data);
        }
      } catch (error) {
        console.error(error);
      }
    };
    fetchEvents();
  }, [bootstrapCustomer, slug]);

  if (slug) {
    if (isBootstrapping && !eventData) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[#FAF7F0]">
          <div className="bg-white rounded-3xl shadow-xl p-6 text-center max-w-sm mx-4">
            <div className="text-lg font-extrabold text-gray-900">Loading event…</div>
            <div className="text-sm text-gray-600 mt-2">Preparing your map experience.</div>
          </div>
        </div>
      );
    }

    if (bootstrapError && !eventData) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[#FAF7F0]">
          <div className="bg-white rounded-3xl shadow-xl p-6 text-center max-w-sm mx-4">
            <div className="text-lg font-extrabold text-gray-900">Can’t connect</div>
            <div className="text-sm text-gray-600 mt-2">
              {bootstrapError}
            </div>
            <div className="mt-5 space-y-3">
              <button
                onClick={() => bootstrapCustomer(slug)}
                className="w-full bg-black text-white rounded-2xl py-3 font-semibold shadow-md active:scale-[0.99] transition"
              >
                Retry
              </button>
              <button
                onClick={() => setBootstrapError(null)}
                className="w-full rounded-2xl py-3 bg-white border border-gray-200 text-sm font-semibold text-gray-900 active:scale-[0.99] transition"
              >
                Open Map Anyway
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full h-full">
        <EventMap slug={slug} event={eventData} />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-blue-600 mb-4">MakanX</h1>
        <p className="text-xl text-gray-600">Discover Food Events Near You</p>
      </div>

      <h2 className="text-2xl font-bold mb-6">Upcoming Events</h2>
      <div className="grid md:grid-cols-3 gap-6">
        {events.map((event) => (
          <Link key={event.id} to={`/customer/event/${event.slug}`}>
            <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
              <CardHeader>
                <CardTitle>{event.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 mb-2">{event.description}</p>
                <div className="text-sm text-gray-500">
                  <p>📅 {new Date(event.startDate).toLocaleDateString()}</p>
                  <p>📍 {event.location}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
