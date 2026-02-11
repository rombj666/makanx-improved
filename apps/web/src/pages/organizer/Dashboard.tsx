import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Link } from 'react-router-dom';

interface Event {
  id: string;
  name: string;
  slug: string;
  startDate: string;
  location: string;
}

export function OrganizerDashboard() {
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
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
  }, []);

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Organizer Dashboard</h1>
        <Button>Create Event</Button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>My Events</CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p>No events found.</p>
            ) : (
              <ul className="space-y-4">
                {events.map((event) => (
                  <li key={event.id} className="border-b pb-2 flex justify-between items-center">
                    <div>
                      <div className="font-bold">{event.name}</div>
                      <div className="text-sm text-gray-600">
                        {new Date(event.startDate).toLocaleDateString()} - {event.location}
                      </div>
                    </div>
                    <Link to={`/organizer/map/${event.id}`}>
                      <Button size="sm" variant="outline">Edit Map</Button>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Links</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Link to="/organizer/applications">
              <Button variant="outline" className="w-full justify-start">
                Review Vendor Applications
              </Button>
            </Link>
            <Button variant="outline" className="w-full justify-start">
              Manage Booths
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
