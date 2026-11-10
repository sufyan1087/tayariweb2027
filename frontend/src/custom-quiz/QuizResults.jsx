import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react'
import { formatTime, announce, sanitizeHtml, stripHtml } from '../shared/api'

const FILTER_TYPES = ['all', 'correct', 'wrong', 'skipped']
const STATUS_LABELS = { correct: 'Correct', wrong: 'Wrong', skipped: 'Skipped' }

// ── ReviewItem (memoized) ────────────────────────────────────────────────
const ReviewItem = memo(function ReviewItem({
  index,
  questionHtml,
  userText,
  correctText,
  explanationHtml,
  status,
}) {
  return (
    <div className={`review-item ${status}`} data-status={status}>
      <div className="review-head">
        <span>Q{index + 1}</span>
        <span className={`review-badge ${status}`}>
          {STATUS_LABELS[status] || status}
        </span>
      </div>
      <div className="review-body">
        <div
          className="review-question richtext-content"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(questionHtml) }}
        />
        <p className="review-answer-line">
          <strong>Your answer:</strong>{' '}
          <span className={status === 'correct' ? 'answer-correct' : 'answer-wrong'}>
            {userText}
          </span>
          {status !== 'correct' && (
            <>
              {' · '}
              <strong>Correct:</strong>{' '}
              <span className="answer-correct">{correctText}</span>
            </>
          )}
        </p>
        {explanationHtml && (
          <div className="explanation richtext-content">
            <strong className="explain-label">Explanation: </strong>
            <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(explanationHtml) }} />
          </div>
        )}
      </div>
    </div>
  )
})

