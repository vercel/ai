'use client';

import {
  ConversationReplay,
  type SimulationMessage,
} from './preview-conversation';

interface Contact {
  name: string;
  username: string;
}

interface CalendarEvent {
  name: string;
  startTime: number;
  endTime: number;
}

interface Place {
  name: string;
  distance: string;
}

type EventPlanningResult =
  | { kind: 'contacts'; contacts: Contact[] }
  | { kind: 'events'; events: CalendarEvent[] }
  | { kind: 'places'; places: Place[] };

const studio: CalendarEvent = { name: 'studio', startTime: 4, endTime: 6 };

const messages: SimulationMessage<EventPlanningResult>[] = [
  {
    role: 'user',
    content: "I'd like to get drinks with Max tomorrow evening after studio!",
  },
  { role: 'tool-call', name: 'searchContacts("Max")' },
  {
    role: 'tool-result',
    name: 'searchContacts("Max")',
    result: {
      kind: 'contacts',
      contacts: [
        { name: 'max', username: 'mleiter' },
        { name: 'shu', username: 'shuding' },
      ],
    },
  },
  { role: 'tool-call', name: 'getEvents("2023-10-18", ["jrmy", "mleiter"])' },
  {
    role: 'tool-result',
    name: 'getEvents("2023-10-18", ["jrmy", "mleiter"])',
    result: { kind: 'events', events: [studio] },
  },
  { role: 'tool-call', name: 'searchNearby("Bar")' },
  {
    role: 'tool-result',
    name: 'searchNearby("Bar")',
    result: {
      kind: 'places',
      places: [
        { name: 'wild colonial', distance: '200m' },
        { name: 'the eddy', distance: '1.3km' },
      ],
    },
  },
  { role: 'tool-call', name: 'createEvent("2023-10-18", ["jrmy", "mleiter"])' },
  {
    role: 'tool-result',
    name: 'createEvent("2023-10-18", ["jrmy", "mleiter"])',
    result: {
      kind: 'events',
      events: [
        studio,
        { name: 'Drinks at Wild Colonial', startTime: 6, endTime: 7 },
      ],
    },
  },
  {
    role: 'assistant',
    content:
      'Exciting! Max is free around that time and Wild Colonial is right around the corner, would you like me to mark it on your calendar?',
  },
  { role: 'user', content: 'Sure, sounds good!' },
];

const Avatar = ({ name }: { name: string }) => (
  <div
    aria-hidden="true"
    className="flex size-6 items-center justify-center rounded-full bg-gray-300 font-medium text-gray-1000 text-xs uppercase"
  >
    {name.charAt(0)}
  </div>
);

const Contacts = ({ contacts }: { contacts: Contact[] }) => (
  <div className="flex flex-col rounded-lg bg-gray-100">
    {contacts.map(contact => (
      <div
        className="flex flex-row items-center justify-between border-gray-alpha-400 p-2 first:border-b"
        key={contact.username}
      >
        <div className="flex flex-row items-center gap-2">
          <Avatar name={contact.name} />
          <div className="text-gray-1000 text-sm capitalize">
            {contact.name}
          </div>
        </div>
        <div className="text-gray-900 text-sm">@{contact.username}</div>
      </div>
    ))}
  </div>
);

const Events = ({ events }: { events: CalendarEvent[] }) => (
  <div className="flex flex-row gap-2">
    <div className="flex flex-col justify-between gap-3">
      {['4PM', '5PM', '6PM', '7PM'].map(hour => (
        <div className="text-gray-700 text-xs" key={hour}>
          {hour}
        </div>
      ))}
    </div>
    <div className="flex w-full flex-col gap-1">
      {events.map((event, index) => (
        <div
          className={`flex-grow rounded-lg p-2 ${
            index === 0 ? 'bg-purple-100' : 'bg-pink-100'
          }`}
          key={event.name}
          style={{ maxHeight: 72 }}
        >
          <div
            className={`text-sm capitalize ${
              index === 0 ? 'text-purple-900' : 'text-pink-900'
            }`}
          >
            {event.name}
          </div>
          <div
            className={`text-sm ${
              index === 0 ? 'text-purple-800' : 'text-pink-800'
            }`}
          >
            {`${event.startTime}-${event.endTime} PM`}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const Places = ({ places }: { places: Place[] }) => (
  <div className="flex flex-col rounded-lg bg-gray-100">
    {places.map(place => (
      <div
        className="flex flex-row justify-between border-gray-alpha-400 p-2 first:border-b"
        key={place.name}
      >
        <div className="text-gray-1000 text-sm capitalize">{place.name}</div>
        <div className="text-gray-900 text-sm">{place.distance}</div>
      </div>
    ))}
  </div>
);

const renderResult = ({ result }: { result: EventPlanningResult }) => {
  switch (result.kind) {
    case 'contacts':
      return <Contacts contacts={result.contacts} />;
    case 'events':
      return <Events events={result.events} />;
    case 'places':
      return <Places places={result.places} />;
    default:
      return null;
  }
};

/**
 * Simulated multi-step event planning: the model chains contact, calendar,
 * and venue lookups before proposing an event (ported from the legacy
 * ai-sdk.dev app; remote avatars replaced with initials).
 */
export const EventPlanningSimulation = ({
  isPlaying = false,
}: {
  isPlaying?: boolean;
}) => (
  <ConversationReplay
    height={405}
    holdDelay={2000}
    isPlaying={isPlaying}
    messages={messages}
    renderResult={renderResult}
  />
);
