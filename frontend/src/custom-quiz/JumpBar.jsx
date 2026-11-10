import { memo } from 'react'

/**
 * JumpBar — horizontal question navigator.
 */
const JumpBar = memo(function JumpBar({ total, current, answers, bookmarks, onJump, questionIds }) {
  return (
    <nav className="jump-bar" aria-label="Question navigator">
      <span className="jump-label" aria-hidden="true">Go to:</span>
      <div className="jump-numbers" role="list">
        {Array.from({ length: total }, (_, i) => {
          const qid = questionIds ? questionIds[i] : i
          const classes = ['jump-num']

          if (i === current) classes.push('current')
          if (answers[qid] !== undefined) classes.push('answered')
          if (bookmarks instanceof Set && bookmarks.has(qid)) classes.push('bookmarked')

          return (
            <button
              key={i}
              type="button"
              role="listitem"
              className={classes.join(' ')}
              onClick={() => onJump(i)}
              aria-label={[
                `Question ${i + 1}`,
                bookmarks instanceof Set && bookmarks.has(qid) ? '(bookmarked)' : '',
                answers[qid] !== undefined ? '(answered)' : '',
              ].filter(Boolean).join(' ')}
              aria-current={i === current ? 'step' : undefined}
            >
              {i + 1}
            </button>
          )
        })}
      </div>
    </nav>
  )
})

export default JumpBar
