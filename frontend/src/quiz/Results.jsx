import { useState, useCallback, memo } from 'react';

const ReviewItem = memo(function ReviewItem({ index, question, answer, status }) {
  const userOpt = question.options?.find(o => o.key === answer);
  const correctOpt = question.options?.find(o => o.key === question.correct);
  
  const userText = userOpt ? userOpt.text : 'Not answered';
  const correctText = correctOpt ? correctOpt.text : 'N/A';

  return (
    <div className={`review-item ${status}`} data-status={status}>
      <div className="review-head">
        <span>Q{index + 1}</span>
        <span className={`review-badge ${status}`}>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      </div>
      <div className="review-body">
        <p>{question.question}</p>
        <p>
          <strong>Your:</strong> {userText} | <strong>Correct:</strong> {correctText}
        </p>
        {question.explanation && (
          <div className="explanation">
            <strong>Why:</strong> {question.explanation}
          </div>
        )}
      </div>
    </div>
  );
});

const Results = memo(function Results({ 
  score, 
  correct, 
  wrong, 
  skipped, 
  timeTaken,
  totalQuestions,
  passingPercentage,
  questions,
  userAnswers,
  onRetake,
  quizId
}) {
  const [filter, setFilter] = useState('all');

  const getStatus = useCallback((q) => {
    const ans = userAnswers[q.id];
    if (!ans) return 'skipped';
    return ans === q.correct ? 'correct' : 'wrong';
  }, [userAnswers]);

  const filteredQuestions = questions.map((q, i) => ({
    index: i,
    question: q,
    answer: userAnswers[q.id],
    status: getStatus(q),
  })).filter(item => filter === 'all' || item.status === filter);

  const passed = score >= passingPercentage;

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <section className="results-block" id="resultsBlock" aria-label="Quiz Results">
      <div className="results-top">
        <h2>Quiz Complete</h2>
        <div className="score-big">{score}%</div>
        <div className={`result-tag ${passed ? 'passed' : 'failed'}`}>
          {passed ? 'PASSED' : 'FAILED'}
        </div>
      </div>

      <div className="stats-line">
        <div className="stat-unit correct">
          <span className="stat-num">{correct}</span>
          <span className="stat-name">Correct</span>
        </div>
        <div className="stat-unit wrong">
          <span className="stat-num">{wrong}</span>
          <span className="stat-name">Wrong</span>
        </div>
        <div className="stat-unit skipped">
          <span className="stat-num">{skipped}</span>
          <span className="stat-name">Skipped</span>
        </div>
        <div className="stat-unit time">
          <span className="stat-num">{formatTime(timeTaken)}</span>
          <span className="stat-name">Time</span>
        </div>
      </div>

      <div className="review-wrap">
        <h3>Review Answers</h3>
        <div className="review-filters" role="group" aria-label="Filter results">
          {['all', 'correct', 'wrong', 'skipped'].map(type => (
            <button
              key={type}
              className={`filter-tag ${filter === type ? 'active' : ''}`}
              onClick={() => setFilter(type)}
            >
              {type === 'all' ? 'All' : 
               type === 'correct' ? '✓ Correct' : 
               type === 'wrong' ? '✗ Wrong' : '○ Skipped'}
            </button>
          ))}
        </div>
        <div className="review-list">
          {filteredQuestions.map(item => (
            <ReviewItem
              key={item.index}
              index={item.index}
              question={item.question}
              answer={item.answer}
              status={item.status}
            />
          ))}
        </div>
      </div>

      <div className="fb">
        <h4>Was this helpful?</h4>
        <div className="fbb">
          <button onClick={() => window.fd('like')}>👍 Helpful</button>
          <button onClick={() => window.fd('dislike')}>👎 Not Helpful</button>
        </div>
      </div>

      <div className="action-line">
        <a href="/quizzes/" className="action-btn outline">More Quizzes</a>
        <button className="action-btn solid" onClick={onRetake}>Retake</button>
      </div>
    </section>
  );
});

export default Results;