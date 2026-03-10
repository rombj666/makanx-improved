type Props = {
  status: string;
};

const STEPS = ['PREPARING', 'READY', 'COMPLETED'] as const;

export function OrderStatusStepper({ status }: Props) {
  const idx = Math.max(0, STEPS.indexOf(status as any));
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((s, i) => {
        const active = i === idx;
        const done = i < idx;
        const cls = active
          ? 'bg-black text-white'
          : done
            ? 'bg-gray-900 text-white/90'
            : 'bg-gray-100 text-gray-500';
        return (
          <div
            key={s}
            className={`px-3 py-1 rounded-full text-xs font-semibold ${cls}`}
          >
            {s === 'PREPARING' ? 'Preparing' : s === 'READY' ? 'Ready' : 'Completed'}
          </div>
        );
      })}
    </div>
  );
}

export default OrderStatusStepper;

