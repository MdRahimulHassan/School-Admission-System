# School Admission System

First-come-first-served online admission for a school. Each class (one shift = one class) has a
limited number of seats. Applying holds a seat for a limited time; paying the admission fee within
that time confirms it, otherwise the seat is released automatically for the next applicant.

- **Backend:** C# / ASP.NET Core (.NET 10), PostgreSQL 17
- **Frontend:** React 19 + TypeScript + Vite, in Bangla and English
- **Runs with:** Docker only

See [ASSUMPTIONS.md](ASSUMPTIONS.md) for design decisions and [AI_USAGE.md](AI_USAGE.md) for how AI tools were used.

## Run the application

The only requirement is Docker (with Docker Compose).

```bash
docker compose up --build
```

This starts PostgreSQL, the backend and the frontend, and creates the database schema automatically.

| Service      | URL                       |
|--------------|---------------------------|
| **Frontend** | **http://localhost:5173** |
| Backend      | http://localhost:8080     |

Open **http://localhost:5173** in a browser. Everything is done from there:

1. **ক্লাস তৈরি / Create class** (school admin): add a class with a name and a number of seats.
2. Type a 17-digit birth registration number in the box at the top, e.g. `20152691234567890`.
3. **ক্লাস তালিকা / Classes**: press **আবেদন করুন / Apply**. The application opens with a countdown.
4. Press **ভর্তি ফি দিন / Pay admission fee** to confirm, or **বাতিল / Cancel** to give the seat up.
5. **আমার আবেদন / My applications** lists every application of that student.

The language switch (বাংলা / English) is in the top right corner. The page starts in Bangla.

Stop with `Ctrl+C`, or `docker compose down`. **Data is kept** in a Docker volume, so
`docker compose down` followed by `docker compose up` shows the same classes and applications.
(`docker compose down -v` deletes the volume and therefore all data.)

### Configuration

All settings are environment variables. Set them in the shell or in a `.env` file next to
`docker-compose.yml` (see [.env.example](.env.example)).

| Variable                | Default                                   | Meaning                                              |
|-------------------------|-------------------------------------------|------------------------------------------------------|
| `HOLD_DURATION_SECONDS` | `600`                                     | How long a seat stays held after applying.           |
| `DB_CONNECTION_STRING`  | the bundled PostgreSQL container          | Database the backend connects to.                    |
| `VITE_API_BASE_URL`     | `http://localhost:<BACKEND_PORT>`         | Backend URL the frontend calls from the browser.     |
| `BACKEND_PORT`          | `8080`                                    | Host port for the backend.                           |
| `FRONTEND_PORT`         | `5173`                                    | Host port for the frontend.                          |

`VITE_API_BASE_URL` is read when the frontend container **starts**, so pointing the UI at another
backend needs only a restart, not a rebuild. (With `npm run dev` it is read from `frontend/.env`.)

`DB_CONNECTION_STRING` accepts either format:

```
Host=myhost;Port=5432;Database=admission;Username=admission;Password=secret
postgres://admission:secret@myhost:5432/admission
```

Example: holds that last 30 seconds.

```bash
HOLD_DURATION_SECONDS=30 docker compose up --build        # Linux / macOS / Git Bash
$env:HOLD_DURATION_SECONDS=30; docker compose up --build  # PowerShell
```

## Run the tests

The tests need only Docker. The backend tests start their own throwaway PostgreSQL and never touch
the application's data.

```bash
docker compose -f docker-compose.test.yml run --rm --build backend-tests     # 59 backend tests
docker compose -f docker-compose.test.yml run --rm --build frontend-tests    # 20 frontend tests
docker compose -f docker-compose.test.yml down -v                            # clean up
```

Each command prints the results and exits with code 0 when every test passes.

**Frontend** (in `frontend/src`, Vitest + React Testing Library): the real UI is driven against an
in-memory fake of the backend contract. Covered: seat numbers updating without a reload, apply / pay /
cancel, an application turning `EXPIRED` with the pay button switched off by itself, the running
application still shown after a refresh, a readable message when the server is unreachable or the
last seat is gone, the admin form, and the language switch.

**Backend** (in `backend/tests/Admission.Api.Tests`):

- **Concurrency:** 200 simultaneous applications for 10 seats give exactly 10 holds; the same
  through two backend instances sharing one database; one student applying 40 times at once gets
  one seat; 40 simultaneous confirms count one seat.
- **Expiry:** an unpaid hold becomes `EXPIRED` and its seat returns with no API call.
- **Rules:** one active application per student per class, only the owner can confirm or cancel,
  repeated confirm counts once, invalid input is always `4xx`.
- **Persistence:** data is still there after the backend restarts.

