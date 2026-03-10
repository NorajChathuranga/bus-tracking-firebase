function toRadians(value) {
  return (value * Math.PI) / 180;
}

export function distanceKm(firstPoint, secondPoint) {
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(secondPoint[0] - firstPoint[0]);
  const deltaLng = toRadians(secondPoint[1] - firstPoint[1]);
  const firstLat = toRadians(firstPoint[0]);
  const secondLat = toRadians(secondPoint[0]);

  const haversineValue =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(firstLat) * Math.cos(secondLat) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(haversineValue), Math.sqrt(1 - haversineValue));
}

function buildCumulativeDistances(path) {
  const distances = [0];

  for (let index = 1; index < path.length; index += 1) {
    distances[index] = distances[index - 1] + distanceKm(path[index - 1], path[index]);
  }

  return distances;
}

function nearestPathIndex(path, point) {
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  path.forEach((pathPoint, index) => {
    const nextDistance = distanceKm(pathPoint, point);

    if (nextDistance < closestDistance) {
      closestDistance = nextDistance;
      closestIndex = index;
    }
  });

  return closestIndex;
}

function remainingDistanceOnLoop(cumulativeDistances, fromIndex, toIndex) {
  const totalDistance = cumulativeDistances[cumulativeDistances.length - 1] ?? 0;
  const fromDistance = cumulativeDistances[fromIndex] ?? 0;
  const toDistance = cumulativeDistances[toIndex] ?? 0;

  if (toDistance >= fromDistance) {
    return toDistance - fromDistance;
  }

  return totalDistance - fromDistance + toDistance;
}

export function estimateRouteStopEtas(route, buses) {
  if (!route?.path?.length || !route?.stops?.length || !buses.length) {
    return [];
  }

  const cumulativeDistances = buildCumulativeDistances(route.path);

  return route.stops.map((stop) => {
    const stopPoint = [stop.lat, stop.lng];
    const stopPathIndex = nearestPathIndex(route.path, stopPoint);

    const candidates = buses.map((bus) => {
      const busPoint = [bus.lat, bus.lng];
      const busPathIndex = nearestPathIndex(route.path, busPoint);
      const remainingDistance = remainingDistanceOnLoop(cumulativeDistances, busPathIndex, stopPathIndex);
      const operatingSpeed = Math.max(bus.speed || 0, 18);
      const etaMinutes = Math.round((remainingDistance / operatingSpeed) * 60);

      return {
        busId: bus.busId,
        crowdLevel: bus.crowdLevel ?? 'unknown',
        status: bus.status ?? 'active',
        remainingDistanceKm: Number(remainingDistance.toFixed(2)),
        etaMinutes,
      };
    });

    candidates.sort((firstCandidate, secondCandidate) => firstCandidate.etaMinutes - secondCandidate.etaMinutes);

    return {
      stopId: stop.id,
      stopName: stop.name,
      nextArrival: candidates[0] ?? null,
      arrivals: candidates,
      isSoon: (candidates[0]?.etaMinutes ?? Number.POSITIVE_INFINITY) <= 5,
    };
  });
}
