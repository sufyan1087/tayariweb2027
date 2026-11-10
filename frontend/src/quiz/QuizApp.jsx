import { useState, useCallback, useEffect, useRef } from 'react';
import Timer from './Timer';
import JumpBar from './JumpBar';
import Question from './Question';
import Controls from './Controls';
import Results from './Results';
import Comments from './Comments';
import { quizApi } from './api';

export default function QuizApp({ data }) {
  // Guard against empty questions
  if (!data?.questions?.length) {
    return (
      <div className="content-wrap">
        <main className="main-area">
          <article className="article-block">
            <header className="article-header">
              <h1>{data.title || 'Quiz'}</h1>
            </header>
            <div className="article-body">
              <div className="alert-box" style={{textAlign: 'center', padding: '3rem'}}>
                <h2>No questions found</h2>
                <p>This quiz doesn't have any questions yet.</p>
                <a href="/quizzes/" className="action-btn solid" style={{marginTop: '1rem', display: 'inline-block'}}>
                  Browse Other Quizzes
                </a>
              </div>
            </div>
          </article>
        </main>
      </div>
    );
  }

  // State declarations
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [revealed, setRevealed] = useState({});
  const [bookmarks, setBookmarks] = useState(new Set());
  const [timeRemaining, setTimeRemaining] = useState(data.config.timeLimit);
  const [finished, setFinished] = useState(false);
  const [attemptId, setAttemptId] = useState(data.config.attemptId);
  const [scoreData, setScoreData] = useState(null);
  const timerRef = useRef(null);

  // Create attempt on mount
  useEffect(() => {
    if (!attemptId || attemptId === 'null') {
      quizApi.createAttempt(data.id)
        .then(res => setAttemptId(res.attempt_id))
        .catch(() => setAttemptId(`local_${Date.now()}`));
    }
  }, [data.id, attemptId]);

  // Timer
  useEffect(() => {
    if (finished || timeRemaining <= 0) return;
    
    timerRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleSubmit(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [finished, timeRemaining]);

  const handleTimeUp = useCallback(() => {}, []);

  const handleSelect = useCallback((qid, answer) => {
    if (revealed[qid]) return;
    setAnswers(prev => ({ ...prev, [qid]: answer }));
    
    if (attemptId && !String(attemptId).startsWith('local')) {
      quizApi.saveAnswer(attemptId, qid, answer).catch(() => {});
    }
  }, [revealed, attemptId]);

  const handleCheck = useCallback(() => {
    const q = data.questions[current];
    if (!answers[q.id]) {
      alert('Please select an answer first');
      return;
    }
    setRevealed(prev => ({ ...prev, [q.id]: true }));
  }, [current, answers, data.questions]);

  const handleBookmark = useCallback(() => {
    const q = data.questions[current];
    setBookmarks(prev => {
      const next = new Set(prev);
      if (next.has(q.id)) next.delete(q.id);
      else next.add(q.id);
      return next;
    });
  }, [current, data.questions]);

  const handlePrev = useCallback(() => {
    setCurrent(prev => Math.max(0, prev - 1));
  }, []);

  const handleNext = useCallback(() => {
    setCurrent(prev => Math.min(data.config.totalQuestions - 1, prev + 1));
  }, [data.config.totalQuestions]);

  const handleJump = useCallback((index) => {
    setCurrent(index);
  }, []);

  const handleSubmit = useCallback((auto = false) => {
    if (finished) return;
    
    const unanswered = data.config.totalQuestions - Object.keys(answers).length;
    if (!auto && unanswered > 0 && !confirm(`${unanswered} unanswered. Submit?`)) return;
    
    setFinished(true);
    clearInterval(timerRef.current);

    let correct = 0, wrong = 0, skipped = 0;
    data.questions.forEach(q => {
      const ans = answers[q.id];
      if (!ans) skipped++;
      else if (ans === q.correct) correct++;
      else wrong++;
    });

    const total = data.config.totalQuestions;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    const timeTaken = data.config.timeLimit - timeRemaining;

    setScoreData({ score, correct, wrong, skipped, timeTaken });

    if (attemptId && !String(attemptId).startsWith('local')) {
      quizApi.submitQuiz(attemptId, answers, timeTaken).catch(() => {});
    }
  }, [finished, answers, data, timeRemaining, attemptId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e) => {
      if (finished) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      const q = data.questions[current];
      
      if (['1','2','3','4'].includes(e.key) && !revealed[q.id]) {
        const idx = parseInt(e.key) - 1;
        if (q.options?.[idx]) handleSelect(q.id, q.options[idx].key);
      }
      if (e.key === ' ' && !revealed[q.id]) {
        e.preventDefault();
        handleCheck();
      }
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };
    
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [current, revealed, data.questions, finished, handleSelect, handleCheck, handleNext, handlePrev]);

  const q = data.questions[current];
  const isFirst = current === 0;
  const isLast = current === data.config.totalQuestions - 1;
  const isRevealed = !!revealed[q?.id];
  const hasAnswer = !!answers[q?.id];
  const showMidAd = [10, 20, 30].includes(current + 1) && current + 1 < data.config.totalQuestions;

  if (finished && scoreData) {
    return (
      <>
        <Results
          score={scoreData.score}
          correct={scoreData.correct}
          wrong={scoreData.wrong}
          skipped={scoreData.skipped}
          timeTaken={scoreData.timeTaken}
          totalQuestions={data.config.totalQuestions}
          passingPercentage={data.config.passingPercentage}
          questions={data.questions}
          userAnswers={answers}
          onRetake={() => window.location.reload()}
          quizId={data.id}
        />
        <Comments attemptId={attemptId} />
      </>
    );
  }

  return (
    <div className="content-wrap">
      <main className="main-area">
        <article className="article-block" id="articleBlock">
          <header className="article-header">
            <h1>{data.title} - Comprehensive Practice Guide</h1>
            <div className="article-meta">
              <span className="meta-cat">{data.category}</span>
              <span className={`meta-diff ${data.difficulty}`}>{data.difficulty}</span>
              <span className="meta-date">Updated {data.updatedAt}</span>
            </div>
          </header>
          <div className="article-body">
            <p className="lead">{data.description}</p>
            <h2>What You'll Learn</h2>
            <ul className="learn-list">
              <li>Master <strong>{data.config.totalQuestions} carefully selected questions</strong></li>
              <li>Practice under <strong>{Math.floor(data.config.timeLimit / 60)}-minute timed conditions</strong></li>
              <li>Get <strong>instant detailed explanations</strong></li>
            </ul>
            <h2>Quiz Overview</h2>
            <div className="overview-line">
              <span><strong>⏱️ {Math.floor(data.config.timeLimit / 60)}</strong> minutes</span>
              <span><strong>📝 {data.config.totalQuestions}</strong> questions</span>
              <span><strong>🎯 {data.config.passingPercentage}%</strong> passing</span>
              <span><strong>⭐ +{data.config.marksPerCorrect}</strong> marks/correct</span>
            </div>
            {data.config.quizType === 'negative' && (
              <div className="alert-box">
                <strong>⚠️ Negative Marking:</strong> You will lose {data.config.marksPerWrong} marks for each wrong answer.
              </div>
            )}
          </div>
        </article>

        <section className="quiz-block" id="quizBlock">
          <div className="quiz-toolbar">
            <div className="toolbar-left">
              <span className="quiz-label">{data.title}</span>
            </div>
            <div className="toolbar-right">
              <Timer timeRemaining={timeRemaining} onTimeUp={handleTimeUp} />
              <button className="tool-btn" onClick={() => {
                if (!document.fullscreenElement) document.documentElement.requestFullscreen();
                else document.exitFullscreen();
              }} title="Fullscreen">⛶</button>
            </div>
          </div>

          <JumpBar
            total={data.config.totalQuestions}
            current={current}
            answers={answers}
            bookmarks={bookmarks}
            onJump={handleJump}
          />

          <Question
            question={q}
            qIndex={current}
            total={data.config.totalQuestions}
            selected={answers[q.id]}
            revealed={isRevealed}
            bookmarked={bookmarks.has(q.id)}
            onSelect={handleSelect}
            onBookmark={handleBookmark}
            onCheck={handleCheck}
          />

          {isRevealed && (
            <div className={`reveal-box ${answers[q.id] === q.correct ? 'correct' : 'wrong'}`}>
              <div className="reveal-status">
                {answers[q.id] === q.correct ? '✅ Correct!' : `❌ Wrong! Correct: ${q.correct.toUpperCase()}`}
              </div>
              <div className="reveal-explain">{q.explanation || 'No explanation available.'}</div>
            </div>
          )}

          <Controls
            isFirst={isFirst}
            isLast={isLast}
            revealed={isRevealed}
            hasAnswer={hasAnswer}
            onPrev={handlePrev}
            onNext={handleNext}
            onCheck={handleCheck}
            onSubmit={() => handleSubmit(false)}
          />

          {showMidAd && (
            <div className="mid-quiz-ad" id="midQuizAd">
              <button className="ad-close-btn" onClick={() => document.getElementById('midQuizAd').classList.add('hidden')}>×</button>
              <div className="ad-label">Sponsored</div>
              <div className="ad-placeholder">
                <p>Ad Space</p>
                <small>Question {current + 1} of {data.config.totalQuestions}</small>
              </div>
            </div>
          )}

          <div className="key-help">
            <span><kbd>1</kbd>-<kbd>4</kbd> Select</span>
            <span><kbd>Space</kbd> Check</span>
            <span><kbd>←</kbd> <kbd>→</kbd> Navigate</span>
          </div>
        </section>
      </main>

      <aside className="sidebar-area">
        <div className="side-section">
          <h4 className="side-title">🔥 Popular Quizzes</h4>
          <div className="side-list">
            <a href="#" className="side-item">
              <span className="side-name">{data.title}</span>
            </a>
          </div>
        </div>
        <div className="side-section">
          <h4 className="side-title">📂 Categories</h4>
          <div className="cat-list">
            <a href="#" className="cat-item">
              <span className="cat-icon">📚</span>
              <span className="cat-name">{data.category}</span>
              <span className="cat-num">5</span>
            </a>
          </div>
        </div>
      </aside>
    </div>
  );
}