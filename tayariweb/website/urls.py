from django.urls import path
from . import views

app_name = 'website'

urlpatterns = [
    # Home
    path('', views.home_view, name='home'),
    
    # Unified List Views
    path('study-materials/', views.content_list_view, {'content_type': 'post'}, name='all_posts'),
    path('jobs/', views.content_list_view, {'content_type': 'job'}, name='jobs_list'),
    path('scholarships/', views.content_list_view, {'content_type': 'scholarship'}, name='scholarships_list'),
    path('free-courses/', views.content_list_view, {'content_type': 'course'}, name='courses_list'),
    
    # Unified Detail Views
    path('post/<slug:slug>/', views.content_detail_view, {'content_type': 'post'}, name='post_detail'),
    path('job/<slug:slug>/', views.content_detail_view, {'content_type': 'job'}, name='job_detail'),
    path('scholarship/<slug:slug>/', views.content_detail_view, {'content_type': 'scholarship'}, name='scholarship_detail'),
    path('course/<slug:slug>/', views.content_detail_view, {'content_type': 'course'}, name='course_detail'),
    
    # Categories & Authors
    path('category/<slug:slug>/', views.category_detail_view, name='category_detail'),
    path('author/<str:username>/', views.author_profile_view, name='author_profile'),
    
    # Search
    path('search/', views.search_view, name='search'),
    path('api/search/', views.live_search_api, name='live_search_api'),
    
    # Comments API
    path('api/comment/<str:content_type>/<int:object_id>/', views.add_comment_view, name='add_comment'),
    path('api/comments/<str:content_type>/<int:object_id>/', views.load_comments_api, name='load_comments'),
    
    # User Interactions
    path('api/<str:interaction>/<str:content_type>/<int:pk>/', views.toggle_interaction_view, name='toggle_interaction'),
    
    # Newsletter
    path('api/newsletter/subscribe/', views.newsletter_subscribe_view, name='newsletter_subscribe'),
    
    # Static Pages
    path('about-us/', views.about_view, name='about'),
    path('contact-us/', views.contact_view, name='contact'),
    path('privacy-policy/', views.privacy_view, name='privacy'),
    path('terms-of-service/', views.terms_view, name='terms'),
]