import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { seedRoutes } from '../data/seedNetwork';
import { firestore, isFirebaseConfigured } from '../lib/firebase';

function normalizeRoute(route) {
  function parseCoordinatePair(value, fallbackLat = 6.9271, fallbackLng = 79.8612) {
    if (Array.isArray(value) && value.length >= 2) {
      const lat = Number(value[0]);
      const lng = Number(value[1]);

      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return [lat, lng];
      }
    }

    if (value && typeof value === 'object') {
      const lat = Number(value.lat);
      const lng = Number(value.lng);

      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return [lat, lng];
      }
    }

    return [fallbackLat, fallbackLng];
  }

  const normalizedStops = (route.stops ?? []).map((stop, stopIndex) => {
    const lat = Number(stop?.lat);
    const lng = Number(stop?.lng);
    const fallbackCenter = parseCoordinatePair(route.center);

    return {
      ...stop,
      id: stop?.id ?? `stop-${stopIndex + 1}`,
      lat: Number.isFinite(lat) ? lat : fallbackCenter[0],
      lng: Number.isFinite(lng) ? lng : fallbackCenter[1],
    };
  });

  const normalizedCenter = parseCoordinatePair(route.center, normalizedStops[0]?.lat ?? 6.9271, normalizedStops[0]?.lng ?? 79.8612);

  const normalizedPath = (route.path ?? []).map((point) => parseCoordinatePair(point, normalizedCenter[0], normalizedCenter[1]));

  return {
    id: route.id,
    name: route.name,
    color: route.color ?? '#e4572e',
    center: normalizedCenter,
    path: normalizedPath,
    stops: normalizedStops,
    buses: route.buses ?? [],
  };
}

export default function useTransitNetwork() {
  const [routes, setRoutes] = useState(seedRoutes.map(normalizeRoute));
  const [source, setSource] = useState('seed');
  const [isLoading, setIsLoading] = useState(isFirebaseConfigured);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isFirebaseConfigured || !firestore) {
      setIsLoading(false);
      setSource('seed');
      return undefined;
    }

    const routesCollection = collection(firestore, 'routes');

    const unsubscribe = onSnapshot(
      routesCollection,
      (snapshot) => {
        if (snapshot.empty) {
          setRoutes(seedRoutes.map(normalizeRoute));
          setSource('seed');
          setError('');
          setIsLoading(false);
          return;
        }

        const nextRoutes = snapshot.docs
          .map((doc) => normalizeRoute({ id: doc.id, ...doc.data() }))
          .sort((firstRoute, secondRoute) => firstRoute.id.localeCompare(secondRoute.id));

        setRoutes(nextRoutes);
        setSource('firestore');
        setError('');
        setIsLoading(false);
      },
      (nextError) => {
        setRoutes(seedRoutes.map(normalizeRoute));
        setSource('seed');
        setError(nextError.message);
        setIsLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  return { routes, source, isLoading, error };
}
