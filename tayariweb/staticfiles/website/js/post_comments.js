/**
 * Post Comments - Event listener version
 */

(function() {
    'use strict';

    console.log('📦 Post comments script loaded');

    function init() {
        var form = document.getElementById('mainCommentForm');
        if (!form) {
            console.error('Form #mainCommentForm not found!');
            return;
        }

        // Remove inline onsubmit and add event listener
        form.removeAttribute('onsubmit');
        
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Form submitted!');
            handleSubmit();
            return false;
        });

        console.log('✅ Form listener attached');
        
        // Load existing comments
        loadComments();
    }

    function handleSubmit() {
        var nameInput = document.getElementById('guestNameInput');
        var textInput = document.getElementById('commentText');
        
        if (!textInput) {
            console.error('commentText not found');
            return;
        }
        
        var guestName = nameInput ? nameInput.value.trim() : '';
        var text = textInput.value.trim();
        
        console.log('Submitting:', {guestName, text: text.substring(0, 20)});
        
        if (!text) {
            alert('Please write a comment');
            return;
        }
        
        if (!guestName) {
            alert('Please enter your name');
            nameInput.focus();
            return;
        }
        
        var contentType = window.contentType;
        var objectId = window.objectId;
        
        if (!contentType || !objectId) {
            alert('Error: Missing content info');
            return;
        }
        
        var formData = new URLSearchParams();
        formData.append('text', text);
        formData.append('guest_name', guestName);
        
        var url = '/api/comment/' + contentType + '/' + objectId + '/';
        console.log('POST to:', url);
        
        fetch(url, {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCsrfToken(),
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData
        })
        .then(function(r) {
            console.log('Response status:', r.status);
            return r.json().then(function(data) {
                return {ok: r.ok, data: data};
            });
        })
        .then(function(result) {
            console.log('Response:', result.data);
            
            if (result.ok && (result.data.status === 'success' || result.data.success)) {
                textInput.value = '';
                if (nameInput) nameInput.value = '';
                loadComments();
                showToast('Comment posted!', 'success');
            } else {
                alert(result.data.error || 'Failed to post');
            }
        })
        .catch(function(err) {
            console.error('Error:', err);
            alert('Error posting comment');
        });
    }

       function loadComments() {
        var contentType = window.contentType;
        var objectId = window.objectId;
        
        if (!contentType || !objectId) return;
        
        var url = '/api/comments/' + contentType + '/' + objectId + '/';
        console.log('GET:', url);
        
        fetch(url)
        .then(function(r) { return r.json(); })
        .then(function(data) {
            console.log('Loaded:', data);
            var container = document.getElementById('commentsList');
            var countSpan = document.getElementById('commentsCount');
            
            if (!container) return;
            
            var total = data.comments ? data.comments.length : 0;
            if (countSpan) countSpan.textContent = '(' + total + ')';
            
            if (data.comments && data.comments.length > 0) {
                // FIXED: Build HTML string properly (no newline after return)
                var html = '';
                for (var i = 0; i < data.comments.length; i++) {
                    var c = data.comments[i];
                    var username = c.user || c.guest_name || 'Anonymous';
                    var initial = username.charAt(0).toUpperCase();
                    
                    html += '<div class="comment-item">' +
                        '<div class="comment-user-avatar">' + escapeHtml(initial) + '</div>' +
                        '<div class="comment-content">' +
                            '<div class="comment-header">' +
                                '<span class="comment-author">' + escapeHtml(username) + '</span>' +
                                '<span class="comment-time">' + escapeHtml(c.created_at) + '</span>' +
                            '</div>' +
                            '<p class="comment-text">' + escapeHtml(c.text || c.content) + '</p>' +
                            '<div class="comment-footer">' +
                                '<button class="like-btn" onclick="likeComment(' + c.comment_id + ')">👍 ' + (c.likes || 0) + '</button>' +
                            '</div>' +
                        '</div>' +
                    '</div>';
                }
                container.innerHTML = html;
            } else {
                container.innerHTML = 
                    '<div class="comments-empty">' +
                        '<div class="comments-empty-icon">💬</div>' +
                        'No comments yet. Be the first!' +
                    '</div>';
            }
        })
        .catch(function(err) {
            console.error('Load error:', err);
        });
    }

    window.likeComment = function(commentId) {
        fetch('/api/comment/like/' + commentId + '/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCsrfToken(),
                'Content-Type': 'application/json'
            }
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success) loadComments();
        });
    };

    function showToast(msg, type) {
        var toast = document.createElement('div');
        toast.textContent = msg;
        toast.style.cssText = 'position:fixed;top:100px;right:20px;padding:1rem 1.5rem;background:#28a745;color:white;border-radius:8px;z-index:9999;';
        document.body.appendChild(toast);
        setTimeout(function() { toast.remove(); }, 3000);
    }

    function getCsrfToken() {
        var name = 'csrftoken';
        var cookies = document.cookie.split(';');
        for (var i = 0; i < cookies.length; i++) {
            var c = cookies[i].trim();
            if (c.indexOf(name + '=') === 0) {
                return decodeURIComponent(c.substring(name.length + 1));
            }
        }
        return '';
    }

    function escapeHtml(text) {
        if (!text) return '';
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();