export type OrganizerSelectedEvent = {
  eventId: string;
  slug?: string;
};

const KEY = 'mx_organizer_selected_event_v1';

export function getOrganizerSelectedEvent(): OrganizerSelectedEvent | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OrganizerSelectedEvent;
    if (!parsed?.eventId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setOrganizerSelectedEvent(next: OrganizerSelectedEvent) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
}

