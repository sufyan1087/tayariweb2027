const API_BASE = '/quizzes/api';

function getCsrfToken() {
  const name = 'csrftoken';
  const cookies = document.cookie.split(';');
  for (let cookie of cookies) {
    const [key, value] = cookie.trim().split('=');
    if (key === name) return decodeURIComponent(value);
  }
  return '';
}

async function apiPost(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': getCsrfToken(),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function apiPostForm(url, formData) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'X-CSRFToken': getCsrfToken() },
    body: formData,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

const quizApi = {
  createAttempt: (quizId) => apiPost(`${API_BASE}/create-attempt/${quizId}/`, {}),
  saveAnswer: (attemptId, questionId, answer) => 
    apiPost(`${API_BASE}/save-answer/`, { attempt_id: attemptId, question_id: questionId, answer }),
  submitQuiz: (attemptId, answers, timeTaken) => 
    apiPost(`${API_BASE}/submit/`, { attempt_id: attemptId, answers, time_taken: timeTaken }),
  getFeedback: (quizId) => fetch(`${API_BASE}/feedback/${quizId}/`).then(r => r.json()),
  postFeedback: (quizId, type) => apiPost(`${API_BASE}/feedback/${quizId}/`, { type }),
};

const commentApi = {
  load: (attemptId) => fetch(`${API_BASE}/comments/${attemptId}/`).then(r => r.json()),
  post: (attemptId, formData) => apiPostForm(`${API_BASE}/comment/${attemptId}/`, formData),
  edit: (commentId, formData) => apiPostForm(`${API_BASE}/comments/edit/${commentId}/`, formData),
  delete: (commentId, formData) => apiPostForm(`${API_BASE}/comments/delete/${commentId}/`, formData),
};

export { quizApi, commentApi, getCsrfToken };