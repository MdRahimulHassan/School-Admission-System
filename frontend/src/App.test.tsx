import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { LanguageProvider, type Language } from './lib/i18n';
import { installFakeBackend } from './test/fakeBackend';

// Refresh from the server every 40 ms instead of every 3 s, so "updates without a reload" is quick to observe.
vi.mock('./lib/config', async (original) => ({
  ...(await original<typeof import('./lib/config')>()),
  POLL_INTERVAL_MS: 40,
}));

const STUDENT = '20152691234567890';
const OTHER_STUDENT = '20152691234567891';

function renderApp(language: Language = 'en') {
  return render(
    <LanguageProvider initial={language}>
      <App />
    </LanguageProvider>,
  );
}

const studentField = () => screen.getByLabelText("Student's birth registration number");

describe('class list', () => {
  it('shows total, held, confirmed and available seats for every class', async () => {
    const backend = installFakeBackend({ classes: [{ id: 'c1', name: 'Class 6 - Morning Shift', totalSeats: 120 }] });
    backend.addHold({ classId: 'c1', studentId: OTHER_STUDENT });
    backend.addHold({ classId: 'c1', studentId: '20152691234567892', status: 'CONFIRMED' });
    renderApp();

    const card = await screen.findByTestId('class-c1');
    expect(within(card).getByRole('heading', { name: 'Class 6 - Morning Shift' })).toBeInTheDocument();
    const stat = (label: string) => within(card).getByText(label).nextElementSibling;
    expect(stat('Total')).toHaveTextContent('120');
    expect(stat('On hold')).toHaveTextContent('1');
    expect(stat('Confirmed')).toHaveTextContent('1');
    expect(stat('Available')).toHaveTextContent('118');
  });

  it('updates the seat numbers by itself, without a page reload', async () => {
    const backend = installFakeBackend({ classes: [{ id: 'c1', name: 'Class 6', totalSeats: 10 }] });
    renderApp();
    const card = await screen.findByTestId('class-c1');
    expect(within(card).getByText('Available').nextElementSibling).toHaveTextContent('10');

    // Somebody else, somewhere else, takes a seat.
    backend.addHold({ classId: 'c1', studentId: OTHER_STUDENT });

    await waitFor(() => expect(within(card).getByText('Available').nextElementSibling).toHaveTextContent('9'));
    expect(within(card).getByText('On hold').nextElementSibling).toHaveTextContent('1');
  });

  it('only lets a student apply after a full 17-digit number is entered', async () => {
    installFakeBackend({ classes: [{ id: 'c1', name: 'Class 6', totalSeats: 10 }] });
    const user = userEvent.setup();
    renderApp();

    const apply = await screen.findByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();

    await user.type(studentField(), '2015269123');
    expect(apply).toBeDisabled();
    expect(screen.getByText('10 of 17 digits entered')).toBeInTheDocument();

    await user.type(studentField(), '4567890');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
    expect(screen.getByText(/Number accepted/)).toBeInTheDocument();
  });

  it('shows a full class as "No seats" and does not allow applying', async () => {
    const backend = installFakeBackend({ classes: [{ id: 'c1', name: 'Class 6', totalSeats: 1 }] });
    backend.addHold({ classId: 'c1', studentId: OTHER_STUDENT });
    localStorage.setItem('admission.studentId', STUDENT);
    renderApp();

    expect(await screen.findByRole('button', { name: 'No seats' })).toBeDisabled();
  });
});

