import { memo } from 'react';

const JumpBar = memo(function JumpBar({ total, current, answers, bookmarks, onJump }) {
  return (
    <div className="jump-bar">
      <span className="jump-label">Go to:</span>
      <div className="jump-numbers">
        {Array.from({ length: total }, (_, i) => {
          const qid = i;
          const classes = ['jump-num'];
          if (i === current) classes.push('current');
          if (answers[i]) classes.push('answered');
          if (bookmarks.has(i)) classes.push('bookmarked');

          return (
            <div
              key={i}
              className={classes.join(' ')}
              onClick={() => onJump(i)}
            >
              {i + 1}
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default JumpBar;