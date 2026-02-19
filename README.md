# Employee Purchase Order App

This is a code bundle for Employee Purchase Order App. The original project is available at https://www.figma.com/design/dRIGcWFbZhUcLq7uvXjKcj/Employee-Purchase-Order-App.

## Running the code

1. Install dependencies: `npm i`
2. Create a database: `CREATE DATABASE fleet_manager;` (in PostgreSQL/TimescaleDB)
3. Copy `.env.example` to `.env` and set your `DATABASE_URL`
4. Initialize the schema and seed data: `npm run init`
5. Start the API server: `npm run server` (runs on port 3001)
6. Start the frontend: `npm run dev` (Vite dev server proxies `/api` to the backend)

To run both server and frontend: `npm run dev:all` (requires `concurrently`)

## Database

The app uses TimescaleDB (PostgreSQL) for:
- **assets** – fleet vehicles and current status
- **purchase_orders** – purchase orders and status
- **transactions** – fuel, maintenance, parts, rental expenses
- **asset_telemetry** – GPS location history (when devices are connected)
  