// ── QuizResults ──────────────────────────────────────────────────────────
export default function QuizResults({ results, onRestart, onNewQuiz }) {
  const [filter, setFilter] = useState('all')
  const resultsRef = useRef(null)

  const {
    correct, wrong, skipped, total,
    finalPercentage, passed, timeUsed, timeLimit, questions,
  } = results

  // ── Focus management + screen-reader announcement ───────────────────
  useEffect(() => {
    resultsRef.current?.focus()
    announce(
      `Quiz complete. You scored ${finalPercentage} percent. ${passed ? 'Pass' : 'Fail'}`,
      'assertive'
    )
  }, [finalPercentage, passed])

  // ── Memoized review items ──────────────────────────────────────────────
  const reviewItems = useMemo(() => {
    return questions.map((q, i) => {
      const ans = q.userAnswer
      const isSkipped = ans === undefined || ans === null || ans === -1
      const userOpt = isSkipped ? null : q.options?.[ans]
      const correctOpt = q.options?.find(o => o.key === q.correct)
      const status =
        isSkipped ? 'skipped' :
        userOpt?.key === q.correct ? 'correct' : 'wrong'

      return {
        index: i,
        questionHtml: q.question,
        explanationHtml: q.explanation,
        userText: isSkipped ? 'Not answered' : (userOpt?.text || 'Unknown'),
        correctText: correctOpt?.text || 'N/A',
        status,
      }
    })
  }, [questions])

  // ── Filter counts (memoized) ───────────────────────────────────────────
  const filterCounts = useMemo(() => ({
    all: total,
    correct: reviewItems.filter(i => i.status === 'correct').length,
    wrong: reviewItems.filter(i => i.status === 'wrong').length,
    skipped: reviewItems.filter(i => i.status === 'skipped').length,
  }), [reviewItems, total])

  const filteredItems = useMemo(
    () => filter === 'all' ? reviewItems : reviewItems.filter(i => i.status === filter),
    [reviewItems, filter]
  )

  // ── Result message ─────────────────────────────────────────────────────
  const getResultMessage = useCallback(() => {
    if (finalPercentage >= 80) return 'Excellent work! Outstanding performance.'
    if (finalPercentage >= 70) return 'Great job! You performed well.'
    if (finalPercentage >= 60) return 'Good effort! Keep practicing to improve.'
    return 'Keep practicing! You will do better next time.'
  }, [finalPercentage])

  // ── Share ──────────────────────────────────────────────────────────────
  const shareResults = useCallback(async () => {
    const text = `I scored ${finalPercentage}% on TayariWeb Custom Quiz! Test your knowledge at`
    const url = window.location.origin + window.location.pathname
    try {
      if (navigator.share) {
        await navigator.share({ title: 'My Quiz Results — TayariWeb', text, url })
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${text} ${url}`)
        alert('Results link copied to clipboard!')
      } else {
        window.prompt('Copy this link:', `${text} ${url}`)
      }
    } catch {
      // User dismissed share dialog — silent
    }
  }, [finalPercentage])

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="results-wrapper">
      <section
        className="results-block"
        id="resultsBlock"
        aria-label="Quiz Results"
        tabIndex={-1}
        ref={resultsRef}
      >
        {/* Score summary */}
        <div className="results-top">
          <h2>Quiz Complete</h2>
          <div className="score-big" aria-label={`Score: ${finalPercentage} percent`}>
            {finalPercentage}%
          </div>
          <div className={`result-tag ${passed ? 'passed' : 'failed'}`} role="status">
            {passed ? 'PASSED' : 'FAILED'}
          </div>
          <p className="result-message">{getResultMessage()}</p>
        </div>

        {/* Stats line */}
        <div className="stats-line" role="list" aria-label="Quiz statistics">
          <div className="stat-unit correct" role="listitem">
            <span className="stat-num">{correct}</span>
            <span className="stat-name">Correct</span>
          </div>
          <div className="stat-unit wrong" role="listitem">
            <span className="stat-num">{wrong}</span>
            <span className="stat-name">Wrong</span>
          </div>
          <div className="stat-unit skipped" role="listitem">
            <span className="stat-num">{skipped}</span>
            <span className="stat-name">Skipped</span>
          </div>
          <div className="stat-unit time" role="listitem">
            <span className="stat-num">
              {timeLimit > 0 ? formatTime(timeUsed) : 'N/A'}
            </span>
            <span className="stat-name">Time</span>
          </div>
        </div>

        {/* Performance breakdown */}
        <div className="performance-breakdown">
          <h3>Performance Analysis</h3>
          <div className="breakdown-grid">
            <div className="breakdown-item">
              <span className="breakdown-value">
                {total > 0 ? Math.round((correct / total) * 100) : 0}%
              </span>
              <span className="breakdown-label">Accuracy</span>
            </div>
            <div className="breakdown-item">
              <span className="breakdown-value">
                {total > 0 ? Math.round(((total - skipped) / total) * 100) : 0}%
              </span>
              <span className="breakdown-label">Completion</span>
            </div>
            <div className="breakdown-item">
              <span className="breakdown-value">{total - skipped}</span>
              <span className="breakdown-label">Attempted</span>
            </div>
            <div className="breakdown-item">
              <span className="breakdown-value">
                {timeLimit > 0 ? formatTime(timeUsed) : 'N/A'}
              </span>
              <span className="breakdown-label">Time Taken</span>
            </div>
          </div>
        </div>

        {/* Study recommendations */}
        <div className="study-recommendations">
          <h3>Study Recommendations</h3>
          <div className="recommendation-list">
            {wrong > 0 && (
              <div className="rec-item rec-wrong">
                <span className="rec-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                </span>
                <div className="rec-content">
                  <strong>Review Wrong Answers</strong>
                  <span>You missed {wrong} question{wrong > 1 ? 's' : ''}. Focus on these topics next.</span>
                </div>
              </div>
            )}
            {skipped > 0 && (
              <div className="rec-item rec-skipped">
                <span className="rec-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 16 12 12 16 12"/>
                  </svg>
                </span>
                <div className="rec-content">
                  <strong>Time Management</strong>
                  <span>You skipped {skipped} question{skipped > 1 ? 's' : ''}. Practice pacing to attempt all.</span>
                </div>
              </div>
            )}
            {finalPercentage < 60 && (
              <div className="rec-item rec-focus">
                <span className="rec-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20h9"/>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                  </svg>
                </span>
                <div className="rec-content">
                  <strong>Focus Areas</strong>
                  <span>Score is below passing threshold. Review core concepts before next attempt.</span>
                </div>
              </div>
            )}
            {finalPercentage >= 80 && (
              <div className="rec-item rec-focus" style={{ borderLeftColor: 'var(--ok)' }}>
                <span className="rec-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </span>
                <div className="rec-content">
                  <strong>Excellent Performance!</strong>
                  <span>Try harder difficulty or tackle a new category to keep improving.</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Weak areas */}
        {wrong > 0 && (
          <div className="weak-areas">
            <h3>Areas to Improve</h3>
            <div className="weak-list">
              {reviewItems
                .filter(item => item.status === 'wrong')
                .slice(0, 5)
                .map((item, i) => {
                  const plainText = stripHtml(item.questionHtml)
                  return (
                    <div key={i} className="weak-item">
                      <span className="weak-num">{i + 1}</span>
                      <span className="weak-text">
                        {plainText.length > 90 ? plainText.substring(0, 90) + '…' : plainText}
                      </span>
                    </div>
                  )
                })}
            </div>
          </div>
        )}

        {/* Review section */}
        <div className="review-wrap">
          <h3>Review All Answers</h3>
          <div className="review-filters" role="group" aria-label="Filter review answers">
            {FILTER_TYPES.map(type => (
              <button
                key={type}
                type="button"
                className={`filter-tag ${filter === type ? 'active' : ''}`}
                aria-pressed={filter === type}
                onClick={() => {
                  setFilter(type)
                  announce(`Showing ${type} answers. ${filterCounts[type]} item${filterCounts[type] !== 1 ? 's' : ''}.`, 'polite')
                }}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
                <span className="filter-count">{filterCounts[type]}</span>
              </button>
            ))}
          </div>

          <div className="review-list" aria-label={`${filter} questions list`}>
            {filteredItems.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--tl)', padding: 'var(--s4)' }}>
                No {filter} answers to display.
              </p>
            ) : (
              filteredItems.map(item => (
                <ReviewItem
                  key={item.index}
                  index={item.index}
                  questionHtml={item.questionHtml}
                  userText={item.userText}
                  correctText={item.correctText}
                  explanationHtml={item.explanationHtml}
                  status={item.status}
                />
              ))
            )}
          </div>
        </div>

        {/* Feedback */}
        <div className="fb">
          <h4>Was this quiz helpful?</h4>
          <div className="fbb">
            <button
              type="button"
              className="fb-btn fb-like"
              onClick={() => window.fd?.('like')}
              aria-label="Mark as helpful"
            >
              <span className="fb-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
                </svg>
              </span>
              Helpful
            </button>
            <button
              type="button"
              className="fb-btn fb-dislike"
              onClick={() => window.fd?.('dislike')}
              aria-label="Mark as not helpful"
            >
              <span className="fb-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zM17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"/>
                </svg>
              </span>
              Not Helpful
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="action-line">
          <button
            type="button"
            className="action-btn outline"
            onClick={onRestart}
            aria-label="Retake the same quiz"
          >
            <span className="btn-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="1 4 1 10 7 10"/>
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
              </svg>
            </span>
            Retake Same Quiz
          </button>
          <button
            type="button"
            className="action-btn solid"
            onClick={onNewQuiz}
            aria-label="Create a new quiz"
          >
            <span className="btn-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <line x1="12" y1="5" x2="12" y2="19"/>
              </svg>
            </span>
            New Quiz
          </button>
          <button
            type="button"
            className="action-btn outline"
            onClick={shareResults}
            aria-label="Share your results"
          >
            <span className="btn-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="18" cy="5" r="3"/>
                <circle cx="6" cy="12" r="3"/>
                <circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </span>
            Share Results
          </button>
        </div>

      </section>
    </div>
  )
}