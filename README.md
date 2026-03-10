# bus-tracking-firebase

Phases 1 through 4 of the bus tracking system are implemented in this repository.

This first slice focuses on the smallest useful flow:

Driver console -> Firebase Realtime Database -> Passenger live map

The current build covers the realtime pipeline plus the first transport network layer, so you can validate live tracking before adding admin tools and ETA logic.

## What is included

- Passenger web map with live bus markers
- Driver console with email/password authentication
- Demo route mode for laptop testing
- Device GPS mode for real browser geolocation
- Firebase Realtime Database integration
- Route catalog with stops, paths, and fleet assignments
- Passenger route filtering with stop markers and route lines
- Multiple bus choices per route in the driver console
- Admin dashboard for route editing, bus registration, and live monitoring
- Stop ETA estimation for the selected route
- Driver-reported crowd level visible to passengers

## Tech stack

- React + Vite
- Firebase Authentication
- Firebase Realtime Database
- Firestore route catalog with seeded fallback data
- React Leaflet + OpenStreetMap tiles

Google Maps can be introduced later, but Leaflet keeps Phase 1 simpler because it avoids a separate maps API key while the Firebase pipeline is being validated.

## Local setup

1. Install dependencies.
2. Create a Firebase project.
3. Enable Email/Password authentication.
4. Create a Realtime Database in test mode for development.
5. Copy `.env.example` to `.env` and fill in the Firebase web app credentials.
6. Start the app.

```bash
npm install
npm run dev
```

## Required environment variables

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_DATABASE_URL=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

## Suggested Realtime Database structure

```text
live_locations/
	bus_138_01/
		busId
		routeId
		driverId
		lat
		lng
		speed
		heading
		source
		timestamp

buses/
	bus_138_01/
		routeId
		driverId
		status
		lastSeenAt
```

## Suggested Firestore route structure

Collection: `routes`

Example document `138`

```json
{
	"name": "Colombo Fort -> Maharagama",
	"color": "#e4572e",
	"center": [6.9226, 79.8731],
	"path": [
		[6.9271, 79.8612],
		[6.9253, 79.8661]
	],
	"stops": [
		{ "id": "pettah", "name": "Pettah", "lat": 6.936, "lng": 79.8502 }
	],
	"buses": ["bus_138_01", "bus_138_02"]
}
```

If the Firestore collection is empty, the app falls back to a built-in Sri Lanka demo network so development can continue without backend seed data.

## Recommended development sequence

### Phase 1

- Validate the live location flow with the driver console and passenger map.
- Use demo mode first.
- Switch to device GPS after the Firebase connection works.

### Phase 2

- Added Firestore-backed route catalog with fallback seed data.
- Added route filter on the passenger map.
- Added route paths and stop markers.
- Added multi-bus selection in the driver console.

### Phase 3

- Added an admin dashboard.
- Added route editing against Firestore.
- Added bus registration against Realtime Database.
- Added live fleet monitoring.

Current limitation: authentication exists, but role-based authorization still needs to be enforced in Firebase rules before real deployment.

### Phase 4

- Added stop ETA estimation on the passenger route view.
- Added crowd level publishing from the driver console.
- Added passenger-facing arrival cards per stop.
- Notifications and historical playback are still pending.