import { useRef, useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { RefreshCw } from 'lucide-react';

interface Booth {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  status: string;
  vendor?: {
    businessName: string;
  };
}

interface Viewport {
  scale: number;
  x: number;
  y: number;
}

interface MapCanvasProps {
  mapImageUrl?: string;
  booths: Booth[];
  readOnly?: boolean;
  onBoothUpdate?: (id: string, data: Partial<Booth>) => void;
  onBoothClick?: (booth: Booth) => void;
  selectedBoothId?: string | null;
  onBackgroundClick?: () => void;
  viewport?: Viewport;
  onViewportChange?: (v: Viewport) => void;
  centerRequestKey?: number;
  onFixMap?: () => void;
  myBoothId?: string | null;
}

export function MapCanvas({ 
  mapImageUrl, 
  booths, 
  readOnly = false, 
  onBoothUpdate, 
  onBoothClick,
  selectedBoothId,
  onBackgroundClick,
  viewport = { scale: 1, x: 0, y: 0 },
  onViewportChange,
  centerRequestKey = 0,
  onFixMap,
  myBoothId = null
}: MapCanvasProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [imageError, setImageError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  
  // =========================
  // Customer (readOnly) Zoom/Pan State
  // =========================
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [roTransition, setRoTransition] = useState<string>('none');
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDistanceRef = useRef<number | null>(null);
  const lastPinchMidRef = useRef<{ x: number; y: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const fitScaleRef = useRef(1);
  const roTapRef = useRef<{ x: number; y: number; start: number } | null>(null);

  const clampPositionRO = useCallback(
    (next: { x: number; y: number }, nextScale: number) => {
      if (!containerRef.current || naturalSize.width === 0 || naturalSize.height === 0) {
        return next;
      }
      const { clientWidth: vw, clientHeight: vh } = containerRef.current;
      const scaledW = naturalSize.width * nextScale;
      const scaledH = naturalSize.height * nextScale;

      let x = next.x;
      let y = next.y;

      if (scaledW <= vw) {
        x = (vw - scaledW) / 2;
      } else {
        x = clamp(x, vw - scaledW, 0);
      }

      if (scaledH <= vh) {
        y = (vh - scaledH) / 2;
      } else {
        y = clamp(y, vh - scaledH, 0);
      }

      return { x, y };
    },
    [clamp, naturalSize.height, naturalSize.width]
  );
  
  // Reset natural size when map URL changes to ensure fitToView triggers on new load
  useEffect(() => {
    setNaturalSize({ width: 0, height: 0 });
  }, [mapImageUrl]);
  
  // Robust fitToView Logic (Organizer only)
  const fitToView = useCallback(() => {
    if (readOnly) return;
    if (!wrapperRef.current || naturalSize.width === 0 || naturalSize.height === 0) return;

    const { clientWidth, clientHeight } = wrapperRef.current;
    const scaleX = clientWidth / naturalSize.width;
    const scaleY = clientHeight / naturalSize.height;
    const s = Math.min(scaleX, scaleY) * 0.95;
    const x = (clientWidth - naturalSize.width * s) / 2;
    const y = (clientHeight - naturalSize.height * s) / 2;
    onViewportChange?.({ scale: s, x, y });
  }, [naturalSize, onViewportChange, readOnly]);

  // Interaction State
  const [dragging, setDragging] = useState<{
    mode: 'pan' | 'booth' | 'resize' | null;
    pointerId: number | null;
    startX: number;
    startY: number;
    startTx: number;
    startTy: number;
    boothId?: string;
    boothStartX?: number;
    boothStartY?: number;
    // Resize specific
    resizeDir?: string; // nw, ne, sw, se
    startWidth?: number;
    startHeight?: number;
    captureEl?: HTMLElement | null;
  }>({
    mode: null,
    pointerId: null,
    startX: 0,
    startY: 0,
    startTx: 0,
    startTy: 0,
    captureEl: null
  });

  // Fit triggers (Organizer only)
  useEffect(() => {
    if (readOnly) return;
    if (naturalSize.width > 0 && naturalSize.height > 0 && dragging.mode === null) {
      fitToView();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naturalSize, fitToView, readOnly]);

  // Center button request (Organizer only)
  useEffect(() => {
    if (readOnly) return;
    if (centerRequestKey > 0) {
      fitToView();
    }
  }, [centerRequestKey, fitToView, readOnly]);

  // ResizeObserver for wrapper (Organizer only)
  useEffect(() => {
    if (readOnly) return;
    if (!wrapperRef.current) return;
    
    const resizeObserver = new ResizeObserver(() => {
       // Do not auto-fit while dragging; otherwise fit
       if (dragging.mode === null) {
         fitToView();
       }
    });
    
    resizeObserver.observe(wrapperRef.current);
    return () => resizeObserver.disconnect();
  }, [fitToView, dragging.mode, readOnly]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setNaturalSize({ width: naturalWidth, height: naturalHeight });
    setImageError(false);
    // fitToView will trigger via useEffect [naturalSize]
  };

  const hasCenteredInitialRO = useRef(false);
  useEffect(() => {
    if (!readOnly) return;
    if (hasCenteredInitialRO.current) return;
    if (!containerRef.current) return;
    if (naturalSize.width === 0 || naturalSize.height === 0) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const scaleFit = Math.min(
      clientWidth / naturalSize.width,
      clientHeight / naturalSize.height
    );
    const newX = (clientWidth - naturalSize.width * scaleFit) / 2;
    const newY = (clientHeight - naturalSize.height * scaleFit) / 2;
    setScale(scaleFit);
    fitScaleRef.current = scaleFit;
    setPosition({ x: newX, y: newY });
    hasCenteredInitialRO.current = true;
  }, [naturalSize, readOnly]);

  useEffect(() => {
    if (!readOnly) return;
    if (!containerRef.current) return;
    if (naturalSize.width === 0 || naturalSize.height === 0) return;

    const ro = new ResizeObserver(() => {
      if (!containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      const fit = Math.min(clientWidth / naturalSize.width, clientHeight / naturalSize.height);
      fitScaleRef.current = fit;
      setScale((prev) => Math.max(prev, fit));
      setPosition((p) => clampPositionRO(p, Math.max(scale, fit)));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [clampPositionRO, naturalSize, readOnly, scale]);

  useEffect(() => {
    if (!readOnly) return;
    if (!containerRef.current) return;
    if (naturalSize.width === 0 || naturalSize.height === 0) return;

    const booth = selectedBoothId ? booths.find((b) => b.id === selectedBoothId) : null;
    const vw = containerRef.current.clientWidth;
    const vh = containerRef.current.clientHeight;

    const fit = Math.min(vw / naturalSize.width, vh / naturalSize.height);
    fitScaleRef.current = fit;

    if (!booth) {
      const newX = (vw - naturalSize.width * fit) / 2;
      const newY = (vh - naturalSize.height * fit) / 2;
      setRoTransition('transform 420ms cubic-bezier(0.2, 0.9, 0.2, 1)');
      setScale(fit);
      setPosition(clampPositionRO({ x: newX, y: newY }, fit));
      const t = setTimeout(() => setRoTransition('none'), 450);
      return () => clearTimeout(t);
    }

    const centerX = booth.x + booth.width / 2;
    const centerY = booth.y + booth.height / 2;
    const desiredScale = clamp(fit * 2.25, fit, fit * 3);
    const targetX = vw / 2;
    const targetY = vh * 0.38;
    const nextX = targetX - centerX * desiredScale;
    const nextY = targetY - centerY * desiredScale;

    setRoTransition('transform 420ms cubic-bezier(0.2, 0.9, 0.2, 1)');
    setScale(desiredScale);
    setPosition(clampPositionRO({ x: nextX, y: nextY }, desiredScale));
    const t = setTimeout(() => setRoTransition('none'), 450);
    return () => clearTimeout(t);
  }, [booths, clamp, clampPositionRO, naturalSize, readOnly, selectedBoothId]);

  const hasCenteredRef = useRef(false);
  useEffect(() => {
    if (!myBoothId || hasCenteredRef.current) return;
    const b = booths.find(b => b.id === myBoothId);
    if (!b || !wrapperRef.current) return;
    const { clientWidth, clientHeight } = wrapperRef.current;
    const centerX = b.x + b.width / 2;
    const centerY = b.y + b.height / 2;
    const x = clientWidth / 2 - centerX * viewport.scale;
    const y = clientHeight / 2 - centerY * viewport.scale;
    onViewportChange?.({ ...viewport, x, y });
    hasCenteredRef.current = true;
  }, [myBoothId, booths, onViewportChange, viewport]);

  const handlePointerDown = (e: React.PointerEvent) => {
    // A) Pan must work even when readOnly=true (removed readOnly check)
    // Only left click (0) or middle click (1)
    if (e.button !== 0 && e.button !== 1) return;

    const target = e.currentTarget as HTMLElement; // B) Use currentTarget (wrapper) for stability
    
    target.setPointerCapture(e.pointerId);
    
    setDragging({
      mode: 'pan',
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTx: viewport.x,
      startTy: viewport.y,
      captureEl: target
    });
    e.preventDefault();
  };

  const handleBoothPointerDown = (e: React.PointerEvent, booth: Booth) => {
    if (readOnly) {
       e.stopPropagation();
       if (selectedBoothId !== booth.id) {
         onBoothClick?.(booth);
       }
       return;
    }

    e.stopPropagation();
    e.preventDefault();

    if (selectedBoothId !== booth.id) {
      onBoothClick?.(booth);
    }

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    setDragging({
      mode: 'booth',
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTx: 0, 
      startTy: 0,
      boothId: booth.id,
      boothStartX: booth.x,
      boothStartY: booth.y,
      captureEl: target
    });
  };

  const handleResizePointerDown = (e: React.PointerEvent, dir: string, booth: Booth) => {
    if (readOnly) return;
    e.stopPropagation();
    e.preventDefault();

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    setDragging({
        mode: 'resize',
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startTx: 0,
        startTy: 0,
        boothId: booth.id,
        boothStartX: booth.x,
        boothStartY: booth.y,
        startWidth: booth.width,
        startHeight: booth.height,
        resizeDir: dir,
        captureEl: target
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.mode || dragging.pointerId !== e.pointerId) return;

    const dx = e.clientX - dragging.startX;
    const dy = e.clientY - dragging.startY;
    const scale = viewport.scale;

    if (dragging.mode === 'pan') {
      onViewportChange?.({
        ...viewport,
        x: dragging.startTx + dx,
        y: dragging.startTy + dy
      });
    } 
    else if (dragging.mode === 'booth' && dragging.boothId && dragging.boothStartX !== undefined && dragging.boothStartY !== undefined) {
      const scaledDx = dx / scale;
      const scaledDy = dy / scale;

      onBoothUpdate?.(dragging.boothId, {
        x: dragging.boothStartX + scaledDx,
        y: dragging.boothStartY + scaledDy
      });
    }
    else if (dragging.mode === 'resize' && dragging.boothId && dragging.startWidth && dragging.startHeight && dragging.boothStartX !== undefined && dragging.boothStartY !== undefined) {
        const scaledDx = dx / scale;
        const scaledDy = dy / scale;
        
        let newW = dragging.startWidth;
        let newH = dragging.startHeight;
        let newX = dragging.boothStartX;
        let newY = dragging.boothStartY;

        if (dragging.resizeDir?.includes('e')) newW = Math.max(20, dragging.startWidth + scaledDx);
        if (dragging.resizeDir?.includes('s')) newH = Math.max(20, dragging.startHeight + scaledDy);
        if (dragging.resizeDir?.includes('w')) {
            const possibleW = dragging.startWidth - scaledDx;
            if (possibleW >= 20) {
                newW = possibleW;
                newX = dragging.boothStartX + scaledDx;
            }
        }
        if (dragging.resizeDir?.includes('n')) {
            const possibleH = dragging.startHeight - scaledDy;
            if (possibleH >= 20) {
                newH = possibleH;
                newY = dragging.boothStartY + scaledDy;
            }
        }

        onBoothUpdate?.(dragging.boothId, {
            x: newX,
            y: newY,
            width: newW,
            height: newH
        });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragging.mode || dragging.pointerId !== e.pointerId) return;

    const dx = Math.abs(e.clientX - dragging.startX);
    const dy = Math.abs(e.clientY - dragging.startY);
    const isClick = dx < 5 && dy < 5;

    if (dragging.mode === 'pan') {
      if (isClick) {
        onBackgroundClick?.();
      }
    }
    
    // Release capture from stored element
    if (dragging.captureEl && dragging.captureEl.hasPointerCapture(e.pointerId)) {
        dragging.captureEl.releasePointerCapture(e.pointerId);
    }

    setDragging({ mode: null, pointerId: null, startX: 0, startY: 0, startTx: 0, startTy: 0, captureEl: null });
  };

  const mapSrc = mapImageUrl || '';

  // =========================
  // Customer (readOnly) Handlers
  // =========================
  const handleWheel = (e: React.WheelEvent) => {
    if (!readOnly) return;
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const delta = -e.deltaY * 0.0015;
    const minScale = fitScaleRef.current || 0.5;
    const maxScale = (fitScaleRef.current || 1) * 3;
    const newScale = clamp(scale * (1 + delta), minScale, maxScale);

    const contentX = (mouseX - position.x) / scale;
    const contentY = (mouseY - position.y) / scale;
    const newX = mouseX - contentX * newScale;
    const newY = mouseY - contentY * newScale;

    setScale(newScale);
    setPosition(clampPositionRO({ x: newX, y: newY }, newScale));
  };

  const handlePointerDownRO = (e: React.PointerEvent) => {
    if (!readOnly) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 1) {
      roTapRef.current = { x: e.clientX, y: e.clientY, start: Date.now() };
    }
    if (pointersRef.current.size === 1) {
      dragStartRef.current = { x: e.clientX, y: e.clientY, originX: position.x, originY: position.y };
    }
    if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      lastPinchDistanceRef.current = Math.hypot(dx, dy);
      lastPinchMidRef.current = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    }
    e.preventDefault();
  };

  const handlePointerMoveRO = (e: React.PointerEvent) => {
    if (!readOnly) return;
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const pts = Array.from(pointersRef.current.values());
    if (pts.length === 2 && lastPinchDistanceRef.current && lastPinchMidRef.current) {
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0) {
        const factor = dist / lastPinchDistanceRef.current;
        const minScale = fitScaleRef.current || 0.5;
        const maxScale = (fitScaleRef.current || 1) * 3;
        const newScale = clamp(scale * factor, minScale, maxScale);
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        const contentX = (mid.x - position.x) / scale;
        const contentY = (mid.y - position.y) / scale;
        const newX = mid.x - contentX * newScale;
        const newY = mid.y - contentY * newScale;
        setScale(newScale);
        setPosition(clampPositionRO({ x: newX, y: newY }, newScale));
        lastPinchDistanceRef.current = dist;
        lastPinchMidRef.current = mid;
      }
      return;
    }

    if (pts.length === 1 && dragStartRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPosition(clampPositionRO({ x: dragStartRef.current.originX + dx, y: dragStartRef.current.originY + dy }, scale));
    }
  };

  const handlePointerUpRO = (e: React.PointerEvent) => {
    if (!readOnly) return;
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) {
      lastPinchDistanceRef.current = null;
      lastPinchMidRef.current = null;
    }
    if (pointersRef.current.size === 0) {
      dragStartRef.current = null;
      if (roTapRef.current) {
        const dx = Math.abs(e.clientX - roTapRef.current.x);
        const dy = Math.abs(e.clientY - roTapRef.current.y);
        if (dx < 5 && dy < 5) {
          onBackgroundClick?.();
        }
      }
      roTapRef.current = null;
    }
  };

  if (readOnly) {
    return (
      <div
        ref={containerRef}
        className="w-full h-full relative overflow-hidden select-none touch-none"
        onWheel={handleWheel}
        onPointerDown={handlePointerDownRO}
        onPointerMove={handlePointerMoveRO}
        onPointerUp={handlePointerUpRO}
        onPointerCancel={handlePointerUpRO}
        style={{ touchAction: 'none' }}
      >
        <div
          ref={contentRef}
          className="origin-top-left will-change-transform"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: '0 0',
            width: 'fit-content',
            height: 'fit-content',
            transition: roTransition
          }}
        >
          <div 
            className="relative bg-white shadow-lg border border-slate-200"
            style={{ 
              width: naturalSize.width > 0 ? naturalSize.width : '100%', 
              height: naturalSize.height > 0 ? naturalSize.height : '100%',
              minWidth: '100px',
              minHeight: '100px'
            }}
          >
            {mapSrc && !imageError ? (
              <img 
                key={`${mapSrc}-${retryKey}`}
                src={mapSrc}
                alt="Event Map"
                className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none z-0"
                onError={(e) => {
                  console.error('Map image failed to load:', mapSrc, e);
                  setImageError(true);
                  toast.error('Map image failed to load');
                }}
                onLoad={handleImageLoad}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-gray-50 z-0 pointer-events-none">
                {imageError ? (
                  <div className="flex flex-col items-center gap-2 pointer-events-auto">
                    <span className="text-red-500 mb-1">Failed to load map image</span>
                    <button
                      className="flex items-center gap-2 px-3 py-1 bg-white border rounded shadow-sm hover:bg-gray-50 text-sm text-gray-700"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setImageError(false);
                        setRetryKey((k) => k + 1);
                      }}
                    >
                      <RefreshCw size={14} /> Retry
                    </button>
                    {onFixMap && (
                      <button
                        className="flex items-center gap-2 px-3 py-1 bg-orange-50 border border-orange-200 rounded shadow-sm hover:bg-orange-100 text-sm text-orange-700"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          onFixMap();
                        }}
                      >
                        Set Default Map
                      </button>
                    )}
                  </div>
                ) : (
                  <span>No Map Image Set</span>
                )}
              </div>
            )}
            {selectedBoothId ? (
              <div className="absolute inset-0 bg-black/10 z-[5] pointer-events-none" />
            ) : null}
            <div className="absolute inset-0 z-10">
              {booths.map(booth => (
                <div
                  key={booth.id}
                  style={{
                      left: booth.x,
                      top: booth.y,
                      width: booth.width,
                      height: booth.height
                  }}
                  className={[
                    'absolute rounded-xl flex flex-col items-center justify-center cursor-pointer select-none touch-none',
                    'transition-all duration-300',
                    booth.id === selectedBoothId
                      ? 'z-30 scale-[1.08] ring-4 ring-yellow-400 shadow-2xl bg-white/85 backdrop-blur-sm'
                      : booth.id === myBoothId
                        ? 'z-20 scale-105 ring-4 ring-amber-400 shadow-2xl animate-pulse bg-white/70 backdrop-blur-sm'
                        : selectedBoothId
                          ? 'opacity-35 bg-white/60'
                          : 'opacity-70 bg-white/70'
                  ].join(' ')}
                  onPointerDown={(e) => handleBoothPointerDown(e, booth)}
                >
                  {booth.id === selectedBoothId ? (
                    <div className="absolute inset-0 rounded-xl bg-yellow-400/20 blur-xl pointer-events-none" />
                  ) : null}
                  {booth.id === myBoothId && (
                    <div className="absolute inset-0 rounded-xl bg-amber-400/20 blur-xl animate-pulse pointer-events-none" />
                  )}
                  {booth.id === myBoothId && (
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white text-xs px-3 py-1 rounded-full shadow-lg whitespace-nowrap">
                      You are assigned here
                    </div>
                  )}
                  <div className="relative z-0 pointer-events-none flex flex-col items-center justify-center w-full h-full p-1">
                      <span className="font-bold text-xs select-none truncate w-full text-center">
                      {booth.name}
                      </span>
                      {booth.vendor && (
                      <span className="text-[10px] bg-white/80 px-1 rounded truncate max-w-full">
                          {booth.vendor.businessName}
                      </span>
                      )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Organizer/editor mode (existing logic)
  return (
    <div 
      ref={wrapperRef}
      className="w-full h-full relative overflow-hidden select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{ touchAction: 'none' }} 
    >
      <div
        ref={mapContainerRef}
        className="origin-top-left will-change-transform"
        style={{ 
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          width: 'fit-content',
          height: 'fit-content',
        }}
      >
        <div 
          className="relative bg-white shadow-lg border border-slate-200"
          style={{ 
            width: naturalSize.width > 0 ? naturalSize.width : '100%', 
            height: naturalSize.height > 0 ? naturalSize.height : '100%',
            minWidth: '100px',
            minHeight: '100px'
          }}
        >
          {mapSrc && !imageError ? (
            <img 
              key={`${mapSrc}-${retryKey}`}
              src={mapSrc}
              alt="Event Map"
              className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none z-0"
              onError={(e) => {
                console.error('Map image failed to load:', mapSrc, e);
                setImageError(true);
                toast.error('Map image failed to load');
              }}
              onLoad={handleImageLoad}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-gray-50 z-0 pointer-events-none">
              {imageError ? (
                <div className="flex flex-col items-center gap-2 pointer-events-auto">
                  <span className="text-red-500 mb-1">Failed to load map image</span>
                  <button
                    className="flex items-center gap-2 px-3 py-1 bg-white border rounded shadow-sm hover:bg-gray-50 text-sm text-gray-700"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setImageError(false);
                      setRetryKey((k) => k + 1);
                    }}
                  >
                    <RefreshCw size={14} /> Retry
                  </button>
                  {onFixMap && (
                    <button
                      className="flex items-center gap-2 px-3 py-1 bg-orange-50 border border-orange-200 rounded shadow-sm hover:bg-orange-100 text-sm text-orange-700"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onFixMap();
                      }}
                    >
                      Set Default Map
                    </button>
                  )}
                </div>
              ) : (
                <span>No Map Image Set</span>
              )}
            </div>
          )}
          <div className="absolute inset-0 z-10">
            {booths.map(booth => (
              <div
                key={booth.id}
                style={{
                    left: booth.x,
                    top: booth.y,
                    width: booth.width,
                    height: booth.height
                }}
                className={(() => {
                  const isMine = booth.id === myBoothId;
                  return [
                    'absolute rounded-xl flex flex-col items-center justify-center cursor-pointer select-none touch-none',
                    'transition-all duration-300',
                    readOnly ? 'cursor-default' : 'cursor-move',
                    isMine
                      ? 'z-20 scale-105 ring-4 ring-amber-400 shadow-2xl animate-pulse bg-white/70 backdrop-blur-sm'
                      : 'opacity-70 bg-white/70'
                  ].join(' ');
                })()}
                onPointerDown={(e) => handleBoothPointerDown(e, booth)}
              >
                {booth.id === myBoothId && (
                  <div className="absolute inset-0 rounded-xl bg-amber-400/20 blur-xl animate-pulse pointer-events-none" />
                )}
                {booth.id === myBoothId && (
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white text-xs px-3 py-1 rounded-full shadow-lg whitespace-nowrap">
                    You are assigned here
                  </div>
                )}
                {booth.id === myBoothId && (
                  <>
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-amber-500" />
                    <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-amber-500" />
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-amber-500" />
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-amber-500" />
                  </>
                )}
                <div className="relative z-0 pointer-events-none flex flex-col items-center justify-center w-full h-full p-1">
                    <span className="font-bold text-xs select-none truncate w-full text-center">
                    {booth.name}
                    </span>
                    {booth.vendor && (
                    <span className="text-[10px] bg-white/80 px-1 rounded truncate max-w-full">
                        {booth.vendor.businessName}
                    </span>
                    )}
                </div>

                {!readOnly && selectedBoothId === booth.id && (
                    <>
                        <div 
                            className="absolute -top-1 -left-1 w-3 h-3 bg-white border border-amber-500 cursor-nw-resize z-50"
                            onPointerDown={(e) => handleResizePointerDown(e, 'nw', booth)} 
                        />
                        <div 
                            className="absolute -top-1 -right-1 w-3 h-3 bg-white border border-amber-500 cursor-ne-resize z-50"
                            onPointerDown={(e) => handleResizePointerDown(e, 'ne', booth)}
                        />
                        <div 
                            className="absolute -bottom-1 -left-1 w-3 h-3 bg-white border border-amber-500 cursor-sw-resize z-50"
                            onPointerDown={(e) => handleResizePointerDown(e, 'sw', booth)}
                        />
                        <div 
                            className="absolute -bottom-1 -right-1 w-3 h-3 bg-white border border-amber-500 cursor-se-resize z-50"
                            onPointerDown={(e) => handleResizePointerDown(e, 'se', booth)}
                        />
                    </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
