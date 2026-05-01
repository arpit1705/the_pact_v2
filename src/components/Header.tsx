import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', emoji: '🏠' },
  { path: '/treats', label: 'Treats', emoji: '🎁' },
  { path: '/my-treats', label: 'My Treats', emoji: '✏️' },
  { path: '/history', label: 'History', emoji: '📜' },
];

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pillOpen, setPillOpen] = useState(false);
  const location = useLocation();
  const { profile, signOut } = useAuth();

  return (
    <header className="brutal-card rounded-none border-x-0 border-t-0 mb-6">
      <div className="container relative flex items-center justify-between py-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-3xl animate-spin-slow inline-block">⚖️</span>
          <div>
            <h1 className="text-2xl md:text-3xl font-heading leading-none text-secondary">THE PACT</h1>
            <p className="font-mono text-[10px] text-muted-foreground italic hidden sm:block">
              A binding covenant of accountability
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          <nav className="hidden md:flex items-center gap-2">
            {NAV_ITEMS.map(item => (
              <Link
                key={item.path}
                to={item.path}
                className={`brutal-btn px-5 py-2.5 rounded-lg text-xl ${
                  location.pathname === item.path
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-accent text-accent-foreground hover:bg-primary hover:text-primary-foreground'
                }`}
              >
                {item.emoji} {item.label}
              </Link>
            ))}
          </nav>

          <div className="relative">
            <button
              onClick={() => setPillOpen(p => !p)}
              className="brutal-btn px-3 py-2 rounded-full bg-secondary text-secondary-foreground text-lg font-heading animate-bounce-in flex items-center gap-1.5"
            >
              <span>{profile?.emoji}</span>
              <span className="hidden sm:inline">{profile?.name}</span>
              <span className="font-mono text-xs opacity-70">▼</span>
            </button>

            {pillOpen && (
              <div className="absolute top-full right-0 mt-2 brutal-card bg-background p-2 z-50 min-w-[160px]">
                <button
                  onClick={() => { signOut(); setPillOpen(false); }}
                  className="w-full text-left brutal-btn px-3 py-2.5 rounded-lg text-lg bg-muted hover:bg-destructive hover:text-destructive-foreground"
                >
                  🚪 Sign Out
                </button>
              </div>
            )}
          </div>

          <button
            className="md:hidden brutal-btn p-2 rounded-lg bg-accent"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="md:hidden border-t-3 border-foreground p-4 flex flex-col gap-2">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMenuOpen(false)}
              className={`brutal-btn px-4 py-3 rounded-lg text-center text-xl ${
                location.pathname === item.path
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-accent text-accent-foreground'
              }`}
            >
              {item.emoji} {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
