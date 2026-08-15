import { ButtonLink } from '../components/ui/Button';

export function NotFoundPage() {
  return (
    <div className="container-page flex min-h-[55vh] flex-col items-center justify-center py-12 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">
        404
      </p>
      <h1 className="mt-2 text-2xl sm:text-3xl">We cannot find that page</h1>
      <p className="mt-2 max-w-md text-ink-600">
        The link may be out of date, or the page may have moved. These still work:
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <ButtonLink to="/tutors">Find a tutor</ButtonLink>
        <ButtonLink to="/subjects" variant="secondary">
          Browse subjects
        </ButtonLink>
        <ButtonLink to="/" variant="ghost">
          Home
        </ButtonLink>
      </div>
    </div>
  );
}
