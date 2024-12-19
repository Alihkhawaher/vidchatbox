class Router {
    constructor(contentElement) {
        if (!window.translations) {
            throw new Error('Translations not loaded');
        }

        this.contentElement = contentElement;
        
        // Ensure menu is at top on initialization
        const menuContainer = document.getElementById('menu-container');
        if (menuContainer && document.body.firstChild !== menuContainer) {
            document.body.insertBefore(menuContainer, document.body.firstChild);
        }
        // Routes configured for both local development and Vercel deployment
        this.routes = {
            '/': '/pages/home.html',
            '/install-android': '/pages/install-android.html',
            '/diag': '/pages/diag.html',
            '/api-instructions': '/pages/api-instructions.html'
        };

        // Store current language
        this.currentLang = localStorage.getItem('selectedLanguage') || 'en';
        this.applyLanguageDirection(this.currentLang);
        
        // Handle initial page load
        window.addEventListener('DOMContentLoaded', () => {
            this.initializeLanguage();
            this.handleRoute();
        });
        
        // Handle browser back/forward buttons
        window.addEventListener('popstate', () => this.handleRoute());

        // Intercept link clicks
        document.addEventListener('click', (e) => {
            if (e.target.tagName === 'A' && e.target.href) {
                const url = new URL(e.target.href);
                // Only handle internal links
                if (url.origin === window.location.origin) {
                    e.preventDefault();
                    this.navigate(url.pathname);
                }
            }
        });

        // Handle language changes
        document.addEventListener('languageChanged', (e) => {
            this.currentLang = e.detail.language;
            localStorage.setItem('selectedLanguage', this.currentLang);
            this.updatePageTranslations();
        });
    }

    initializeLanguage() {
        const languageSelect = document.getElementById('languageSelect');
        if (languageSelect) {
            languageSelect.value = this.currentLang;
            this.applyLanguageDirection(this.currentLang);
            
            languageSelect.addEventListener('change', (e) => {
                const newLang = e.target.value;
                this.currentLang = newLang;
                this.applyLanguageDirection(newLang);
                
                // Dispatch custom event for language change
                const event = new CustomEvent('languageChanged', {
                    detail: { language: newLang }
                });
                document.dispatchEvent(event);
            });
        }
    }

    applyLanguageDirection(lang) {
        const isRTL = lang === 'ar';
        document.documentElement.lang = lang;
        document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
        document.body.classList.toggle('ltr', !isRTL);
        
        // Toggle RTL stylesheet
        const rtlStylesheet = document.querySelector('link[href*="bulma-rtl"]');
        if (rtlStylesheet) {
            rtlStylesheet.disabled = !isRTL;
        }
    }

    async handleRoute() {
        const path = window.location.pathname;
        const route = this.routes[path] || this.routes[path.slice(1)] || this.routes['/'];
        
        try {
            // Normalize path for both environments
            const normalizedPath = route.startsWith('/pages') ? route : `/pages${route}`;
            const response = await fetch(normalizedPath);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const content = await response.text();
            
            // Create a temporary container to parse the content
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'text/html');
            
            // Extract only the content we want to display
            // If there's a specific content container in the loaded page, use that
            const pageContent = doc.querySelector('#content')?.innerHTML || 
                              doc.querySelector('body')?.innerHTML || 
                              content;
            
            // Create a container for the new content
            const container = document.createElement('div');
            container.innerHTML = pageContent;
            
            // Remove any duplicate meta tags, scripts, or other head elements
            container.querySelectorAll('meta, link[rel="stylesheet"], title').forEach(el => el.remove());
            
            // Update translations before adding to DOM
            this.updateTranslationsForElement(container);
            
            // Clear existing content while preserving menu position
            this.contentElement.innerHTML = '';
            this.contentElement.appendChild(container);

            // Ensure menu stays at top
            const menuContainer = document.getElementById('menu-container');
            if (menuContainer && document.body.firstChild !== menuContainer) {
                document.body.insertBefore(menuContainer, document.body.firstChild);
            }

            // Update active state in menu
            document.querySelectorAll('.navbar-item').forEach(link => {
                link.classList.toggle('is-active', link.getAttribute('href') === path);
            });

            // Execute any scripts in the loaded content
            container.querySelectorAll('script').forEach(script => {
                const newScript = document.createElement('script');
                Array.from(script.attributes).forEach(attr => {
                    newScript.setAttribute(attr.name, attr.value);
                });
                newScript.textContent = script.textContent;
                script.parentNode.replaceChild(newScript, script);
            });

            // Initialize any page-specific functionality
            this.initializePageSpecific(path);
            
        } catch (error) {
            console.error('Error loading page:', error);
            this.contentElement.innerHTML = '<div class="notification is-danger">Error loading page content</div>';
            
            // Ensure menu stays at top even when error occurs
            const menuContainer = document.getElementById('menu-container');
            if (menuContainer && document.body.firstChild !== menuContainer) {
                document.body.insertBefore(menuContainer, document.body.firstChild);
            }
        }
    }

    initializePageSpecific(path) {
        // Add any page-specific initialization here
        switch(path) {
            case '/diag':
            case '/diag.html':
                if (typeof showEnvironmentInfo === 'function') {
                    showEnvironmentInfo();
                }
                if (typeof updateProviderStatus === 'function') {
                    updateProviderStatus();
                }
                break;
        }
    }

    updateTranslationsForElement(element) {
        if (!window.translations) {
            console.error('Translations not loaded');
            return;
        }
        const currentTranslations = window.translations[this.currentLang];
        if (!currentTranslations) {
            console.error(`No translations found for language: ${this.currentLang}`);
            return;
        }

        element.querySelectorAll('[data-translate]').forEach(el => {
            const key = el.getAttribute('data-translate');
            const translation = this.getNestedTranslation(currentTranslations, key);
            
            if (translation) {
                if (el.tagName === 'INPUT' && el.hasAttribute('placeholder')) {
                    el.placeholder = translation;
                } else {
                    el.textContent = translation;
                }
            }
        });
    }

    updatePageTranslations() {
        this.updateTranslationsForElement(document);
        
        // Ensure menu stays at top after language update
        const menuContainer = document.getElementById('menu-container');
        if (menuContainer && document.body.firstChild !== menuContainer) {
            document.body.insertBefore(menuContainer, document.body.firstChild);
        }
    }

    getNestedTranslation(obj, path) {
        try {
            return path.split('.').reduce((acc, part) => {
                if (acc === undefined) throw new Error(`Invalid path: ${path}`);
                return acc[part];
            }, obj);
        } catch (error) {
            console.error(`Translation error: ${error.message}`);
            return undefined;
        }
    }

    navigate(path) {
        window.history.pushState({}, '', path);
        this.handleRoute();
    }
}

// Initialize router when translations are loaded
function initializeRouter() {
    const contentElement = document.getElementById('content');
    if (!contentElement) {
        console.error('Content element not found');
        return;
    }

    // Initialize router when translations are loaded
    if (window.translations) {
        try {
            window.router = new Router(contentElement);
            console.log('Router initialized successfully');
        } catch (error) {
            console.error('Failed to initialize router:', error);
        }
    } else {
        // Wait for translations to be loaded
        document.addEventListener('translationsLoaded', () => {
            try {
                window.router = new Router(contentElement);
                console.log('Router initialized successfully');
            } catch (error) {
                console.error('Failed to initialize router:', error);
            }
        });
    }
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeRouter);
} else {
    initializeRouter();
}
