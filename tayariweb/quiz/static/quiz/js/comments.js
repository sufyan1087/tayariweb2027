/**
 * TayariWeb Quiz Comments System
 * Matches: comments-section structure with like buttons
 */

(function(global) {
    'use strict';

    const CONFIG = {
        MAX_COMMENT_LENGTH: 1000,
        MAX_NAME_LENGTH: 50,
        RATE_LIMIT_MS: 5000,
        TOAST_DURATION: 3000
    };

    const state = {
        currentComments: [],
        guestName: localStorage.getItem('tayari_guestName') || '',
        lastCommentTime: 0,
        isSubmitting: false,
        editingCommentId: null,
        likedComments: new Set()
    };

    const elements = {};

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        cacheElements();
        initCommentForm();
        
        if (window.quizApp?.state?.attemptId) {
            loadComments();
        } else {
            const checkInterval = setInterval(() => {
                if (window.quizApp?.state?.attemptId) {
                    clearInterval(checkInterval);
                    loadComments();
                }
            }, 500);
            setTimeout(() => clearInterval(checkInterval), 10000);
        }
    }

    function cacheElements() {
        elements.commentsList = document.getElementById('commentsList');
        elements.commentsCount = document.getElementById('commentsCount');
        elements.guestNameInput = document.getElementById('guestNameInput');
        elements.commentText = document.getElementById('commentText');
        elements.userAvatar = document.getElementById('userAvatar');
        elements.mainCommentForm = document.getElementById('mainCommentForm');
        elements.commentsLoading = document.getElementById('commentsLoading');
    }

    function initCommentForm() {
        const { guestNameInput, userAvatar, mainCommentForm, commentText } = elements;
        
        if (!mainCommentForm) return;

        if (guestNameInput && state.guestName) {
            guestNameInput.value = state.guestName;
            if (userAvatar) {
                userAvatar.textContent = getInitials(state.guestName);
            }
        }

        if (guestNameInput) {
            guestNameInput.addEventListener('input', function() {
                const name = this.value.trim();
                if (userAvatar) {
                    userAvatar.textContent = name ? getInitials(name) : 'G';
                }
                updateCharCounter(this, CONFIG.MAX_NAME_LENGTH);
            });
        }

        if (commentText) {
            commentText.addEventListener('input', function() {
                updateCharCounter(this, CONFIG.MAX_COMMENT_LENGTH);
                this.style.height = 'auto';
                this.style.height = Math.min(this.scrollHeight, 200) + 'px';
            });
        }

        mainCommentForm.addEventListener('submit', handleMainSubmit);
    }

    function updateCharCounter(input, maxLength) {
        const existing = input.parentElement.querySelector('.char-counter');
        if (existing) existing.remove();

        const current = input.value.length;
        const counter = document.createElement('div');
        counter.className = 'char-counter';
        counter.textContent = `${current}/${maxLength}`;
        counter.style.cssText = 'font-size: 0.75rem; color: #6b7280; text-align: right; margin-top: 4px;';
        
        input.parentElement.appendChild(counter);
    }

    async function loadComments() {
        const attemptId = window.quizApp?.state?.attemptId;
        if (!attemptId || String(attemptId).startsWith('local')) {
            renderComments();
            return;
        }

        const { commentsLoading } = elements;
        if (commentsLoading) commentsLoading.style.display = 'block';

        try {
            const response = await fetch(`/quizzes/api/comments/${attemptId}/`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            state.currentComments = data.comments || [];
            renderComments();
            
        } catch (error) {
            console.error('Error loading comments:', error);
            if (elements.commentsList) {
                elements.commentsList.innerHTML = `
                    <div class="comments-empty">
                        <div class="comments-empty-icon">⚠️</div>
                        <p>Unable to load comments</p>
                    </div>
                `;
            }
        } finally {
            if (commentsLoading) commentsLoading.style.display = 'none';
        }
    }

    function renderComments() {
        const { commentsList, commentsCount } = elements;
        if (!commentsList) return;

        if (!state.currentComments.length) {
            commentsList.innerHTML = `
                <div class="comments-empty">
                    <div class="comments-empty-icon">💬</div>
                    <p>No comments yet. Be the first to share your thoughts!</p>
                </div>
            `;
            if (commentsCount) commentsCount.textContent = '(0)';
            return;
        }

        const html = state.currentComments.map((comment, index) => 
            createCommentHTML(comment, false, index)
        ).join('');

        commentsList.innerHTML = html;
        if (commentsCount) commentsCount.textContent = `(${state.currentComments.length})`;
    }

    function createCommentHTML(comment, isReply = false, index = 0) {
    const isOwner = comment.is_owner || comment.user === state.guestName;
    const isLiked = state.likedComments.has(comment.id);
    
    // Safe date formatting with multiple fallbacks
    let timeAgo = 'Recently';
    try {
        // Try multiple possible date fields
        const dateValue = comment.created_at || comment.created_at_iso || comment.date || comment.timestamp;
        timeAgo = formatTimeAgo(dateValue);
    } catch (e) {
        console.warn('Date parsing failed for comment:', comment.id, e);
    }
    
    const likeCount = comment.likes || 0;
    
    let actions = [];
    
    // Like button (for everyone)
    actions.push(`
        <button class="like-btn ${isLiked ? 'active' : ''}" onclick="toggleLike(${comment.id})" title="Like this comment">
            👍 ${likeCount}
        </button>
    `);
    
    // Reply button (for non-replies)
    if (!isReply) {
        actions.push(`
            <button class="reply-btn" onclick="showReplyForm(${comment.id})">
                Reply
            </button>
        `);
    }
    
    // Edit/Delete for owner
    if (isOwner) {
        actions.push(`
            <button class="comment-action edit" onclick="editComment(${comment.id})">
                Edit
            </button>
            <button class="comment-action delete" onclick="deleteComment(${comment.id})">
                Delete
            </button>
        `);
    }

    const actionsHtml = `<div class="comment-footer">${actions.join('')}</div>`;
    
    const replyFormHtml = !isReply ? createReplyFormHTML(comment.id) : '';

    return `
        <div class="comment-item ${isReply ? 'comment-reply' : ''}" id="comment-${comment.id}" data-comment-id="${comment.id}">
            <div class="comment-user-avatar" style="background: ${stringToColor(comment.user)}">
                ${getInitials(comment.user)}
            </div>
            <div class="comment-content">
                <div class="comment-header">
                    <span class="comment-author">
                        ${escapeHtml(comment.user)}
                        ${isOwner ? '<span class="comment-badge">You</span>' : ''}
                    </span>
                    <span class="comment-time">${timeAgo}</span>
                </div>
                <p class="comment-text" id="commentText-${comment.id}">
                    ${formatCommentText(comment.text)}
                    ${comment.is_edited ? '<span class="comment-edited">(edited)</span>' : ''}
                </p>
                
                <!-- Edit Form -->
                <form class="comment-edit-form" id="editForm-${comment.id}" 
                      onsubmit="submitEdit(event, ${comment.id}); return false;"
                      style="display: none;">
                    <textarea class="comment-edit-input" id="editInput-${comment.id}" 
                              maxlength="${CONFIG.MAX_COMMENT_LENGTH}" required>${escapeHtml(comment.text)}</textarea>
                    <div class="comment-actions">
                        <button type="button" class="btn-comment-primary" style="background: var(--bg); color: var(--text);" onclick="cancelEdit(${comment.id})">Cancel</button>
                        <button type="submit" class="btn-comment-primary">Save</button>
                    </div>
                </form>
                
                ${actionsHtml}
            </div>
        </div>
        ${replyFormHtml}
        ${!isReply ? `<div class="replies-container" id="replies-${comment.id}"></div>` : ''}
    `;
}

    function createReplyFormHTML(commentId) {
        return `
            <form class="reply-form" id="replyForm-${commentId}" 
                  onsubmit="submitReply(event, ${commentId}); return false;">
                <div class="comment-input-wrapper">
                    <input type="text" class="guest-name-field" id="replyName-${commentId}" 
                           placeholder="Your name" maxlength="${CONFIG.MAX_NAME_LENGTH}" 
                           value="${escapeHtml(state.guestName)}" required>
                    <textarea class="comment-input" placeholder="Write a reply..." 
                              maxlength="${CONFIG.MAX_COMMENT_LENGTH}" required></textarea>
                    <div class="comment-actions">
                        <button type="button" class="btn-comment-primary" style="background: var(--bg); color: var(--text);" onclick="hideReplyForm(${commentId})">Cancel</button>
                        <button type="submit" class="btn-comment-primary">Post Reply</button>
                    </div>
                </div>
            </form>
        `;
    }

    // Like functionality
    function toggleLike(commentId) {
        const isLiked = state.likedComments.has(commentId);
        const btn = document.querySelector(`#comment-${commentId} .like-btn`);
        
        if (isLiked) {
            state.likedComments.delete(commentId);
            if (btn) {
                btn.classList.remove('active');
                const count = parseInt(btn.textContent.replace(/\D/g, '')) - 1;
                btn.innerHTML = `👍 ${count}`;
            }
        } else {
            state.likedComments.add(commentId);
            if (btn) {
                btn.classList.add('active');
                const count = parseInt(btn.textContent.replace(/\D/g, '')) + 1;
                btn.innerHTML = `👍 ${count}`;
            }
            showNotification('Comment liked! 👍', 'success');
        }
        
        // Sync with server (optional)
        // fetch(`/quizzes/api/comments/like/${commentId}/`, { method: 'POST' });
    }

    // Form submissions (same as before, abbreviated)
    async function handleMainSubmit(e) {
        e.preventDefault();
        if (state.isSubmitting) return;

        const { guestNameInput, commentText } = elements;
        const name = guestNameInput?.value.trim();
        const text = commentText?.value.trim();
        
        if (!validateComment(name, text)) return;
        if (!checkRateLimit()) return;

        const attemptId = window.quizApp?.state?.attemptId;
        if (!attemptId || String(attemptId).startsWith('local')) {
            showNotification('Comments require a server session.', 'error');
            return;
        }

        state.isSubmitting = true;
        const tempComment = createTempComment(name, text);
        addCommentToUI(tempComment, true);
        
        if (commentText) {
            commentText.value = '';
            commentText.style.height = 'auto';
        }

        try {
            const formData = new URLSearchParams();
            formData.append('guest_name', name);
            formData.append('text', text);
            formData.append('csrfmiddlewaretoken', getCsrfToken());

            const response = await fetch(`/quizzes/api/comment/${attemptId}/`, {
                method: 'POST',
                headers: { 'X-CSRFToken': getCsrfToken() },
                body: formData
            });

            const data = await response.json();
            
            if (data.status === 'success') {
                state.lastCommentTime = Date.now();
                state.guestName = name;
                localStorage.setItem('tayari_guestName', name);
                replaceTempComment(tempComment.id, data.comment || tempComment);
                showNotification('Comment posted! 💬', 'success');
                loadComments();
            } else {
                throw new Error(data.message || 'Failed to post');
            }
        } catch (error) {
            removeTempComment(tempComment.id);
            showNotification(error.message || 'Failed to post', 'error');
        } finally {
            state.isSubmitting = false;
        }
    }

    async function submitReply(e, parentId) {
        e.preventDefault();
        if (state.isSubmitting) return;

        const form = e.target;
        const nameField = document.getElementById(`replyName-${parentId}`);
        const textField = form.querySelector('textarea');
        
        const name = nameField?.value.trim();
        const text = textField?.value.trim();
        
        if (!validateComment(name, text)) return;
        if (!checkRateLimit()) return;

        const attemptId = window.quizApp?.state?.attemptId;
        if (!attemptId || String(attemptId).startsWith('local')) {
            showNotification('Comments require a server session.', 'error');
            return;
        }

        state.isSubmitting = true;
        const tempReply = createTempComment(name, text, parentId);
        addReplyToUI(tempReply, parentId, true);
        hideReplyForm(parentId);

        try {
            const formData = new URLSearchParams();
            formData.append('guest_name', name);
            formData.append('text', text);
            formData.append('parent_id', parentId);
            formData.append('csrfmiddlewaretoken', getCsrfToken());

            const response = await fetch(`/quizzes/api/comment/${attemptId}/`, {
                method: 'POST',
                headers: { 'X-CSRFToken': getCsrfToken() },
                body: formData
            });

            const data = await response.json();
            
            if (data.status === 'success') {
                state.lastCommentTime = Date.now();
                state.guestName = name;
                localStorage.setItem('tayari_guestName', name);
                replaceTempComment(tempReply.id, data.comment || tempReply);
                showNotification('Reply posted! 💬', 'success');
                loadComments();
            } else {
                throw new Error(data.message || 'Failed to post reply');
            }
        } catch (error) {
            removeTempComment(tempReply.id);
            showNotification(error.message || 'Failed to post reply', 'error');
        } finally {
            state.isSubmitting = false;
        }
    }

    async function submitEdit(e, commentId) {
        e.preventDefault();
        
        const editInput = document.getElementById(`editInput-${commentId}`);
        if (!editInput) return;
        
        const text = editInput.value.trim();
        if (!text) {
            showNotification('Comment cannot be empty', 'error');
            return;
        }

        try {
            const formData = new URLSearchParams();
            formData.append('text', text);
            formData.append('csrfmiddlewaretoken', getCsrfToken());

            const response = await fetch(`/quizzes/api/comments/edit/${commentId}/`, {
                method: 'POST',
                headers: { 'X-CSRFToken': getCsrfToken() },
                body: formData
            });

            if (response.status === 403) throw new Error('You can only edit your own comments');

            const data = await response.json();
            
            if (data.status === 'success') {
                const textDiv = document.getElementById(`commentText-${commentId}`);
                if (textDiv) {
                    textDiv.innerHTML = formatCommentText(text) + '<span class="comment-edited">(edited)</span>';
                }
                cancelEdit(commentId);
                showNotification('Comment updated! ✏️', 'success');
            } else {
                throw new Error(data.error || 'Failed to update');
            }
        } catch (error) {
            showNotification(error.message || 'Failed to update', 'error');
        }
    }

    async function deleteComment(commentId) {
        if (!confirm('Delete this comment?')) return;

        const commentEl = document.getElementById(`comment-${commentId}`);
        if (commentEl) commentEl.style.opacity = '0.5';

        try {
            const formData = new URLSearchParams();
            formData.append('csrfmiddlewaretoken', getCsrfToken());

            const response = await fetch(`/quizzes/api/comments/delete/${commentId}/`, {
                method: 'POST',
                headers: { 'X-CSRFToken': getCsrfToken() },
                body: formData
            });

            if (response.status === 403) throw new Error('You can only delete your own comments');

            const data = await response.json();
            
            if (data.status === 'success') {
                if (commentEl) {
                    commentEl.style.transition = 'all 0.3s ease';
                    commentEl.style.transform = 'translateX(-100%)';
                    commentEl.style.opacity = '0';
                    setTimeout(() => {
                        commentEl.remove();
                        updateCommentCount();
                    }, 300);
                }
                showNotification('Comment deleted! 🗑️', 'success');
            } else {
                throw new Error(data.error || 'Failed to delete');
            }
        } catch (error) {
            if (commentEl) commentEl.style.opacity = '1';
            showNotification(error.message || 'Failed to delete', 'error');
        }
    }

    // UI Helpers
    function showReplyForm(commentId) {
        document.querySelectorAll('.reply-form').forEach(form => {
            form.classList.remove('active');
        });
        
        const form = document.getElementById(`replyForm-${commentId}`);
        if (!form) return;
        
        form.classList.add('active');
        
        const nameField = document.getElementById(`replyName-${commentId}`);
        if (nameField && state.guestName) nameField.value = state.guestName;
        
        setTimeout(() => {
            const textarea = form.querySelector('textarea');
            if (textarea) textarea.focus();
        }, 100);
    }

    function hideReplyForm(commentId) {
        const form = document.getElementById(`replyForm-${commentId}`);
        if (form) {
            form.classList.remove('active');
            form.reset();
        }
    }

    function editComment(commentId) {
        document.querySelectorAll('.comment-edit-form').forEach(form => {
            form.style.display = 'none';
        });
        document.querySelectorAll('.comment-text').forEach(text => {
            text.style.display = 'block';
        });
        
        const textDiv = document.getElementById(`commentText-${commentId}`);
        const editForm = document.getElementById(`editForm-${commentId}`);
        
        if (textDiv && editForm) {
            textDiv.style.display = 'none';
            editForm.style.display = 'block';
            
            const editInput = document.getElementById(`editInput-${commentId}`);
            if (editInput) {
                editInput.focus();
                editInput.setSelectionRange(editInput.value.length, editInput.value.length);
            }
            
            state.editingCommentId = commentId;
        }
    }

    function cancelEdit(commentId) {
        const textDiv = document.getElementById(`commentText-${commentId}`);
        const editForm = document.getElementById(`editForm-${commentId}`);
        
        if (textDiv && editForm) {
            textDiv.style.display = 'block';
            editForm.style.display = 'none';
        }
        
        state.editingCommentId = null;
    }

    // Utilities
    function validateComment(name, text) {
        if (!name || name.length < 2) {
            showNotification('Please enter your name (at least 2 characters)', 'error');
            return false;
        }
        if (!text || text.length < 3) {
            showNotification('Please write a comment (at least 3 characters)', 'error');
            return false;
        }
        if (text.length > CONFIG.MAX_COMMENT_LENGTH) {
            showNotification(`Comment too long (max ${CONFIG.MAX_COMMENT_LENGTH} characters)`, 'error');
            return false;
        }
        return true;
    }

    function checkRateLimit() {
        const now = Date.now();
        const timeSinceLast = now - state.lastCommentTime;
        
        if (timeSinceLast < CONFIG.RATE_LIMIT_MS) {
            const waitSeconds = Math.ceil((CONFIG.RATE_LIMIT_MS - timeSinceLast) / 1000);
            showNotification(`Please wait ${waitSeconds} seconds before posting again`, 'warning');
            return false;
        }
        return true;
    }

    function createTempComment(name, text, parentId = null) {
    return {
        id: 'temp-' + Date.now(),
        user: name,
        text: text,
        created_at: new Date().toISOString(), // Use ISO format
        is_owner: true,
        is_edited: false,
        parent_id: parentId,
        likes: 0
    };
}
    function addCommentToUI(comment, isTemp = false) {
        const { commentsList } = elements;
        if (!commentsList) return;

        const emptyState = commentsList.querySelector('.comments-empty');
        if (emptyState) emptyState.remove();

        const html = createCommentHTML(comment, false, 0);
        const wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        const el = wrapper.firstElementChild;
        
        if (isTemp) el.classList.add('comment-pending');
        
        commentsList.insertBefore(el, commentsList.firstChild);
        updateCommentCount();
    }

    function addReplyToUI(reply, parentId, isTemp = false) {
        const container = document.getElementById(`replies-${parentId}`);
        if (!container) return;

        const html = createCommentHTML(reply, true, 0);
        const wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        const el = wrapper.firstElementChild;
        
        if (isTemp) el.classList.add('comment-pending');
        
        container.appendChild(el);
    }

    function replaceTempComment(tempId, realComment) {
        const tempEl = document.getElementById(`comment-${tempId}`);
        if (!tempEl) return;
        
        const html = createCommentHTML(realComment, tempEl.classList.contains('comment-reply'));
        const wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        const newEl = wrapper.firstElementChild;
        
        tempEl.parentElement.replaceChild(newEl, tempEl);
    }

    function removeTempComment(tempId) {
        const tempEl = document.getElementById(`comment-${tempId}`);
        if (tempEl) {
            tempEl.style.transition = 'all 0.3s ease';
            tempEl.style.opacity = '0';
            tempEl.style.transform = 'translateX(-20px)';
            setTimeout(() => tempEl.remove(), 300);
        }
    }

    function updateCommentCount() {
        const count = document.querySelectorAll('.comment-item:not(.comment-pending)').length;
        const countElement = elements.commentsCount;
        if (countElement) countElement.textContent = `(${count})`;
    }

    function showNotification(message, type = 'info') {
        document.querySelectorAll('.notification-toast').forEach(el => el.remove());
        
        const toast = document.createElement('div');
        toast.className = `notification-toast notification-${type}`;
        toast.textContent = message;
        
        toast.style.transform = 'translateX(0)';
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.transform = 'translateX(120%)';
            setTimeout(() => toast.remove(), 300);
        }, CONFIG.TOAST_DURATION);
    }

    function formatCommentText(text) {
        if (!text) return '';
        return escapeHtml(text).replace(/\n/g, '<br>');
    }

    function formatTimeAgo(dateString) {
    if (!dateString || dateString === 'Just now') return 'Just now';
    
    let date;
    
    // Handle different input types
    if (typeof dateString === 'string') {
        // Try ISO format first
        date = new Date(dateString);
        
        // If invalid, try common Django formats
        if (isNaN(date.getTime())) {
            // Handle "Jan. 15, 2024, 2:30 p.m." format
            let cleaned = dateString
                .replace(/\./g, '')
                .replace('a.m.', 'AM')
                .replace('p.m.', 'PM')
                .replace('midnight', '12:00 AM')
                .replace('noon', '12:00 PM');
            
            date = new Date(cleaned);
        }
        
        // If still invalid, try parsing as relative time string
        if (isNaN(date.getTime())) {
            // Check if it's already a relative string (e.g., "2 days ago")
            if (dateString.includes('ago') || dateString.includes('Just')) {
                return dateString;
            }
            return 'Recently';
        }
    } else if (typeof dateString === 'number') {
        // Unix timestamp (seconds or milliseconds)
        date = new Date(dateString < 10000000000 ? dateString * 1000 : dateString);
    } else {
        return 'Recently';
    }
    
    if (isNaN(date.getTime())) {
        return 'Recently';
    }
    
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 0) return 'Just now';
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;
    if (seconds < 31536000) return `${Math.floor(seconds / 2592000)}mo ago`;
    
    return `${Math.floor(seconds / 31536000)}y ago`;
}

    function stringToColor(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
        return '#' + '00000'.substring(0, 6 - c.length) + c;
    }

    function getInitials(name) {
        return name
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function getCsrfToken() {
        const name = 'csrftoken';
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [key, value] = cookie.trim().split('=');
            if (key === name) return decodeURIComponent(value);
        }
        return '';
    }

    // Expose to global scope
    global.toggleLike = toggleLike;
    global.showReplyForm = showReplyForm;
    global.hideReplyForm = hideReplyForm;
    global.editComment = editComment;
    global.cancelEdit = cancelEdit;
    global.submitEdit = submitEdit;
    global.deleteComment = deleteComment;
    global.submitReply = submitReply;
    global.loadComments = loadComments;

})(window);