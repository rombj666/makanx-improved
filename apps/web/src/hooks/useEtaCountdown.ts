import { useEffect, useRef } from 'react';

export function useEtaCountdown(onTick: () => void, intervalMs: number = 60000) {
  const savedCallback = useRef(onTick);

  useEffect(() => {
    savedCallback.current = onTick;
  }, [onTick]);

  useEffect(() => {
    const id = setInterval(() => {
      savedCallback.current();
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
