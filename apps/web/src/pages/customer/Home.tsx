import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (slug) {
      const run = async () => {
        try {
          const res = await api.post('/auth/customer/qr', { slug });
          const { accessToken, event } = res.data.data;
          localStorage.setItem('customer_token', accessToken);
          api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
          setEventData(event);
        } catch (error) {
          console.error(error);
        }
      };
      run();
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
  }, [slug]);

  if (slug) {
    return (
      <div className="relative w-full h-full">
        <div className="absolute inset-0">
          <EventMap slug={slug} />
        </div>
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-white/90 backdrop-blur-md rounded-full px-6 py-2 shadow-lg">
          <h1 className="text-sm font-semibold text-gray-800">
            {eventData?.name || 'Loading...'}
          </h1>
        </div>
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 w-[90%] max-w-md">
          <input
            type="text"
            placeholder="Search food or vendor..."
            className="w-full rounded-full px-4 py-2 shadow-md border focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
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
