# ✈️ Aerovox

Real-time flight tracking and turbulence visualization platform. A modern TypeScript full-stack application built with Express.js backend and React frontend.

## 🚀 Features

- **Real-time Flight Tracking**: Live aircraft position, altitude, and telemetry data
- **Turbulence Detection**: Visual representation of turbulence zones
- **Weather Integration**: Real-time weather data overlay
- **WebSocket Communication**: Real-time updates via WebSocket protocol
- **Responsive UI**: Mobile-friendly interface with dark mode
- **TypeScript**: Fully typed codebase for production reliability

## 📋 Project Structure

```
aerovox/
├── server/                 # Node.js Express backend
│   ├── src/
│   │   ├── index.ts       # Server entry point
│   │   ├── websocket.ts   # WebSocket handler
│   │   └── services/
│   │       └── flightData.ts  # Flight data service
│   ├── package.json
│   └── tsconfig.json
├── client/                 # React TypeScript frontend
│   ├── src/
│   │   ├── main.tsx       # React entry point
│   │   ├── App.tsx        # Main app component
│   │   └── index.css      # Styles
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
├── package.json           # Root workspace package
├── tsconfig.json          # Root TypeScript config
├── .eslintrc.json         # ESLint configuration
└── .prettierrc.json       # Prettier configuration
```

## 🛠️ Tech Stack

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Language**: TypeScript
- **Real-time**: WebSocket (ws library)
- **HTTP Client**: Axios

### Frontend
- **Framework**: React 18
- **Language**: TypeScript
- **Build Tool**: Vite
- **Mapping**: MapLibre GL (prepared)
- **Styling**: CSS3

### Development Tools
- **Package Manager**: npm (workspaces)
- **Linter**: ESLint
- **Formatter**: Prettier
- **Task Runner**: Concurrently

## 📦 Prerequisites

- Node.js 18 or higher
- npm 8 or higher

## 🚀 Quick Start

### Installation

```bash
npm install
```

This will install dependencies for both server and client packages.

### Development Mode

```bash
npm run dev
```

This starts:
- Backend server on `http://localhost:3000`
- Frontend dev server on `http://localhost:5173`

### Production Build & Run

```bash
npm run build
npm start
```

## 🔧 Configuration

Create `server/.env`:

```env
NODE_ENV=development
PORT=3000
OPENSKY_USERNAME=
OPENSKY_PASSWORD=
DEBUG=false
LOG_LEVEL=info
```

See `server/.env.example` for all options.

## 📡 API & WebSocket

### REST Endpoints
- `GET /health` - Server health check
- `GET /api/flights` - Get all active flights
- `GET /api/turbulence` - Get turbulence zones
- `GET /api/weather` - Get weather data

### WebSocket Connection
```
ws://localhost:3000/ws
```

Real-time flight updates broadcast every 5 seconds.

## 🧪 Quality Assurance

```bash
npm run type-check    # TypeScript validation
npm run lint          # ESLint check
```

## 📚 Development

- **Strict TypeScript**: Fully typed codebase
- **Modern React**: Functional components & hooks
- **Express Best Practices**: Consistent error handling & logging
- **Code Formatting**: Prettier configured for consistency

## 🔗 Integration

The app is ready for OpenSky Network API integration:
1. Register at https://opensky-network.org/
2. Add credentials to `server/.env`
3. Uncomment API call in `server/src/services/flightData.ts`

## 📈 Roadmap

- [ ] MapLibre GL interactive map
- [ ] Flight history storage
- [ ] Advanced turbulence modeling
- [ ] User authentication
- [ ] Cloud deployment
- [ ] Mobile app (React Native)

## 📄 License

See LICENSE file

## 📧 Support

Open a GitHub issue for questions or bugs

## Real-time turbulence detection

Turbulence is driven by **live OpenSky data**, not a timer:

1. The backend queries `/states/all` for a bounding box (default: YYZ / Great Lakes,
   set via `OPENSKY_*` in `backend/.env`) every `POLL_INTERVAL` seconds.
2. It **locks onto one aircraft** by `icao24` and re-finds that same airframe each
   poll, so its `vertical_rate` samples form a coherent time series.
3. `TurbulenceDetector` flags turbulence when that series oscillates (≥2 sign flips)
   with a spike above `TURBULENCE_THRESHOLD` m/s — i.e. the plane is bouncing up and
   down for real on the live feed.

OpenSky's anonymous feed refreshes about every 10s, so polling faster than that adds
nothing. The **TRIGGER TURBULENCE** button stays available to force the sequence for a
deterministic demo regardless of live conditions.

## Airport overlay

Airports come from the [OurAirports](https://ourairports.com/data/) public-domain CSV
(no key). On map load the frontend fetches the CSV, filters to scheduled-service
large/medium airports, and renders them as colored dots with IATA labels; click a dot
for a name/city popup. See `frontend/src/components/AirportLayer.js`.

## State machine

`IDLE → TURBULENCE_DETECTED → ANNOUNCING → AWAITING_CONFIRMATION → EXECUTING →
STABILIZED → IDLE`, with `AWAITING_CONFIRMATION → TIMEOUT → IDLE` if no confirmation
arrives within `CONFIRMATION_TIMEOUT` seconds.
