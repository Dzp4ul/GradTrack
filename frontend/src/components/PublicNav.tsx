import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

type PublicNavProps = {
  active?: 'about' | 'faq' | 'privacy';
};

export default function PublicNav({ active }: PublicNavProps) {
  const [open, setOpen] = useState(false);
  const navLinkClass = (isActive = false) =>
    `block rounded-lg px-3 py-2 font-medium transition ${
      isActive ? 'text-yellow-400' : 'text-white hover:bg-white/10 hover:text-yellow-400'
    }`;

  return (
    <nav className="sticky top-0 z-50 bg-blue-900/95 shadow-lg backdrop-blur-sm">
      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-16 items-center justify-between gap-3 py-3 sm:min-h-20">
          <Link to="/" className="flex min-w-0 items-center gap-3" onClick={() => setOpen(false)}>
            <img
              src="/Gradtrack_small.png"
              alt="Norzagaray College"
              className="h-12 w-12 flex-shrink-0 object-contain sm:h-16 sm:w-16"
            />
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-tight text-white sm:text-xl">GradTrack</h1>
              <p className="truncate text-xs text-blue-100 sm:text-sm">Graduate Tracer System</p>
            </div>
          </Link>

          <div className="hidden items-center gap-2 md:flex">
            <Link to="/about" className={navLinkClass(active === 'about')}>
              About
            </Link>
            <Link to="/faq" className={navLinkClass(active === 'faq')}>
              FAQs
            </Link>
            <Link
              to="/graduate/signin"
              className="rounded-lg bg-white px-5 py-2.5 font-semibold text-blue-900 shadow-md transition hover:bg-gray-100"
            >
              Graduate Portal
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-white/20 md:hidden"
            aria-expanded={open}
            aria-label="Toggle navigation"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {open && (
          <div className="border-t border-white/10 pb-4 md:hidden">
            <div className="grid gap-2 pt-3">
              <Link to="/about" onClick={() => setOpen(false)} className={navLinkClass(active === 'about')}>
                About
              </Link>
              <Link to="/faq" onClick={() => setOpen(false)} className={navLinkClass(active === 'faq')}>
                FAQ
              </Link>
              <Link
                to="/graduate/signin"
                onClick={() => setOpen(false)}
                className="rounded-lg bg-white px-4 py-3 text-center font-semibold text-blue-900 transition hover:bg-gray-100"
              >
                Graduate Portal
              </Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
