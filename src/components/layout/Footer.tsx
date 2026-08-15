import { Link } from 'react-router-dom';
import { APP_NAME } from '../../lib/config';

/**
 * Deliberately small. A large footer full of links to pages that do not exist is
 * the most common form of decoration pretending to be product (AC-39). Every link
 * here goes somewhere real.
 */
export function Footer() {
  return (
    <footer className="mt-12 border-t border-ink-200 bg-white">
      <div className="container-page flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold text-ink-900">{APP_NAME}</p>
          <p className="mt-1 text-sm text-ink-600">
            Peer tutoring for students, by students.
          </p>
        </div>

        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <li>
              <Link to="/tutors" className="text-ink-700 underline-offset-2 hover:underline">
                Find a tutor
              </Link>
            </li>
            <li>
              <Link to="/subjects" className="text-ink-700 underline-offset-2 hover:underline">
                Subjects
              </Link>
            </li>
            <li>
              <Link
                to="/how-it-works"
                className="text-ink-700 underline-offset-2 hover:underline"
              >
                How it works
              </Link>
            </li>
            <li>
              <Link to="/register" className="text-ink-700 underline-offset-2 hover:underline">
                Become a tutor
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
