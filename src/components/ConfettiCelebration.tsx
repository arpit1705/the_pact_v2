import { useEffect, useState } from 'react';

export function ConfettiCelebration({ onDone }: { onDone: () => void }) {
  const [particles] = useState(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      emoji: ['🎉', '✅', '💪', '🔥', '⭐'][Math.floor(Math.random() * 5)],
    }))
  );

  useEffect(() => {
    const timer = setTimeout(onDone, 2000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30" onClick={onDone}>
      <div className="text-center animate-bounce-in">
        <p className="text-7xl mb-4">✅</p>
        <h2 className="text-4xl font-heading text-success">CRUSHED IT!</h2>
        <p className="font-mono text-sm text-muted-foreground mt-2">The pact is pleased. 🫡</p>
      </div>
      {particles.map(p => (
        <span
          key={p.id}
          className="absolute text-2xl animate-confetti pointer-events-none"
          style={{ left: `${p.left}%`, bottom: '30%', animationDelay: `${p.delay}s` }}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}
