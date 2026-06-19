import { useState } from 'react';
import { KeyRound, ChevronDown, ChevronUp, Sparkles, Mic } from 'lucide-react';
import { SecureInput } from './SecureInput';

interface ApiKeysProps {
  groqKey: string;
  deepgramKey: string;
  openaiKey: string;
  onGroqKeySave: (key: string) => void;
  onDeepgramKeySave: (key: string) => void;
  onOpenAIKeySave: (key: string) => void;
}

export function ApiKeys({
  groqKey,
  deepgramKey,
  openaiKey,
  onGroqKeySave,
  onDeepgramKeySave,
  onOpenAIKeySave,
}: ApiKeysProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <section className="bg-surface rounded-2xl overflow-hidden">
      <button
        onClick={() => setAdvancedOpen((o) => !o)}
        className="w-full flex items-center justify-between p-4"
      >
        <div className="flex items-center gap-2 text-gray-300">
          <KeyRound className="w-5 h-5" />
          <h2 className="font-semibold text-white">Advanced API Keys</h2>
        </div>
        {advancedOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
      </button>
      {advancedOpen && (
        <div className="px-4 pb-4 space-y-5">
          <p className="text-xs text-gray-400">
            Stored locally. Usually not needed because the app uses built-in keys.
          </p>
          <SecureInput
            label="Groq API Key"
            icon={Sparkles}
            value={groqKey}
            placeholder="gsk_..."
            onSave={onGroqKeySave}
          />
          <SecureInput
            label="Deepgram API Key"
            icon={Mic}
            value={deepgramKey}
            placeholder="..."
            onSave={onDeepgramKeySave}
          />
          <SecureInput
            label="OpenAI API Key"
            icon={Sparkles}
            value={openaiKey}
            placeholder="sk-..."
            onSave={onOpenAIKeySave}
          />
        </div>
      )}
    </section>
  );
}
