
import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  mobileFullScreen?: boolean;
  wide?: boolean;
}

export function Modal({ isOpen, onClose, title, children, mobileFullScreen, wide }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const overlayClassName = mobileFullScreen
    ? 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm [@media(pointer:coarse)]:p-0'
    : 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm';

  const containerClassName = mobileFullScreen
    ? 'bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200 ' +
      '[@media(pointer:coarse)]:rounded-none [@media(pointer:coarse)]:max-w-none [@media(pointer:coarse)]:max-h-none [@media(pointer:coarse)]:h-[100dvh]'
    : `bg-white rounded-lg shadow-xl w-full ${wide ? 'max-w-6xl' : 'max-w-md'} max-h-[90vh] overflow-auto flex flex-col animate-in fade-in zoom-in-95 duration-200`;

  return createPortal(
    <div className={overlayClassName}>
      <div 
        ref={overlayRef}
        className={containerClassName}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-4 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
