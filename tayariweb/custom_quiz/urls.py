# custom_quiz/urls.py
from django.urls import path
from . import views

app_name = 'custom_quiz'

urlpatterns = [
    # Main entry points
    path('', views.QuizGeneratorView.as_view(), name='generator'),
    path('<slug:slug>/', views.QuizGeneratorView.as_view(), name='generator_by_slug'),
    
    # Optional: Backward-compatible page_key route (maps to same view)
    path('page/<str:page_key>/', views.QuizGeneratorView.as_view(), name='generator_by_key'),
    
    # API endpoints
    path('api/check-availability/', views.CheckAvailabilityAPI.as_view(), name='check_availability'),
    path('api/generate/', views.GenerateQuizAPI.as_view(), name='generate_quiz'),
    path('api/topics/', views.GetTopicsAPI.as_view(), name='get_topics'),
]