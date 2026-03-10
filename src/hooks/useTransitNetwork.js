import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { seedRoutes } from '../data/seedNetwork';
import { firestore, isFirebaseConfigured } from '../lib/firebase';

function normalizeRoute(route) {
  return {
    id: route.id,
    name: route.name,
    color: route.color ?? '#e4572e',
    center: route.center ?? [route.stops?.[0]?.lat ?? 6.9271, route.stops?.[0]?.lng ?? 79.8612],
    path: route.path ?? [],
    stops: route.stops ?? [],
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