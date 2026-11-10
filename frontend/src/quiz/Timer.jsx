import { useEffect, useRef, useCallback } from 'react';

function Timer({ timeRemaining, onTimeUp }) {
  const intervalRef = useRef(null);
  const hasFired = useRef(false);

  const formatTime = useCallback((seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, []);

  useEffect(() => {
    if (timeRemaining <= 0 && !hasFired.current) {
      hasFired.current = true;
      onTimeUp();
      return;
    }

    intervalRef.current = setInterval(() => {
      onTimeUp();
    }, 1000);

    return () => clearInterval(intervalRef.current);
  }, [timeRemaining, onTimeUp]);

  const isWarning = timeRemaining <= 60;

  return (
    <div className="timer-box">
      <span className="timer-icon">⏱️</span>
      <span className={`timer-digits ${isWarning ? 'warning' : ''}`}>
        {formatTime(timeRemaining)}
      </span>
    </div>
  );
}

export default Timer;