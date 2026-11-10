export async function apiRequest(url, options = {}) {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
    }

    const merged = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...options.headers,
        },
    }

    try {
        const response = await fetch(url, merged)

        let data = null
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
            data = await response.json()
        } else if (response.status !== 204) {
            const text = await response.text()
            data = { _rawError: text }
        }

        if (!response.ok) {
            const error = new Error(data?.message || data?._rawError || `HTTP ${response.status}`)
            error.status = response.status
            error.data = data
            throw error
        }

        return data
    } catch (error) {
        if (!error.status) {
            console.error('[apiRequest] Network/parse failed:', url, error)
        }
        throw error
    }
}

export function debounce(fn, delay) {
    let timer
    const debounced = (...args) => {
        clearTimeout(timer)
        timer = setTimeout(() => fn(...args), delay)
    }
    debounced.cancel = () => clearTimeout(timer)
    return debounced
}

export function saveToSession(key, data) {
    try {
        const payload = {
            ...data,
            _timestamp: Date.now(),
        }
        sessionStorage.setItem(key, JSON.stringify(payload))
    } catch (e) {
        console.error('Session save failed:', e)
    }
}

export function loadFromSession(key, ttl = null) {
    try {
        const raw = sessionStorage.getItem(key)
        if (!raw) return null

        const data = JSON.parse(raw)

        if (ttl && data._timestamp && Date.now() - data._timestamp > ttl) {
            sessionStorage.removeItem(key)
            return null
        }

        const { _timestamp, ...cleanData } = data
        return cleanData
    } catch (e) {
        console.error('Session load failed:', e)
        return null
    }
}

export function clearSession(key) {
    sessionStorage.removeItem(key)
}

export function formatTime(seconds) {
    if (seconds <= 0) return '00:00'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

// FIXED: Track active timeout for cleanup
let announceTimeoutId = null

export function announce(message, priority = 'polite') {
    const elId = priority === 'assertive' ? 'aria-live-assertive' : 'aria-live-polite'
    const el = document.getElementById(elId)
    if (el) {
        // Clear previous timeout to prevent overlapping clears
        if (announceTimeoutId) {
            clearTimeout(announceTimeoutId)
        }
        el.textContent = message
        announceTimeoutId = setTimeout(() => {
            if (el.textContent === message) {
                el.textContent = ''
            }
            announceTimeoutId = null
        }, 2500)
    }
}

// Simple HTML sanitizer with LRU cache for performance
const SANITIZE_CACHE = new Map()
const MAX_CACHE_SIZE = 200

const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'span', 'div', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'sub', 'sup', 'blockquote', 'code', 'pre', 'table', 'thead', 'tbody', 'tr', 'td', 'th']
const ALLOWED_ATTRS = ['class', 'style']

export function sanitizeHtml(html) {
    if (!html || typeof html !== 'string') return ''

    // Check cache first
    const cached = SANITIZE_CACHE.get(html)
    if (cached !== undefined) return cached

    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    function cleanNode(node) {
        if (node.nodeType === Node.TEXT_NODE) return

        if (node.nodeType === Node.ELEMENT_NODE) {
            const tagName = node.tagName.toLowerCase()

            if (!ALLOWED_TAGS.includes(tagName)) {
                const parent = node.parentNode
                while (node.firstChild) {
                    parent.insertBefore(node.firstChild, node)
                }
                parent.removeChild(node)
                return
            }

            Array.from(node.attributes).forEach(attr => {
                if (!ALLOWED_ATTRS.includes(attr.name.toLowerCase())) {
                    node.removeAttribute(attr.name)
                }
            })

            if (node.hasAttribute('style')) {
                const style = node.getAttribute('style')
                if (/javascript:|expression\(|url\s*\(/i.test(style)) {
                    node.removeAttribute('style')
                }
            }
        }

        Array.from(node.childNodes).forEach(cleanNode)
    }

    Array.from(doc.body.childNodes).forEach(cleanNode)
    const result = doc.body.innerHTML

    // Cache result with LRU eviction
    if (SANITIZE_CACHE.size >= MAX_CACHE_SIZE) {
        const firstKey = SANITIZE_CACHE.keys().next().value
        SANITIZE_CACHE.delete(firstKey)
    }
    SANITIZE_CACHE.set(html, result)

    return result
}

// Strip HTML tags for plain text display
export function stripHtml(html) {
    if (!html || typeof html !== 'string') return ''
    const tmp = document.createElement('div')
    tmp.innerHTML = html
    return tmp.textContent || tmp.innerText || ''
}