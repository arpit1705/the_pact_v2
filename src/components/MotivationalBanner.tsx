import { useState, useEffect } from 'react';

const QUOTES = [
  "Skipping leg day is a war crime under Article III. 🦵⚖️",
  "The pact remembers. The pact always remembers. 👁️",
  "Gains incoming. Excuses outgoing. 💪📤",
  "Your muscles have a legal right to be sore. 📜",
  "Love is patient. The Pact is not. ❤️‍🔥",
  "Sweat now or suffer later. Actually, you'll suffer either way. 😈",
  "This relationship runs on protein and accountability. 🥩⚡",
  "Signed, sealed, and squatted. 🏋️",
  "No reps left behind. No excuses accepted. 🚫",
  "Clause 7: Excuses void all cuddle privileges. 🫠",
];

export function MotivationalBanner() {
  const [index, setIndex] = useState(Math.floor(Math.random() * QUOTES.length));

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex(prev => (prev + 1) % QUOTES.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="brutal-card bg-secondary text-secondary-foreground p-4 text-center">
      <p className="font-mono text-base md:text-lg font-bold italic animate-bounce-in" key={index}>
        "{QUOTES[index]}"
      </p>
    </div>
  );
}
