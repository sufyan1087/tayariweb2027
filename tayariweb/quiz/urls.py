from django.urls import path
from . import views

app_name = 'quiz'  # ← ADD THIS LINE (namespace)

urlpatterns = [
    # Article with embedded quiz
    path('article/<slug:slug>/', views.article_detail, name='article_detail'),
    
    # Quiz embed API
    path('api/embed/<str:token>/', views.quiz_embed_api, name='quiz_embed_api'),
    
    # Existing quiz URLs
    path('', views.quiz_list, name='quiz_list'),
    path('<slug:slug>/', views.quiz_full, name='quiz_full'),
    
    # API endpoints
    path('api/create-attempt/<int:quiz_id>/', views.create_attempt_api, name='create_attempt_api'),
    path('api/save-answer/', views.save_answer_api, name='save_answer_api'),
    path('api/submit/', views.submit_quiz_api, name='submit_quiz_api'),
    path('api/feedback/<int:quiz_id>/', views.quiz_feedback_api, name='quiz_feedback_api'),
    path('api/comments/<int:attempt_id>/', views.get_comments, name='get_comments'),
    path('api/comment/<int:attempt_id>/', views.add_comment, name='add_comment'),
    path('api/comment/edit/<int:comment_id>/', views.edit_comment, name='edit_comment'),
    path('api/comment/delete/<int:comment_id>/', views.delete_comment, name='delete_comment'),
]