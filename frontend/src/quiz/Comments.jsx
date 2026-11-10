import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { commentApi, getCsrfToken } from './api';

const CONFIG = {
  MAX_COMMENT_LENGTH: 1000,
  MAX_NAME_LENGTH: 50,
  RATE_LIMIT_MS: 5000,
  TOAST_DURATION: 3000,
};

function getInitials(name) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
  return '#' + '00000'.substring(0, 6 - c.length) + c;
}

function formatTimeAgo(dateString) {
  if (!dateString) return 'Recently';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Recently';
  
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return `${Math.floor(seconds / 604800)}w ago`;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

const CommentItem = memo(function CommentItem({ comment, isReply, onReply, onEdit, onDelete, onLike }) {
  const isOwner = comment.is_owner;
  const [showEdit, setShowEdit] = useState(false);
  const [editText, setEditText] = useState(comment.text);

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    const formData = new URLSearchParams();
    formData.append('text', editText);
    formData.append('csrfmiddlewaretoken', getCsrfToken());
    
    try {
      await commentApi.edit(comment.id, formData);
      setShowEdit(false);
      onEdit();
    } catch (err) {
      alert('Failed to update');
    }
  };

  return (
    <div className={`comment-item ${isReply ? 'comment-reply' : ''}`} id={`comment-${comment.id}`}>
      <div className="comment-user-avatar" style={{ background: stringToColor(comment.user) }}>
        {getInitials(comment.user)}
      </div>
      <div className="comment-content">
        <div className="comment-header">
          <span className="comment-author">
            {comment.user}
            {isOwner && <span className="comment-badge">You</span>}
          </span>
          <span className="comment-time">{formatTimeAgo(comment.created_at)}</span>
        </div>
        
        {showEdit ? (
          <form className="comment-edit-form" onSubmit={handleEditSubmit}>
            <textarea 
              className="comment-edit-input" 
              value={editText}
              onChange={e => setEditText(e.target.value)}
              required
            />
            <div className="comment-actions">
              <button type="button" className="btn-comment-primary" onClick={() => setShowEdit(false)}>Cancel</button>
              <button type="submit" className="btn-comment-primary">Save</button>
            </div>
          </form>
        ) : (
          <>
            <p className="comment-text">
              {comment.text}
              {comment.is_edited && <span className="comment-edited">(edited)</span>}
            </p>
            <div className="comment-footer">
              <button className="like-btn" onClick={() => onLike(comment.id)}>
                👍 {comment.likes || 0}
              </button>
              {!isReply && <button className="reply-btn" onClick={() => onReply(comment.id)}>Reply</button>}
              {isOwner && (
                <>
                  <button className="comment-action edit" onClick={() => setShowEdit(true)}>Edit</button>
                  <button className="comment-action delete" onClick={() => onDelete(comment.id)}>Delete</button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
});

const ReplyForm = memo(function ReplyForm({ parentId, onSubmit, onCancel }) {
  const [name, setName] = useState(localStorage.getItem('tayari_guestName') || '');
  const [text, setText] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || !text.trim()) return;
    localStorage.setItem('tayari_guestName', name);
    onSubmit(parentId, name, text);
    setText('');
  };

  return (
    <form className="reply-form active" onSubmit={handleSubmit}>
      <div className="comment-input-wrapper">
        <input 
          type="text" 
          className="guest-name-field" 
          placeholder="Your name" 
          value={name}
          onChange={e => setName(e.target.value)}
          required 
        />
        <textarea 
          className="comment-input" 
          placeholder="Write a reply..." 
          value={text}
          onChange={e => setText(e.target.value)}
          required 
        />
        <div className="comment-actions">
          <button type="button" className="btn-comment-primary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-comment-primary">Post Reply</button>
        </div>
      </div>
    </form>
  );
});

function Comments({ attemptId }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [guestName, setGuestName] = useState(localStorage.getItem('tayari_guestName') || '');
  const [commentText, setCommentText] = useState('');
  const lastCommentTime = useRef(0);

  const loadComments = useCallback(async () => {
    if (!attemptId || String(attemptId).startsWith('local')) return;
    setLoading(true);
    try {
      const data = await commentApi.load(attemptId);
      setComments(data.comments || []);
    } catch (err) {
      console.error('Failed to load comments:', err);
    } finally {
      setLoading(false);
    }
  }, [attemptId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const handleMainSubmit = async (e) => {
    e.preventDefault();
    if (!guestName.trim() || !commentText.trim()) return;
    
    const now = Date.now();
    if (now - lastCommentTime.current < CONFIG.RATE_LIMIT_MS) {
      alert('Please wait before posting again');
      return;
    }

    const formData = new URLSearchParams();
    formData.append('guest_name', guestName);
    formData.append('text', commentText);
    formData.append('csrfmiddlewaretoken', getCsrfToken());

    try {
      await commentApi.post(attemptId, formData);
      lastCommentTime.current = now;
      localStorage.setItem('tayari_guestName', guestName);
      setCommentText('');
      loadComments();
    } catch (err) {
      alert('Failed to post comment');
    }
  };

  const handleReplySubmit = async (parentId, name, text) => {
    const formData = new URLSearchParams();
    formData.append('guest_name', name);
    formData.append('text', text);
    formData.append('parent_id', parentId);
    formData.append('csrfmiddlewaretoken', getCsrfToken());

    try {
      await commentApi.post(attemptId, formData);
      setReplyTo(null);
      loadComments();
    } catch (err) {
      alert('Failed to post reply');
    }
  };

  const handleDelete = async (commentId) => {
    if (!confirm('Delete this comment?')) return;
    const formData = new URLSearchParams();
    formData.append('csrfmiddlewaretoken', getCsrfToken());
    
    try {
      await commentApi.delete(commentId, formData);
      loadComments();
    } catch (err) {
      alert('Failed to delete');
    }
  };

  const handleLike = (commentId) => {
    setComments(prev => prev.map(c => 
      c.id === commentId ? { ...c, likes: (c.likes || 0) + 1 } : c
    ));
  };

  return (
    <section className="comments-section" id="commentsBlock">
      <h3 className="comments-title">
        💬 Discussion <span>({comments.length})</span>
      </h3>
      
      <form className="comment-form" onSubmit={handleMainSubmit}>
        <div className="comment-user-avatar" id="userAvatar">
          {guestName ? getInitials(guestName) : 'G'}
        </div>
        <div className="comment-input-wrapper">
          <input 
            type="text" 
            id="guestNameInput"
            className="guest-name-field" 
            placeholder="Your name" 
            value={guestName}
            onChange={e => {
              setGuestName(e.target.value);
              document.getElementById('userAvatar').textContent = 
                e.target.value ? getInitials(e.target.value) : 'G';
            }}
            required 
          />
          <textarea 
            id="commentText"
            className="comment-input" 
            placeholder="Ask a question or share your thoughts..." 
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            required 
          />
          <div className="comment-actions">
            <button type="submit" className="btn-comment-primary">Post Comment</button>
          </div>
        </div>
      </form>

      {loading && <div style={{ textAlign: 'center', padding: '2rem' }}>Loading...</div>}

      <div className="comments-list" id="commentsList">
        {comments.length === 0 ? (
          <div className="comments-empty">
            <div className="comments-empty-icon">💬</div>
            <p>No comments yet. Be the first to share your thoughts!</p>
          </div>
        ) : (
          comments.map(comment => (
            <div key={comment.id}>
              <CommentItem 
                comment={comment}
                onReply={setReplyTo}
                onEdit={loadComments}
                onDelete={handleDelete}
                onLike={handleLike}
              />
              {replyTo === comment.id && (
                <ReplyForm 
                  parentId={comment.id}
                  onSubmit={handleReplySubmit}
                  onCancel={() => setReplyTo(null)}
                />
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default Comments;