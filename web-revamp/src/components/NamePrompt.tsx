import { useState } from 'react';

interface NamePromptProps {
  onSubmit: (name: string) => void;
}

export function NamePrompt({ onSubmit }: NamePromptProps) {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) {
      onSubmit(trimmed);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="name-prompt">
      <p className="name-question">What's your name?</p>
      <div className="name-input-row">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name..."
          maxLength={20}
          autoFocus
          className="name-input"
        />
        <button type="submit" className="name-submit" aria-label="Submit name">
          →
        </button>
      </div>
    </form>
  );
}
