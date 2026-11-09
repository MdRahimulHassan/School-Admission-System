# AI usage

## Tool

**Claude Code** (Anthropic's Claude, running as a coding agent in the terminal).

## Where it was used

The backend was built with heavy AI assistance. I gave the requirements from the brief, decided
the order of work, answered the open questions and reviewed the result; Claude Code wrote most of
the code and ran the checks.

| Area | AI involvement |
|------|----------------|
| Development environment setup (.NET SDK, GitHub CLI, Docker checks) | Done by the AI |
| Backend design (per-class row lock, expiry by database clock, derived seat counts) | Proposed by the AI, with the reasoning recorded in `ASSUMPTIONS.md` |
| Backend code: endpoints, SQL, migrations, error handling, expiry sweeper | Written by the AI |
| Automated tests, including the concurrency tests | Written by the AI |
| `Dockerfile`, `docker-compose.yml`, `docker-compose.test.yml` | Written by the AI |
| `README.md`, `ASSUMPTIONS.md`, first draft of this file | Written by the AI |

## Where the AI got it wrong, and how it was caught

1. **A test that could never fail.** In the main concurrency test the AI first wrote
   `Assert.All(refused, async r => Assert.Equal(..., await r.ErrorCodeAsync()))`. `Assert.All`
   takes a synchronous callback, so the `async` lambda returns immediately and its assertion is
   never observed: the check would have passed even with wrong error codes. It was caught when
   re-reading the test before the first run, and replaced with a plain `foreach` that awaits each
   response.

2. **A test setup that could not run on the development machine.** The first plan used
   Testcontainers and running `dotnet test` directly. The laptop's Windows Smart App Control
   refused to load freshly compiled, unsigned .NET assemblies ("An Application Control policy has
   blocked this file"), so nothing built locally could be executed. Instead of weakening a
   security setting, the tests were moved into Docker (`docker-compose.test.yml`) and
   Testcontainers was removed. This also means the reviewer needs only Docker to run them.

3. **Noisy, misleading error lines in the container log.** The first working image logged
   `Error: libgssapi_krb5.so.2: cannot open shared object file` on every new database connection,
   plus a warning about overriding `HTTP_PORTS`. Nothing was broken (the database driver probes
   for Kerberos and falls back), but an "Error" line in a healthy system is a trap for whoever
   reads the logs later. It was caught by reading the container logs after a load test, and fixed
   by switching the probe off and by not configuring the port in two places.

4. **A wrong file path in the AI's first manual smoke test**, which made the application look as
   if it had failed to start. Reading the captured output showed the real cause; no project code
   was affected.

## What was checked independently of the AI's own claims

- The whole test suite runs in Docker against a real PostgreSQL (59 tests passing).
- A separate load test outside the test suite sent 600 simultaneous applications over real HTTP to
  **two running backend containers** sharing one database, for a class with 25 seats: exactly 25
  were granted, 575 received `409`, and both backends reported `heldSeats: 25`.
- `docker compose down` followed by `docker compose up` was run by hand to confirm data is kept.
- Every endpoint was called by hand and its response compared field by field with the contract in
  the brief.
