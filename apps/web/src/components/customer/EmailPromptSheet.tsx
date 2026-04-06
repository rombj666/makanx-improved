import { createPortal } from 'react-dom';

interface EmailPromptSheetProps {
  open: boolean;
  emailDraft: string;
  emailTouched: boolean;
  isEmailValid: boolean;
  onEmailChange: (v: string) => void;
  onEmailBlur: () => void;
  onContinueWithEmail: () => void;
  onSkip: () => void;
  onClose: () => void;
}

export function EmailPromptSheet({
  open,
  emailDraft,
  emailTouched,
  isEmailValid,
  onEmailChange,
  onEmailBlur,
  onContinueWithEmail,
  onSkip,
  onClose,
}: EmailPromptSheetProps) {
  if (!open) return null;
  const sheet = (
    <div className="fixed inset-0 z-50 bg-black/60" onMouseDown={onClose} onTouchStart={onClose}>
      <div
        className="absolute inset-x-0 bottom-0 bg-white rounded-t-3xl shadow-2xl border-t border-neutral-200"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-3 flex items-center justify-between">
          <div className="text-base font-semibold text-black truncate">Get order updates by email</div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full border border-neutral-200 text-black bg-white active:scale-95 transition"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-5 pb-5">
          <div className="text-sm text-neutral-700 leading-snug">
            Enter your email to receive order ready updates.
          </div>

          <div className="mt-5 rounded-2xl border border-neutral-200 bg-white p-4">
            <div className="text-sm font-semibold text-black">Email address</div>
            <input
              value={emailDraft}
              onChange={(e) => onEmailChange(e.target.value)}
              onBlur={onEmailBlur}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              className={`mt-3 w-full rounded-2xl border px-4 py-3 text-sm outline-none ${
                emailTouched && !isEmailValid ? 'border-red-500' : 'border-neutral-200'
              }`}
            />
            {emailTouched && !isEmailValid ? (
              <div className="mt-2 text-xs font-semibold text-red-600">Please enter a valid email address.</div>
            ) : null}
          </div>

          <button
            onClick={onContinueWithEmail}
            className="mt-4 w-full bg-black text-white rounded-2xl py-4 text-base font-semibold shadow-xl active:scale-[0.99] transition"
          >
            Continue with Email
          </button>
          <button
            onClick={onSkip}
            className="mt-3 w-full rounded-2xl py-3 text-sm font-semibold active:scale-[0.99] transition bg-white border border-neutral-200 text-neutral-700"
          >
            Skip for now
          </button>

          <div className="pb-[max(env(safe-area-inset-bottom),12px)]" />
        </div>
      </div>
    </div>
  );
  return createPortal(sheet, document.body);
}
