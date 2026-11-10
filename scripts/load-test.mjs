// Fires many simultaneous applications at the backend and checks that exactly the available
// seats are held. Needs only Node.js 18+ and the application running (docker compose up).
//
//   node scripts/load-test.mjs                              one backend on http://localhost:8080
//   BACKENDS=http://localhost:8080,http://localhost:8081 node scripts/load-test.mjs
//                                                           two backends on one database
//                                                           (docker compose --profile two-backends up)
//   SEATS=25 APPLICANTS=600 node scripts/load-test.mjs      other sizes

const backends = (process.env.BACKENDS ?? 'http://localhost:8080').split(',').map((url) => url.trim().replace(/\/+$/, ''));
const seats = Number(process.env.SEATS ?? 25);
const applicants = Number(process.env.APPLICANTS ?? 600);

const created = await fetch(`${backends[0]}/classes`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: `Load test ${new Date().toISOString()}`, totalSeats: seats }),
});
if (!created.ok) {
  console.error(`Could not create a class on ${backends[0]}: HTTP ${created.status}`);
  process.exit(1);
}
const { id } = await created.json();

// A different 17-digit birth registration number for every applicant.
const firstStudent = 30000000000000000n + (BigInt(Date.now()) % 1000000000000n) * 10000n;
const started = Date.now();
const statuses = await Promise.all(
  Array.from({ length: applicants }, (_, i) =>
    fetch(`${backends[i % backends.length]}/classes/${id}/holds`, {
      method: 'POST',
      headers: { 'X-Student-Id': String(firstStudent + BigInt(i)) },
    })
      .then((response) => response.status)
      .catch((error) => `network error: ${error.cause?.code ?? error.message}`),
  ),
);

const counts = {};
for (const status of statuses) counts[status] = (counts[status] ?? 0) + 1;
console.log(`${applicants} applications for ${seats} seats via ${backends.length} backend(s) in ${Date.now() - started} ms`);
console.log('responses by status:', counts);
for (const backend of backends) {
  console.log(backend, await (await fetch(`${backend}/classes/${id}`)).json());
}

const passed = counts[201] === seats && counts[409] === applicants - seats;
console.log(passed ? 'PASS: exactly the available seats were held' : 'FAIL: unexpected result');
process.exit(passed ? 0 : 1);
