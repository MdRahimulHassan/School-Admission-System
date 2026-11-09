import { vi } from 'vitest';
import type { ClassInfo, HoldStatus } from '../lib/api';

interface FakeHold {
  holdId: string;
  classId: string;
  studentId: string;
  status: HoldStatus;
  /** Milliseconds since epoch. */
  deadline: number;
}

export interface FakeBackend {
  classes: { id: string; name: string; totalSeats: number }[];
  holds: FakeHold[];
  /** When true every request fails like a server that is switched off. */
  down: boolean;
  /** Runs once, just before the next application is processed: "someone else got there first". */
  beforeNextApply?: () => void;
  /** Every request the UI made: "POST /classes/c1/holds". */
  requests: { method: string; path: string; studentId: string | null; body: unknown }[];
  addHold(hold: Partial<FakeHold> & { classId: string; studentId: string }): FakeHold;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const error = (status: number, code: string) => json(status, { error: code, message: `server says ${code}` });

/**
 * A small in-memory stand-in for the real backend with the same contract and the same rules
 * (seat limit, one application per class, expiry, ownership). Installed in place of fetch().
 */
export function installFakeBackend(seed: { classes?: FakeBackend['classes']; holdSeconds?: number } = {}): FakeBackend {
  const holdMs = (seed.holdSeconds ?? 600) * 1000;
  let nextId = 1;

  const backend: FakeBackend = {
    classes: seed.classes ?? [],
    holds: [],
    down: false,
    requests: [],
    addHold(hold) {
      const created: FakeHold = { holdId: `h${nextId++}`, status: 'HELD', deadline: Date.now() + holdMs, ...hold };
      backend.holds.push(created);
      return created;
    },
  };

  const statusOf = (hold: FakeHold): HoldStatus =>
    hold.status === 'HELD' && hold.deadline <= Date.now() ? 'EXPIRED' : hold.status;

  const seatsOf = (item: FakeBackend['classes'][number]): ClassInfo => {
    const holds = backend.holds.filter((hold) => hold.classId === item.id);
    const heldSeats = holds.filter((hold) => statusOf(hold) === 'HELD').length;
    const confirmedSeats = holds.filter((hold) => hold.status === 'CONFIRMED').length;
    return { ...item, heldSeats, confirmedSeats, availableSeats: item.totalSeats - heldSeats - confirmedSeats };
  };

  const holdJson = (hold: FakeHold, withStudent: boolean) => ({
    holdId: hold.holdId,
    classId: hold.classId,
    className: backend.classes.find((item) => item.id === hold.classId)?.name,
    ...(withStudent ? { studentId: hold.studentId } : {}),
    status: statusOf(hold),
    expiresAt: new Date(hold.deadline).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    remainingSeconds: statusOf(hold) === 'HELD' ? (hold.deadline - Date.now()) / 1000 : 0,
  });

  const handle = (method: string, path: string, studentId: string | null, body: unknown): Response => {
    const needStudent = () => (studentId && /^\d{17}$/.test(studentId) ? null : error(400, 'STUDENT_ID_INVALID'));
    let match: RegExpMatchArray | null;

    if (method === 'GET' && path === '/classes') return json(200, backend.classes.map(seatsOf));

    if (method === 'POST' && path === '/classes') {
      const { name, totalSeats } = body as { name: string; totalSeats: number };
      const created = { id: `c${nextId++}`, name, totalSeats };
      backend.classes.push(created);
      return json(201, seatsOf(created));
    }

    if (method === 'POST' && (match = path.match(/^\/classes\/([^/]+)\/holds$/))) {
      const item = backend.classes.find((candidate) => candidate.id === match![1]);
      if (!item) return error(404, 'CLASS_NOT_FOUND');
      const bad = needStudent();
      if (bad) return bad;
      backend.beforeNextApply?.();
      backend.beforeNextApply = undefined;
      const active =(hold: FakeHold) => statusOf(hold) === 'HELD' || hold.status === 'CONFIRMED';
      if (backend.holds.some((hold) => hold.classId === item.id && hold.studentId === studentId && active(hold))) {
        return error(409, 'ALREADY_APPLIED');
      }
      if (seatsOf(item).availableSeats <= 0) return error(409, 'NO_SEATS_AVAILABLE');
      return json(201, holdJson(backend.addHold({ classId: item.id, studentId: studentId! }), true));
    }

    if (method === 'GET' && path === '/me/holds') {
      const bad = needStudent();
      if (bad) return bad;
      return json(200, backend.holds.filter((hold) => hold.studentId === studentId).map((hold) => holdJson(hold, true)));
    }

    if ((match = path.match(/^\/holds\/([^/]+)(\/confirm)?$/))) {
      const hold = backend.holds.find((candidate) => candidate.holdId === match![1]);
      if (!hold) return error(404, 'HOLD_NOT_FOUND');
      if (method === 'GET' && !match[2]) return json(200, holdJson(hold, false));

      const bad = needStudent();
      if (bad) return bad;
      if (hold.studentId !== studentId) return error(403, 'NOT_YOUR_HOLD');
      const status = statusOf(hold);

      if (method === 'POST' && match[2]) {
        if (status === 'EXPIRED') return error(409, 'HOLD_EXPIRED');
        if (status === 'CANCELLED') return error(409, 'HOLD_CANCELLED');
        hold.status = 'CONFIRMED';
        return json(200, holdJson(hold, true));
      }
      if (method === 'DELETE' && !match[2]) {
        if (status === 'CONFIRMED') return error(409, 'HOLD_ALREADY_CONFIRMED');
        if (status === 'EXPIRED') return error(409, 'HOLD_EXPIRED');
        hold.status = 'CANCELLED';
        return new Response(null, { status: 204 });
      }
    }

    return error(404, 'NOT_FOUND');
  };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const path = new URL(String(input)).pathname;
      const studentId = new Headers(init?.headers).get('X-Student-Id');
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      backend.requests.push({ method, path, studentId, body });

      if (backend.down) throw new TypeError('Failed to fetch');
      return handle(method, path, studentId, body);
    }),
  );

  return backend;
}
