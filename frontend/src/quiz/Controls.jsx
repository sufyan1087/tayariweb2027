import { memo } from 'react';

const Controls = memo(function Controls({ 
  isFirst, 
  isLast, 
  revealed, 
  hasAnswer,
  onPrev, 
  onNext, 
  onCheck, 
  onSubmit 
}) {
  return (
    <div className="control-bar">
      <button 
        className="ctrl-btn prev" 
        onClick={onPrev} 
        disabled={isFirst}
      >
        ← Previous
      </button>
      <div className="ctrl-center">
        <button 
          className="ctrl-btn check" 
          onClick={onCheck}
          disabled={!hasAnswer || revealed}
        >
          {revealed ? (hasAnswer ? '✓ Checked' : 'Check Answer') : 'See Answer'}
        </button>
      </div>
      {isLast ? (
        <button className="ctrl-btn submit" onClick={onSubmit}>
          Submit ✓
        </button>
      ) : (
        <button className="ctrl-btn next" onClick={onNext}>
          Next →
        </button>
      )}
    </div>
  );
});

export default Controls;