# Kimoel — Fleet Management & Purchase Order System

## What it is

Kimoel is an internal web app for a Philippine company that runs a fleet of heavy
vehicles (dump trucks, mini dumps, backhoes, boom trucks, loaders). It combines three
things in one system:

1. **Operations** — purchase orders, sales orders, inventory, material requests, and
   miscellaneous expenses.
2. **Fleet management** — vehicles, preventive maintenance scheduling, odometer logs,
   and GPS tracking.
3. **Deliveries** — dispatching drivers + vehicles against sales orders and tracking
   each delivery from pickup to completion.

It's built as a single web app with **three separate sign-in experiences** for three
kinds of users: Admins/Owners, Employees, and Drivers.

**Tech:** React 18 + Vite + Tailwind + Radix UI on the front end (Leaflet maps, Recharts
charts); Express + PostgreSQL on the back end with JWT authentication. Currently running
as a localhost pilot.

---

## Who uses it (roles)

| Role | Signs in at | What they do |
|------|-------------|--------------|
| **Super Admin / Owner** | Main login | Everything an admin can do, **plus** approve new admin accounts. The owner account is the one used for demos. |
| **Admin** | Main login | Run the whole business: orders, inventory, expenses, fleet, deliveries, approvals, reports. |
| **Employee** | Employee Portal | Browse inventory and submit material requests; track their request status; view orders and fleet info. |
| **Driver** | Driver Portal | See assigned deliveries, update delivery status, share live GPS location, and chat with admin. |

New employees and drivers **self-register**, then wait for an admin to approve them
before they can log in. New admins require **Super Admin** approval.

---

## The Admin experience (the core of the app)

Admins get a full dashboard with a sidebar covering every part of the business:

### Business Overview (dashboard)
- KPI cards: **Total Revenue**, **Total Expenses**, **Net Profit**, plus order counts
  (pending / approved / completed) and inventory status (in-stock / low-stock / out-of-stock).
- A **Revenue vs. Expenses line chart** over time, filterable by This Week / This Month /
  Last 30 Days / custom date range.

### Sales Orders
- Create, edit, delete, search, and filter sales orders (SO number, client, amount,
  delivery date). Print a professional PDF. Status flow: **Pending → Approved →
  Completed** (with **Paid** / **In Progress** states). Approving a sales order recognizes
  revenue; it can then be dispatched as a delivery.

### Purchase Orders
- Create, edit, delete, search, and filter purchase orders (supplier, amount, delivery
  date). Status flow: **Pending → Approved → Received**. Print PDF.

### Request Order (material requests)
- Review material requests submitted by employees. Approve or reject with admin notes,
  filter by urgency, and print a formal Purchase Request letter. Approving can update
  inventory.

### Inventory Management
- Full stock list (item code, name, quantity, unit, location, supplier, unit cost) with
  automatic **In Stock / Low Stock / Out of Stock** badges. Create, edit, delete, sort,
  search, and filter.

### Miscellaneous
- Track ad-hoc expenses by category (Fuel, Vehicle Parts, Food, Donations, Office
  Supplies, Maintenance, Utilities, Travel, Training, Other). Feeds into the financial
  dashboard.

### Fleet
- Vehicle list with unit name, plate number, type, current odometer, and a **maintenance
  status badge** (OK / Due Soon / Overdue). Add/remove vehicles and drill into a vehicle's
  details and maintenance history.

### PMS Reminders (Preventive Maintenance Schedule)
- Vehicles grouped into **Overdue** and **Due Soon** so nothing misses its service window.
  Maintenance auto-schedules the next service (≈ +6 months / +5,000 km).

### GPS Tracking
- Live Leaflet map with vehicle markers, driver labels, and current speed. Drivers feed
  location from their phones. *(Note: GPS is a working prototype in the pilot — locations
  are captured but the live feed isn't fully production-wired yet.)*

### Deliveries & Delivery Management
- Turn approved sales orders into deliveries: assign a driver + vehicle, set a date, and
  dispatch. Track each delivery through **Pending → Assigned → Picked Up → In Transit →
  Arrived → Completed** (with timestamps and proof-of-delivery).

### Approvals & Driver setup
- **Employee Approvals** and **Driver Approvals** queues to onboard new staff.
- **Driver Vehicle Assignment** to give each approved driver a vehicle.
- **Admin Requests** (Super Admin only) to approve new admin accounts.

---

## The Employee Portal

A focused, simpler app for staff who request materials:
- **Inventory** — browse all items and stock status (read-only).
- **New Request** — submit a material request (item, quantity, unit, purpose, urgency).
- **My Requests** — track personal request history and approval status + admin notes.
- **Notifications** — get notified when requests are approved or rejected.

---

## The Driver Portal

A mobile-friendly app for drivers in the field:
- **Deliveries** — see assigned deliveries and advance their status step by step.
- **Tracking** — start/stop GPS sharing; shows live speed and accuracy.
- **Chat** — message admin and attach files (e.g., proof of delivery).
- **Vehicle Info** — assigned vehicle, plate number, and current odometer.

---

## How the money flows (key workflow)

The financial heart of the app is the **sales order lifecycle**:

1. **Create** a sales order (Pending).
2. **Approve** it → revenue is recognized and logged.
3. **Dispatch** it as a delivery (assign driver + vehicle).
4. **Confirm delivery** (driver, with GPS location) → order is Completed and revenue is
   finalized.
5. Inventory is deducted and **cost of goods (COGS)** recorded, so the dashboard's
   revenue / expense / profit numbers reflect real activity.

Every approval and status change is written to an audit log.

---

## What's solid vs. still in progress (pilot status)

**Working / demo-ready:** the three sign-in flows, approvals, sales/purchase orders,
inventory, material requests, miscellaneous expenses, fleet + maintenance/PMS reminders,
deliveries and driver dispatch, and the business overview dashboard.

**Still being firmed up:** live GPS tracking is a prototype (locations captured but not
fully streamed to the map yet), and the financial totals are being reconciled end-to-end
after a recent fix to the sales-order → delivery → revenue chain.
