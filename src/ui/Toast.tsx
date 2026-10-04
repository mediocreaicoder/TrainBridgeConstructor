import { useEffect, type CSSProperties } from 'react';

export interface ToastMessage {
  /** A new id restarts the toast, even with the same text. */
  id: number;
  title?: string;
  text: string;
  seconds: number;
}

interface ToastProps {
  message: ToastMessage;
  onDone: () => void;
}

/**
 * A short message that fades in at the top of the screen and disappears by
 * itself after `seconds`, or when tapped. Keeps the screen free for building.
 */
export function Toast({ message, onDone }: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, message.seconds * 1000);
    return () => window.clearTimeout(timer);
  }, [message, onDone]);

  // The CSS animation reads the duration, so the fade-out ends with the timer.
  const style = { '--toast-seconds': `${message.seconds}s` } as CSSProperties;
  return (
    <div key={message.id} className="toast" style={style} role="status" onClick={onDone}>
      {message.title && <div className="toast-title">{message.title}</div>}
      <div className="toast-text">{message.text}</div>
    </div>
  );
}
