from django.apps import AppConfig


class WebsiteConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'website'
    
    def ready(self):
        # Don't import models here to avoid circular imports
        pass