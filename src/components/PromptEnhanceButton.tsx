import { LoaderCircle, WandSparkles } from 'lucide-react';

type PromptEnhanceButtonProps = {
  busy?: boolean;
  available?: boolean;
  disabled?: boolean;
  onClick?: () => void;
};

export function PromptEnhanceButton({ busy = false, available = true, disabled = false, onClick }: PromptEnhanceButtonProps) {
  const unavailable = !available;
  const title = unavailable ? 'Connect Codex to enhance prompts' : busy ? 'Codex is enhancing this prompt' : 'Enhance this prompt with Codex';
  return (
    <button
      type="button"
      className={`enhance-prompt-button ${busy ? 'is-busy' : ''}`}
      disabled={disabled || busy || unavailable}
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-busy={busy}
    >
      {busy ? <LoaderCircle className="spin" size={11} /> : <WandSparkles size={11} />}
      <span>{busy ? 'Enhancing…' : 'Enhance'}</span>
    </button>
  );
}