describe('applying and paying', () => {
  it('applies, opens the application with a countdown, and confirms on payment', async () => {
    const backend = installFakeBackend({ classes: [{ id: 'c1', name: 'Class 6 - Morning Shift', totalSeats: 5 }] });
    const user = userEvent.setup();
    renderApp();
    await user.type(studentField(), STUDENT);

    await user.click(await screen.findByRole('button', { name: 'Apply' }));

    // The Application screen: status, time left, pay and cancel buttons.
    expect(await screen.findByRole('heading', { name: 'Application' })).toBeInTheDocument();
    const card = screen.getByTestId(`hold-${backend.holds[0].holdId}`);
    expect(within(card).getByText('Waiting for payment')).toBeInTheDocument();
    expect(within(card).getByTestId('countdown')).toHaveTextContent(/^(10:00|09:5\d)$/);
    expect(within(card).getByRole('button', { name: 'Cancel' })).toBeEnabled();

    await user.click(within(card).getByRole('button', { name: 'Pay admission fee' }));

    expect(await within(card).findByText('Admission confirmed')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Pay admission fee' })).not.toBeInTheDocument();
    expect(backend.holds[0].status).toBe('CONFIRMED');
    expect(backend.requests).toContainEqual(
      expect.objectContaining({ method: 'POST', path: `/holds/${backend.holds[0].holdId}/confirm`, studentId: STUDENT }),
    );
  });

  it('asks before cancelling, then cancels and frees the seat', async () => {
    const backend = installFakeBackend({ classes: [{ id: 'c1', name: 'Class 6', totalSeats: 5 }] });
    const hold = backend.addHold({ classId: 'c1', studentId: STUDENT });
    localStorage.setItem('admission.studentId', STUDENT);
    window.location.hash = '#/applications';
    const user = userEvent.setup();
    renderApp();

    const card = await screen.findByTestId(`hold-${hold.holdId}`);
    await user.click(within(card).getByRole('button', { name: 'Cancel' }));
    expect(hold.status).toBe('HELD'); // nothing happens until the user confirms

    await user.click(within(card).getByRole('button', { name: 'Yes, cancel it' }));

    expect(await within(card).findByText('Cancelled', { selector: '.badge' })).toBeInTheDocument();
    expect(hold.status).toBe('CANCELLED');
  });

  it('explains in plain words when the last seat was taken by someone else first', async () => {
    const backend = installFakeBackend({ classes: [{ id: 'c1', name: 'Class 6', totalSeats: 1 }] });
    const user = userEvent.setup();
    renderApp();
    await user.type(studentField(), STUDENT);
    const apply = await screen.findByRole('button', { name: 'Apply' });

    // The seat disappears between the last refresh and the click: the button still said "Apply".
    backend.beforeNextApply = () => backend.addHold({ classId: 'c1', studentId: OTHER_STUDENT });
    await user.click(apply);

    expect(await screen.findByRole('alert')).toHaveTextContent('Sorry, every seat in this class is taken right now.');
    // And the list immediately shows the truth.
    expect(await screen.findByRole('button', { name: 'No seats' })).toBeDisabled();
  });
});

describe('expiry', () => {
  it('turns EXPIRED and switches the pay button off when time runs out, with no reload', async () => {
    const backend = installFakeBackend({ classes: [{ id: 'c1', name: 'Class 6', totalSeats: 5 }], holdSeconds: 1 });
    const hold = backend.addHold({ classId: 'c1', studentId: STUDENT });
    localStorage.setItem('admission.studentId', STUDENT);
    window.location.hash = `#/applications/${hold.holdId}`;
    renderApp();

    const card = await screen.findByTestId(`hold-${hold.holdId}`);
    expect(within(card).getByText('Waiting for payment')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Pay admission fee' })).toBeEnabled();

    await waitFor(() => expect(within(card).getByText('Time ran out')).toBeInTheDocument(), { timeout: 4000 });
    expect(within(card).getByText('EXPIRED')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Pay admission fee' })).toBeDisabled();
    expect(within(card).queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });
});

describe('coming back later', () => {
  it('still shows the running application after a refresh or reopening the browser', async () => {
    const backend = installFakeBackend({ classes: [{ id: 'c1', name: 'Class 6 - Day Shift', totalSeats: 5 }] });
    backend.addHold({ classId: 'c1', studentId: STUDENT });
    // A new page load: nothing in memory, only what the browser stored.
    localStorage.setItem('admission.studentId', STUDENT);
    renderApp();

    expect(studentField()).toHaveValue(STUDENT);
    const banner = await screen.findByTestId('pending-banner');
    expect(banner).toHaveTextContent('Payment pending for Class 6 - Day Shift');
    expect(within(await screen.findByTestId('class-c1')).getByRole('button', { name: 'View application' })).toBeInTheDocument();
  });

  it('lists all applications of the student with their states', async () => {
    const backend = installFakeBackend({
      classes: [
        { id: 'c1', name: 'Class 6 - Morning Shift', totalSeats: 5 },
        { id: 'c2', name: 'Class 6 - Day Shift', totalSeats: 5 },
      ],
    });
    const held = backend.addHold({ classId: 'c1', studentId: STUDENT });
    const confirmed = backend.addHold({ classId: 'c2', studentId: STUDENT, status: 'CONFIRMED' });
    backend.addHold({ classId: 'c1', studentId: OTHER_STUDENT }); // not ours, must not be shown
    localStorage.setItem('admission.studentId', STUDENT);
    window.location.hash = '#/applications';
    renderApp();

    expect(within(await screen.findByTestId(`hold-${held.holdId}`)).getByText('Waiting for payment')).toBeInTheDocument();
    expect(within(screen.getByTestId(`hold-${confirmed.holdId}`)).getByText('Admission confirmed')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });
});

describe('when things go wrong', () => {
  it('says the server cannot be reached instead of showing a blank page, and recovers by itself', async () => {
    const backend = installFakeBackend({ classes: [{ id: 'c1', name: 'Class 6', totalSeats: 5 }] });
    backend.down = true;
    renderApp();

    expect(await screen.findByText(/Cannot reach the server\. The numbers shown may be out of date/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Classes' })).toBeInTheDocument();

    backend.down = false;

    expect(await screen.findByTestId('class-c1')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Cannot reach the server/)).not.toBeInTheDocument());
  });
});

describe('school admin', () => {
  it('rejects bad input with a clear message and creates a class from good input', async () => {
    const backend = installFakeBackend();
    window.location.hash = '#/admin';
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Create class' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Write the class name.');

    await user.type(screen.getByLabelText('Class name'), 'Class 6 - Morning Shift');
    await user.type(screen.getByLabelText('Number of seats'), '0');
    await user.click(screen.getByRole('button', { name: 'Create class' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Seats must be a whole number from 1 to 100,000.');
    expect(backend.classes).toHaveLength(0);

    await user.clear(screen.getByLabelText('Number of seats'));
    await user.type(screen.getByLabelText('Number of seats'), '120');
    await user.click(screen.getByRole('button', { name: 'Create class' }));

    expect(await screen.findByText('✓ “Class 6 - Morning Shift” was created with 120 seats.')).toBeInTheDocument();
    expect(backend.classes).toEqual([expect.objectContaining({ name: 'Class 6 - Morning Shift', totalSeats: 120 })]);
  });
});

describe('language', () => {
  it('starts in Bangla with Bangla digits and switches to English and back', async () => {
    installFakeBackend({ classes: [{ id: 'c1', name: 'Class 6', totalSeats: 120 }] });
    const user = userEvent.setup();
    localStorage.setItem('admission.studentId', STUDENT);
    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    expect(await screen.findByRole('button', { name: 'আবেদন করুন' })).toBeInTheDocument();
    expect(within(screen.getByTestId('class-c1')).getByText('মোট').nextElementSibling).toHaveTextContent('১২০');

    await user.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
    expect(within(screen.getByTestId('class-c1')).getByText('Total').nextElementSibling).toHaveTextContent('120');
    expect(localStorage.getItem('admission.language')).toBe('en');

    await user.click(screen.getByRole('button', { name: 'বাংলা' }));
    expect(screen.getByRole('button', { name: 'আবেদন করুন' })).toBeInTheDocument();
  });
});
