type Props = {
  status: string;
};

const STEPS = ['PREPARING', 'READY'] as const;

export function OrderStatusStepper({ status }: Props) {
  const normalized = String(status || '').toUpperCase();
  const idx = Math.max(0, STEPS.indexOf(normalized as any));
  if (normalized === 'READY') {
    // If it's already done, just show full progress on READY
    return (
      <div className="w-full">
        <div className="relative px-4">
          <div className="absolute left-0 right-0 top-4 h-1 rounded-full bg-black" />
          <div className="relative flex items-start justify-between">
            {STEPS.map((s, i) => (
              <div key={s} className="flex flex-col items-center w-1/2">
                <div className="w-9 h-9 rounded-full border-2 flex items-center justify-center text-xs font-extrabold bg-black border-black text-white">
                  {i + 1}
                </div>
                <div className="mt-2 text-xs font-semibold tracking-wide uppercase text-black">
                  {s === 'PREPARING' ? 'Preparing' : 'Ready'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="w-full">
      <div className="relative px-4">
        <div className="absolute left-0 right-0 top-4 h-1 rounded-full bg-neutral-200" />
        <div
          className="absolute left-0 top-4 h-1 rounded-full bg-black transition-all"
          style={{ width: `${(idx / (STEPS.length - 1)) * 100}%` }}
        />

        <div className="relative flex items-start justify-between">
          {STEPS.map((s, i) => {
            const done = i < idx;
            const active = i === idx;
            const circle = active || done ? 'bg-black border-black text-white' : 'bg-white border-neutral-300 text-neutral-400';
            const label = active || done ? 'text-black' : 'text-neutral-500';
            return (
              <div key={s} className="flex flex-col items-center w-1/2">
                <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center text-xs font-extrabold ${circle}`}>
                  {i + 1}
                </div>
                <div className={`mt-2 text-xs font-semibold tracking-wide uppercase ${label}`}>
                  {s === 'PREPARING' ? 'Preparing' : 'Ready'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default OrderStatusStepper;
