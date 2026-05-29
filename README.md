# Owner Panel — Backend API

Node.js + Express + MongoDB REST API

---

## Setup

```bash
cd owner_panel_backend
npm install
# Edit .env with your MongoDB URI and secrets
npm run dev
```

Server runs at `http://localhost:5000`

---

## .env Required Values

```
PORT=5000
MONGO_URI=mongodb://localhost:27017/owner_panel
JWT_SECRET=your_secret_key
JWT_EXPIRE=7d
CLOUDINARY_CLOUD_NAME=xxx
CLOUDINARY_API_KEY=xxx
CLOUDINARY_API_SECRET=xxx
```

---

## API Endpoints

All protected routes need: `Authorization: Bearer <token>`

---

### AUTH `/api/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/register` | ❌ | Register owner |
| POST | `/login` | ❌ | Login, returns JWT |
| GET | `/me` | ✅ | Get current owner |
| PUT | `/profile` | ✅ | Update name/phone |
| PUT | `/change-password` | ✅ | Change password |
| POST | `/verify-aadhaar` | ✅ | Upload Aadhaar front+back |
| POST | `/electricity-bill` | ✅ | Upload electricity bill |

**Register body:**
```json
{ "name": "Raj Sharma", "email": "raj@email.com", "phone": "9876543210", "password": "pass123" }
```

**Login body:**
```json
{ "email": "raj@email.com", "password": "pass123" }
```

**Aadhaar upload** — multipart/form-data:
- `front` — image file
- `back` — image file

---

### PROPERTIES `/api/properties`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Get all my properties |
| GET | `/?status=active` | Filter by status |
| GET | `/?type=pg` | Filter by type |
| POST | `/` | Create property |
| GET | `/:id` | Get single property |
| PUT | `/:id` | Update property |
| DELETE | `/:id` | Delete property |
| PATCH | `/:id/status` | Change status |
| POST | `/:id/documents` | Upload registry/NOC |
| GET | `/dashboard` | Get stats |

**Create PG Property** — multipart/form-data:
```
propertyType: "pg"
propertyName: "Sunshine PG"
location: "Sector 17, Chandigarh"
localLandmark: "Near Bus Stand"
description: "Well maintained PG"
pgDetails: {"availableFor":["boys","girls"],"totalRooms":12,"occupancyType":"single","roomType":"sharing","sharingPricing":{"singleRoom":{"price":6500,"deposit":2000}}}
photos: [file1, file2]
registry: [file]
noc: [file]
```

**Create Plot** — multipart/form-data:
```
propertyType: "plot"
propertyName: "Green Plot"
location: "Mohali Sector 5"
plotDetails: {"plotType":"Residential","facing":"East","plotSize":1500,"plotDimensions":{"length":30,"width":50},"totalPrice":75000}
```

**Status values:** `active` | `inactive` | `under_review`

---

### VISITS `/api/visits`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Get all visits |
| GET | `/?category=today` | Filter: today/upcoming/past |
| GET | `/?status=pending` | Filter by status |
| GET | `/?category=today&status=pending` | Combined filter |
| POST | `/` | Create visit |
| GET | `/:id` | Get single visit |
| PATCH | `/:id/confirm` | Confirm visit |
| PATCH | `/:id/reschedule` | Reschedule visit |
| PATCH | `/:id/cancel` | Cancel visit |

**Create visit body:**
```json
{
  "propertyId": "...",
  "visitorName": "Rahul Sharma",
  "visitorPhone": "7723454321",
  "requirement": "Looking for 2 person room",
  "visitDate": "2026-02-12",
  "visitTime": "11:30 AM"
}
```

**Reschedule body:**
```json
{ "newDate": "2026-02-13", "newTime": "2:00 PM", "reason": "Owner not available" }
```

**Cancel body:**
```json
{ "reason": "Already booked" }
```

---

### NOTIFICATIONS `/api/notifications`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/notifications` | Get all (grouped today/yesterday) |
| PATCH | `/notifications/:id/read` | Mark one as read |
| PATCH | `/notifications/read-all` | Mark all read |
| DELETE | `/notifications/clear` | Clear all |

---

### MESSAGES `/api/messages`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/messages` | Get all chat threads |
| GET | `/messages/:chatId` | Get single chat messages |
| POST | `/messages/:chatId/reply` | Send reply |

**Reply body:**
```json
{ "text": "Yes, the room is available" }
```

---

## Project Structure

```
owner_panel_backend/
├── server.js              # Entry point
├── .env                   # Environment variables
├── config/
│   ├── db.js              # MongoDB connection
│   └── cloudinary.js      # Image upload config
├── models/
│   ├── Owner.js           # Owner schema
│   ├── Property.js        # Property schema (PG/Guest/Plot)
│   ├── Visit.js           # Scheduled visits
│   ├── Notification.js    # Notifications
│   └── Message.js         # Chat messages
├── controllers/
│   ├── authController.js
│   ├── propertyController.js
│   ├── visitController.js
│   └── notificationController.js
├── routes/
│   ├── auth.js
│   ├── properties.js
│   ├── visits.js
│   └── notifications.js
├── middleware/
│   ├── auth.js            # JWT protect middleware
│   └── errorHandler.js
└── utils/
    └── token.js           # JWT generation
```

## Connecting Flutter to Backend

In your Flutter project, create `lib/services/api_service.dart`:

```dart
const String baseUrl = 'http://localhost:5000/api';
// For Android emulator use: http://10.0.2.2:5000/api
// For real device use your machine IP: http://192.168.x.x:5000/api
```

Add `http` to your pubspec.yaml:
```yaml
dependencies:
  http: ^1.1.0
  shared_preferences: ^2.2.2
```
