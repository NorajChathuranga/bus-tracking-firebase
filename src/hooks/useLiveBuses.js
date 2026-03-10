import { useEffect, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { database, isFirebaseConfigured } from '../lib/firebase';

export default function useLiveBuses() {
  const [buses, setBuses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isFirebaseConfigured || !database) {
      setIsLoading(false);
      return undefined;
    }

    const liveLocationsRef = ref(database, 'live_locations');

    const unsubscribe = onValue(
      liveLocationsRef,
      (snapshot) => {
        const data = snapshot.val() ?? {};
        const nextBuses = Object.entries(data)
          .map(([busId, payload]) => ({
            busId,
            routeId: payload.routeId ?? 'unassigned',
            driverId: payload.driverId ?? 'unknown',
            lat: payload.lat,
            lng: payload.lng,
            speed: payload.speed ?? 0,
            heading: payload.heading ?? 0,
            timestamp: payload.timestamp ?? 0,
            source: payload.source ?? 'device',
            crowdLevel: payload.crowdLevel ?? 'unknown',
            status: payload.status ?? 'active',
          }))
          .filter((bus) => Number.isFinite(bus.lat) && Number.isFinite(bus.lng))
          .sort((firstBus, secondBus) => secondBus.timestamp - firstBus.timestamp);

        setBuses(nextBuses);
        setError('');
        setIsLoading(false);
      },
      (nextError) => {
        setError(nextError.message);
        setIsLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  return { buses, isLoading, error };
}