Without Docker, with the .NET 10 SDK and Node.js 22+ installed:

```bash
cd backend
TEST_DB_CONNECTION_STRING="Host=localhost;Port=5432;Database=admission_test;Username=...;Password=..." dotnet test

cd frontend
npm ci
npm test
```

## Frontend development

```bash
cd frontend
npm ci
cp .env.example .env      # set VITE_API_BASE_URL if the backend is not on http://localhost:8080
npm run dev               # http://localhost:5173 with hot reload
```

## API

Base URL `http://localhost:8080`. JSON in, JSON out. The student is identified by the
`X-Student-Id` header: the 17-digit birth registration number.

| # | Method and path                 | Header         | Success | Purpose                                   |
|---|---------------------------------|----------------|---------|-------------------------------------------|
| 1 | `POST /classes`                 |                | `201`   | Create a class                            |
| 2 | `GET /classes`                  |                | `200`   | All classes with seat counts              |
| 3 | `GET /classes/{classId}`        |                | `200`   | Seat counts of one class                  |
| 4 | `POST /classes/{classId}/holds` | `X-Student-Id` | `201`   | Apply (hold a seat)                       |
| 5 | `GET /holds/{holdId}`           |                | `200`   | Current state of an application           |
| 6 | `POST /holds/{holdId}/confirm`  | `X-Student-Id` | `200`   | Pay the fee, confirm the admission        |
| 7 | `DELETE /holds/{holdId}`        | `X-Student-Id` | `204`   | Cancel an application                     |
| 8 | `GET /me/holds`                 | `X-Student-Id` | `200`   | All applications of this student          |

`status` is one of `HELD`, `CONFIRMED`, `EXPIRED`, `CANCELLED`.

Errors always look like this, with a `4xx` status:

```json
{ "error": "NO_SEATS_AVAILABLE", "message": "No seats are available in this class right now." }
```

| Status | `error` codes                                                                                  |
|--------|------------------------------------------------------------------------------------------------|
| `400`  | `INVALID_JSON`, `INVALID_BODY`, `NAME_REQUIRED`, `NAME_INVALID`, `TOTAL_SEATS_INVALID`, `STUDENT_ID_REQUIRED`, `STUDENT_ID_INVALID` |
| `403`  | `NOT_YOUR_HOLD`                                                                                |
| `404`  | `CLASS_NOT_FOUND`, `HOLD_NOT_FOUND`, `NOT_FOUND`                                               |
| `409`  | `NO_SEATS_AVAILABLE`, `ALREADY_APPLIED`, `HOLD_EXPIRED`, `HOLD_CANCELLED`, `HOLD_ALREADY_CONFIRMED` |
| `503`  | `SERVICE_UNAVAILABLE` (database unreachable)                                                   |

Try it:

```bash
curl -X POST http://localhost:8080/classes -H "Content-Type: application/json" \
     -d '{"name":"Class 6 - Morning Shift","totalSeats":120}'
curl http://localhost:8080/classes
curl -X POST http://localhost:8080/classes/<classId>/holds -H "X-Student-Id: 20152691234567890"
curl -X POST http://localhost:8080/holds/<holdId>/confirm  -H "X-Student-Id: 20152691234567890"
```

## Two backend processes on one database (bonus)

```bash
docker compose --profile two-backends up --build
```

A second backend starts on http://localhost:8081 (change with `BACKEND_2_PORT`), sharing the same
PostgreSQL. Seats stay consistent across both, because the seat check is guarded by a database row
lock rather than anything in application memory. Details are in [ASSUMPTIONS.md](ASSUMPTIONS.md).

## Project layout

```
docker-compose.yml          PostgreSQL + backend + frontend
docker-compose.test.yml     Runs the backend and frontend tests in Docker
backend/
  Dockerfile
  src/Admission.Api/
    Program.cs              Startup and wiring
    Endpoints/              The 8 HTTP endpoints and input validation
    Data/AdmissionStore.cs  All SQL, including the locked "create hold" transaction
    Data/Migrations/        Database schema (applied automatically at startup)
    Infrastructure/         Settings, error handling, expiry sweeper
  tests/Admission.Api.Tests/
frontend/
  Dockerfile                Builds the site and serves it with nginx
  docker/                   nginx config and the script that applies VITE_API_BASE_URL at start
  src/
    App.tsx                 Page layout, navigation and the apply / pay / cancel actions
    components/             The four screens and their parts
    lib/api.ts              Typed client for the 8 endpoints
    lib/i18n.tsx            Bangla and English texts
    lib/hooks.ts            Auto-refresh (polling), countdown clock, routing
    test/                   In-memory fake backend used by the tests
```
