import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

export interface MobileBottomNavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
  badge?: number;
  to?: string;
  onSelect?: () => void;
  ariaExpanded?: boolean;
  ariaControls?: string;
}

interface MobileBottomNavProps {
  items: MobileBottomNavItem[];
  ariaLabel: string;
  className?: string;
}

function NavItemContent({ item }: { item: MobileBottomNavItem }) {
  const Icon = item.icon;
  const badge = Number(item.badge || 0);

  return (
    <>
      <span
        className={`relative flex h-8 w-10 items-center justify-center rounded-2xl transition-colors ${
          item.active ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200' : 'text-slate-500 dark:text-slate-400'
        }`}
      >
        <Icon className="h-[1.3rem] w-[1.3rem]" strokeWidth={item.active ? 2.5 : 2} aria-hidden="true" />
        {badge > 0 && (
          <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-none text-white shadow-sm ring-2 ring-white dark:ring-slate-900">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <span className={`mt-0.5 flex min-h-6 max-w-full items-center justify-center text-center text-[10px] leading-3 ${item.active ? 'font-bold text-blue-700 dark:text-blue-200' : 'font-medium text-slate-500 dark:text-slate-400'}`}>
        {item.label}
      </span>
    </>
  );
}

export default function MobileBottomNav({ items, ariaLabel, className = '' }: MobileBottomNavProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/95 ${className}`}
    >
      <div
        className="mx-auto grid min-h-[4.5rem] max-w-xl items-stretch px-1 [padding-bottom:env(safe-area-inset-bottom)]"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const itemClassName = `relative flex min-w-0 flex-col items-center justify-center px-1 py-1.5 transition active:bg-slate-100 dark:active:bg-slate-800 ${
            item.active ? 'after:absolute after:inset-x-3 after:top-0 after:h-0.5 after:rounded-full after:bg-blue-700 dark:after:bg-blue-300' : ''
          }`;
          const content = <NavItemContent item={item} />;

          if (item.to) {
            return (
              <Link
                key={item.key}
                to={item.to}
                onClick={item.onSelect}
                className={itemClassName}
                aria-current={item.active ? 'page' : undefined}
              >
                {content}
              </Link>
            );
          }

          return (
            <button
              key={item.key}
              type="button"
              onClick={item.onSelect}
              className={itemClassName}
              aria-current={item.active ? 'page' : undefined}
              aria-expanded={item.ariaExpanded}
              aria-controls={item.ariaControls}
            >
              {content}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
