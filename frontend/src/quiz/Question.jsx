import { memo, useCallback } from 'react';

const Option = memo(function Option({ opt, qid, selected, revealed, correctKey, onSelect }) {
  const classes = ['option-row'];

  if (revealed) {
    if (opt.key === correctKey) classes.push('correct');
    else if (selected === opt.key) classes.push('wrong');
    classes.push('disabled');
  } else if (selected === opt.key) {
    classes.push('selected');
  }

  const handleChange = useCallback(() => {
    if (!revealed) onSelect(qid, opt.key);
  }, [revealed, qid, opt.key, onSelect]);

  return (
    <label className={classes.join(' ')}>
      <input
        type="radio"
        name="opt"
        value={opt.key}
        checked={selected === opt.key}
        disabled={revealed}
        onChange={handleChange}
      />
      <span className="opt-text">{opt.text}</span>
    </label>
  );
});

const Question = memo(function Question({ 
  question, 
  qIndex, 
  total, 
  selected, 
  revealed, 
  bookmarked,
  onSelect, 
  onBookmark,
  onCheck 
}) {
  return (
    <div className="question-wrap">
      <div className="question-header">
        <span className="q-count">Question {qIndex + 1} of {total}</span>
        <div className="q-tools">
          <button
            className={`tool-btn ${bookmarked ? 'active' : ''}`}
            onClick={onBookmark}
            title="Bookmark"
            id="bookmarkBtn"
          >
            🔖
          </button>
        </div>
      </div>
      <div className="question-text">{question.question}</div>
      <div className="options-wrap">
        {question.options?.map((opt) => (
          <Option
            key={opt.key}
            opt={opt}
            qid={question.id}
            selected={selected}
            revealed={revealed}
            correctKey={question.correct}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
});

export default Question;