import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface CheckoutConfirmingOverlayProps {
  open: boolean;
  onComplete: () => void;
  onCancel: () => void;
}

export function CheckoutConfirmingOverlay({
  open,
  onComplete,
  onCancel,
}: CheckoutConfirmingOverlayProps) {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (!open) {
      setCountdown(5);
      return;
    }

    if (countdown === 0) {
      onComplete();
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [open, countdown, onComplete]);

  if (!open) return null;

  const circleSize = 120;
  const strokeWidth = 8;
  const radius = (circleSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (countdown / 5) * circumference;

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
      <div className="relative mb-8">
        <svg width={circleSize} height={circleSize} className="transform -rotate-90">
          {/* Background circle */}
          <circle
            cx={circleSize / 2}
            cy={circleSize / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="transparent"
            className="text-neutral-100"
          />
          {/* Progress circle */}
          <circle
            cx={circleSize / 2}
            cy={circleSize / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="text-black transition-all duration-1000 ease-linear"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-4xl font-bold tabular-nums">
          {countdown}
        </div>
      </div>

      <h2 className="text-2xl font-bold text-black mb-2">Confirming your order</h2>
      <p className="text-neutral-600 mb-8 max-w-[280px]">
        Your order is being placed. You can still cancel it now.
      </p>

      <button
        onClick={onCancel}
        className="px-8 py-3 rounded-2xl border border-neutral-200 text-sm font-semibold text-neutral-500 active:scale-95 transition"
      >
        Cancel Order
      </button>
    </div>,
    document.body
  );
}
