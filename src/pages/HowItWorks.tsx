import { ButtonLink } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/primitives';
import { useAuth } from '../context/AuthContext';

/**
 * How it works.
 *
 * Written as documentation, not as marketing copy: it explains the rules the
 * system actually enforces, including the ones that constrain users, because those
 * are the parts people need to know before they rely on it.
 */
export function HowItWorksPage() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="container-page py-6 lg:py-8">
      <div className="max-w-3xl">
        <h1 className="text-2xl sm:text-3xl">How it works</h1>
        <p className="mt-1.5 text-ink-600">
          The rules below are enforced by the platform, not just described here.
        </p>

        <section className="mt-8" aria-labelledby="students-heading">
          <h2 id="students-heading" className="text-xl">
            If you need help
          </h2>
          <ol className="mt-3 space-y-3">
            {[
              {
                title: 'Search without an account',
                body: 'Browsing tutors, reading reviews and viewing availability are all open. You only need an account to request a session.',
              },
              {
                title: 'Filter to what you actually need',
                body: 'Subject, level, online or in person, maximum rate, minimum rating and the weekday you are free. Filters combine, and the URL updates so you can share or bookmark a search.',
              },
              {
                title: 'Request a published time',
                body: 'You can only pick times a tutor has published, and only at least 30 minutes in advance. Tell them the topic so they can prepare.',
              },
              {
                title: 'Wait for confirmation',
                body: 'The request starts as pending and the slot is held. Nothing is scheduled until the tutor accepts. If they decline, the time is released for someone else.',
              },
              {
                title: 'Message, meet, review',
                body: 'Messaging opens once a session is confirmed. After the tutor marks it complete you can leave one review, and it updates their public rating immediately.',
              },
            ].map((item, index) => (
              <li key={item.title} className="flex gap-3">
                <span
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-sm font-bold text-primary-800"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="text-base">{item.title}</h3>
                  <p className="mt-0.5 text-ink-700">{item.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-10" aria-labelledby="tutors-heading">
          <h2 id="tutors-heading" className="text-xl">
            If you can tutor
          </h2>
          <ol className="mt-3 space-y-3">
            {[
              {
                title: 'Publish a profile',
                body: 'A headline, a real description of how you tutor, your rate (zero is allowed), the levels you cover and at least one subject. You are not discoverable until all of that exists and you publish.',
              },
              {
                title: 'Add availability you will honour',
                body: 'Slots must be in the future, at least 30 minutes long, and cannot overlap each other. Students only ever see genuinely open times.',
              },
              {
                title: 'Accept or decline',
                body: 'Requests arrive on your dashboard. Accepting locks the slot; declining releases it. You can add a meeting link when you accept.',
              },
              {
                title: 'Complete the session',
                body: 'You mark a session complete after its start time has passed. That is what unlocks the student\u2019s review.',
              },
            ].map((item, index) => (
              <li key={item.title} className="flex gap-3">
                <span
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-sm font-bold text-primary-800"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="text-base">{item.title}</h3>
                  <p className="mt-0.5 text-ink-700">{item.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-10" aria-labelledby="rules-heading">
          <h2 id="rules-heading" className="text-xl">
            Rules worth knowing
          </h2>
          <Card className="mt-3">
            <CardBody>
              <dl className="space-y-4">
                {[
                  {
                    term: 'A time can only be booked once',
                    detail:
                      'If two students request the same slot at the same moment, exactly one succeeds. The other is told the time was taken and the availability list refreshes.',
                  },
                  {
                    term: 'Ratings come only from completed sessions',
                    detail:
                      'A review requires a session that actually finished, and only the student in that session can leave it, once. A tutor\u2019s rating is the mean of those reviews and nothing else.',
                  },
                  {
                    term: 'Cancelling frees the time',
                    detail:
                      'Either side can cancel a pending or confirmed session, and the slot goes back to being open. Completed and cancelled sessions cannot be changed afterwards.',
                  },
                  {
                    term: 'No payments are handled here',
                    detail:
                      'Rates are shown so you know what to expect. Anything owed is settled between you, outside the platform.',
                  },
                ].map((item) => (
                  <div key={item.term}>
                    <dt className="font-semibold text-ink-900">{item.term}</dt>
                    <dd className="mt-0.5 text-ink-700">{item.detail}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        </section>

        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink to="/tutors">Find a tutor</ButtonLink>
          {!isAuthenticated ? (
            <ButtonLink to="/register" variant="secondary">
              Create an account
            </ButtonLink>
          ) : null}
        </div>
      </div>
    </div>
  );
}
