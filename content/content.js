(() => {
  // State
  let isEnabled = false;
  let currentHostname = '';
  let observer = null;
  let imageObserver = null;
  let scrollTimeout = null;
  let rescanInterval = null;
  const processedElements = new WeakSet();

  // Score patterns to detect
  const scorePatterns = [
    // Simple scores: 2-1, 2 - 1, 2:1, 2 : 1
    /\b(\d{1,2})\s*[-–—:]\s*(\d{1,2})\b/g,
    // Score with teams: Arsenal 2 - 1 Chelsea, Arsenal 2-1 Chelsea
    /\b([A-Z][a-zA-Z\s]+)\s+(\d{1,2})\s*[-–—:]\s*(\d{1,2})\s+([A-Z][a-zA-Z\s]+)\b/g,
    // Aggregated scores: 3-2 (agg), (4-3 agg)
    /\(\s*\d{1,2}\s*[-–—:]\s*\d{1,2}\s*(agg|aggregate)?\s*\)/gi,
    // FT, HT scores: FT 2-1, HT: 1-0
    /\b(FT|HT|Full[\s-]?Time|Half[\s-]?Time)\s*:?\s*\d{1,2}\s*[-–—:]\s*\d{1,2}\b/gi,
    // Penalty shootouts: (4-3 pens), (pens: 5-4)
    /\(\s*(pens?|penalties)\s*:?\s*\d{1,2}\s*[-–—:]\s*\d{1,2}\s*\)/gi,
    /\(\s*\d{1,2}\s*[-–—:]\s*\d{1,2}\s*(pens?|penalties)\s*\)/gi,
    // Match results text
    /\b(won|lost|beat|defeated|draw|drew)\s+\d{1,2}\s*[-–—:]\s*\d{1,2}\b/gi,
    // Goal scorers with minutes
    /\b[A-Z][a-zA-Z]+\s+\d+['′]\s*(,\s*\d+['′])*/g
  ];

  // Spoiler keywords that reveal match outcomes
  const spoilerKeywords = [
    'final score', 'full time', 'match result', 'winner', 'winning goal',
    'victory', 'defeat', 'thrashing', 'demolished', 'stunned', 'upset',
    'comeback', 'late winner', 'equalizer', 'hat-trick', 'hat trick',
    'clean sheet', 'penalty shootout', 'extra time winner'
  ];

  // Keywords to remove from visible text (they reveal outcomes)
  const keywordsToRemove = [
    'victory', 'defeat', 'thrashing', 'demolished', 'stunned', 'upset',
    'comeback', 'late winner', 'winning goal', 'winner', 'hat-trick',
    'hat trick', 'clean sheet', 'extra time winner', 'equalizer'
  ];

  // Remove spoiler keywords from text while keeping team names
  function removeSpoilerKeywords(text) {
    let cleaned = text;
    for (const keyword of keywordsToRemove) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      cleaned = cleaned.replace(regex, '');
    }
    // Clean up extra whitespace and punctuation
    cleaned = cleaned.replace(/\s+/g, ' ').replace(/\s*[,;]\s*$/, '').trim();
    return cleaned;
  }

  // Get placeholder image URL
  function getPlaceholderUrl() {
    return chrome.runtime.getURL('assets/placeholder.svg');
  }

  // Check if text contains spoiler content
  function containsSpoiler(text) {
    if (!text) return false;
    const lowerText = text.toLowerCase();

    // Check for score patterns
    for (const pattern of scorePatterns) {
      pattern.lastIndex = 0; // Reset regex state
      if (pattern.test(text)) {
        return true;
      }
    }

    // Check for spoiler keywords
    for (const keyword of spoilerKeywords) {
      if (lowerText.includes(keyword)) {
        return true;
      }
    }

    return false;
  }

  // Replace score text with blocked indicator while preserving team names
  function maskScoreText(text) {
    let masked = text;

    // First, handle "Team1 2-1 Team2" pattern - preserve team names
    const teamScorePattern = /\b([A-Z][a-zA-Z\s]+)\s+(\d{1,2})\s*[-–—:]\s*(\d{1,2})\s+([A-Z][a-zA-Z\s]+)\b/g;
    masked = masked.replace(teamScorePattern, '$1 [SCORE HIDDEN] $4');

    // Handle standalone scores: 2-1, 2 : 1, etc.
    const simpleScorePattern = /\b(\d{1,2})\s*[-–—:]\s*(\d{1,2})\b/g;
    masked = masked.replace(simpleScorePattern, '[SCORE HIDDEN]');

    // Handle aggregated scores: (3-2 agg), (4-3 agg)
    const aggScorePattern = /\(\s*\d{1,2}\s*[-–—:]\s*\d{1,2}\s*(agg|aggregate)?\s*\)/gi;
    masked = masked.replace(aggScorePattern, '');

    // Handle FT/HT scores: FT 2-1, HT: 1-0
    const ftHtPattern = /\b(FT|HT|Full[\s-]?Time|Half[\s-]?Time)\s*:?\s*\d{1,2}\s*[-–—:]\s*\d{1,2}\b/gi;
    masked = masked.replace(ftHtPattern, '');

    // Handle penalty shootouts: (4-3 pens), (pens: 5-4)
    const penPattern1 = /\(\s*(pens?|penalties)\s*:?\s*\d{1,2}\s*[-–—:]\s*\d{1,2}\s*\)/gi;
    const penPattern2 = /\(\s*\d{1,2}\s*[-–—:]\s*\d{1,2}\s*(pens?|penalties)\s*\)/gi;
    masked = masked.replace(penPattern1, '');
    masked = masked.replace(penPattern2, '');

    // Clean up extra whitespace
    masked = masked.replace(/\s+/g, ' ').trim();

    return masked;
  }

  // Process text nodes for score masking
  function processTextNode(node) {
    if (processedElements.has(node)) return;

    const originalText = node.textContent;
    if (containsSpoiler(originalText)) {
      const maskedText = maskScoreText(originalText);
      if (maskedText !== originalText) {
        node.textContent = maskedText;
        processedElements.add(node);
      }
    }
  }

  // Process element for image replacement and hover blocking
  function processElement(element) {
    if (processedElements.has(element)) return;

    // Handle images
    if (element.tagName === 'IMG') {
      processImage(element);
    }

    // Handle elements with background images
    const computedStyle = window.getComputedStyle(element);
    if (computedStyle.backgroundImage && computedStyle.backgroundImage !== 'none') {
      processBackgroundImage(element);
    }

    // Block hover effects - mask scores in title while keeping team names
    if (element.hasAttribute('title')) {
      const title = element.getAttribute('title');
      if (containsSpoiler(title)) {
        element.dataset.originalTitle = title;
        const maskedTitle = maskScoreText(title);
        // Remove spoiler keywords but keep the rest
        const cleanedTitle = removeSpoilerKeywords(maskedTitle);
        element.setAttribute('title', cleanedTitle);
        element.classList.add('spoiler-blocked');
        processedElements.add(element);
      }
    }

    // Check data attributes for spoilers - mask instead of hide
    for (const attr of element.attributes) {
      if (attr.name.startsWith('data-') && containsSpoiler(attr.value)) {
        element.dataset[`original_${attr.name}`] = attr.value;
        element.setAttribute(attr.name, maskScoreText(attr.value));
      }
    }

    // Check aria-label - mask score while keeping team names
    if (element.hasAttribute('aria-label')) {
      const ariaLabel = element.getAttribute('aria-label');
      if (containsSpoiler(ariaLabel)) {
        element.dataset.originalAriaLabel = ariaLabel;
        const maskedLabel = maskScoreText(ariaLabel);
        const cleanedLabel = removeSpoilerKeywords(maskedLabel);
        element.setAttribute('aria-label', cleanedLabel);
        processedElements.add(element);
      }
    }
  }

  // Process image element
  function processImage(img) {
    if (processedElements.has(img)) return;

    // Skip if already processed
    if (img.classList.contains('spoiler-image-blocked')) return;
    if (img.src && img.src.includes('placeholder')) return;

    // Skip images without a real src yet (lazy loading placeholder)
    if (!img.src || img.src === '' || img.src === 'about:blank') return;

    // Check if image is a thumbnail or match-related
    const isMatchImage = isLikelyMatchImage(img);

    if (isMatchImage) {
      // Store original source
      img.dataset.originalSrc = img.src;
      img.dataset.originalSrcset = img.srcset || '';

      // Add class for styling (makes image invisible via CSS)
      img.classList.add('spoiler-image-blocked');

      // Create placeholder overlay that can't be overwritten by site JS
      createPlaceholderOverlay(img);

      processedElements.add(img);
    }
  }

  // Extract team names from text (e.g., "Match Re-Run: Arsenal 2-1 Chelsea" -> "Arsenal vs Chelsea")
  function extractTeamNames(text) {
    if (!text) return null;

    // Try to match "Team1 X-X Team2" pattern
    const scorePattern = /([A-Z][a-zA-Z\s]+?)\s+\d{1,2}\s*[-–—:]\s*\d{1,2}\s+([A-Z][a-zA-Z\s]+)/i;
    const match = text.match(scorePattern);
    if (match) {
      return `${match[1].trim()} vs ${match[2].trim()}`;
    }

    // Try to match "Team1 v Team2" or "Team1 vs Team2"
    const vsPattern = /([A-Z][a-zA-Z\s]+?)\s+(?:vs?\.?|versus)\s+([A-Z][a-zA-Z\s]+)/i;
    const vsMatch = text.match(vsPattern);
    if (vsMatch) {
      return `${vsMatch[1].trim()} vs ${vsMatch[2].trim()}`;
    }

    return null;
  }

  // Create a placeholder overlay element for the image
  function createPlaceholderOverlay(img) {
    // Check if overlay already exists
    if (img.nextElementSibling?.classList.contains('spoiler-placeholder-overlay')) return;

    // Extract team names from alt text or nearby text
    const altText = img.alt || '';
    const teamNames = extractTeamNames(altText);

    // Create overlay div
    const overlay = document.createElement('div');
    overlay.className = 'spoiler-placeholder-overlay';
    overlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: #1a472a url("${getPlaceholderUrl()}") center/contain no-repeat;
      z-index: 10;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    `;

    // Add team names label if available
    if (teamNames) {
      const teamLabel = document.createElement('div');
      teamLabel.className = 'spoiler-team-label';
      teamLabel.textContent = teamNames;
      teamLabel.style.cssText = `
        position: absolute;
        bottom: 10px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 4px 12px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
        white-space: nowrap;
        max-width: 90%;
        overflow: hidden;
        text-overflow: ellipsis;
      `;
      overlay.appendChild(teamLabel);
    }

    // Make sure parent is positioned
    const parent = img.parentElement;
    if (parent) {
      const parentPosition = window.getComputedStyle(parent).position;
      if (parentPosition === 'static') {
        parent.style.position = 'relative';
      }

      // Insert overlay after image
      img.insertAdjacentElement('afterend', overlay);
    }
  }

  // Check if element is in viewport
  function isElementInViewport(el) {
    const rect = el.getBoundingClientRect();
    return (
      rect.top < (window.innerHeight || document.documentElement.clientHeight) + 100 &&
      rect.bottom > -100 &&
      rect.left < (window.innerWidth || document.documentElement.clientWidth) + 100 &&
      rect.right > -100
    );
  }

  // Check if image should be EXCLUDED (logos, headers, etc.)
  function shouldExcludeImage(img) {
    const src = (img.src || '').toLowerCase();
    const alt = (img.alt || '').toLowerCase();
    const className = (img.className || '').toLowerCase();
    const id = (img.id || '').toLowerCase();

    // Check for logo indicators
    if (src.includes('logo') || alt.includes('logo') ||
        className.includes('logo') || id.includes('logo')) {
      return true;
    }

    // Check for brand/site identity images
    if (src.includes('brand') || alt.includes('brand') ||
        className.includes('brand') || src.includes('icon')) {
      return true;
    }

    // Check if inside header, nav, or footer
    const excludeContainers = ['header', 'nav', 'footer', '[role="banner"]', '[role="navigation"]'];
    for (const selector of excludeContainers) {
      try {
        if (img.closest(selector)) return true;
      } catch (e) {
        // Invalid selector, skip
      }
    }

    // Check for header/navbar class patterns
    const parent = img.parentElement;
    if (parent) {
      const parentClass = (parent.className || '').toLowerCase();
      const parentId = (parent.id || '').toLowerCase();
      if (parentClass.includes('header') || parentClass.includes('navbar') ||
          parentClass.includes('nav-') || parentClass.includes('logo') ||
          parentId.includes('header') || parentId.includes('nav')) {
        return true;
      }
    }

    return false;
  }

  // Check if image is likely a match thumbnail
  // v1.2: Fixed with exclusions, IntersectionObserver support, and tightened selectors
  function isLikelyMatchImage(img) {
    // FIRST: Check exclusions - logos, headers, etc. should never be blocked
    if (shouldExcludeImage(img)) {
      return false;
    }

    const src = (img.src || img.dataset.src || '').toLowerCase();
    const alt = (img.alt || '');
    const className = (img.className || '').toLowerCase();

    // 1. Check URL patterns (most reliable for uefa.tv)
    const matchUrlPatterns = [
      'vod-images.onvesper.com',
      'content-images.onvesper.com',
      '/vod/',
      '/video/',
    ];
    for (const pattern of matchUrlPatterns) {
      if (src.includes(pattern)) return true;
    }

    // 2. Check if inside a match card container (specific selectors only)
    const matchContainerSelectors = [
      '.regular-card',           // uefa.tv specific
      '.card-base',              // uefa.tv specific
      '[class*="card-wrapper"]', // card wrappers
      '[class*="video-card"]',   // video cards
      '[class*="replay-card"]',  // replay cards
      '[class*="vod-card"]',     // vod cards
      '.thumbnail-container',    // thumbnail containers
      '[class*="catalog-card"]', // catalog cards
      '[class*="content-card"]', // content cards
    ];
    for (const selector of matchContainerSelectors) {
      try {
        if (img.closest(selector)) return true;
      } catch (e) {
        // Invalid selector, skip
      }
    }

    // 3. Check alt text for match-related patterns
    const matchAltPatterns = [
      /match\s*re-?run/i,
      /re-?run:/i,
      /final:/i,
      /\d+\s*[-–:]\s*\d+/,  // Score pattern like "3-2"
    ];
    for (const pattern of matchAltPatterns) {
      if (pattern.test(alt)) return true;
    }

    // 4. Check class names for specific match-related keywords
    const matchClassKeywords = [
      'title-image',
      'card-image',
      'vod-image',
      'video-thumbnail',
      'match-thumbnail',
      'replay-thumbnail',
    ];
    for (const keyword of matchClassKeywords) {
      if (className.includes(keyword)) return true;
    }

    // 5. Check for spoiler content in alt text only (not parent text - too broad)
    if (containsSpoiler(alt)) return true;

    return false;
  }

  // Process background images
  function processBackgroundImage(element) {
    if (processedElements.has(element)) return;

    const bgImage = window.getComputedStyle(element).backgroundImage;
    if (bgImage && bgImage !== 'none' && isLikelyMatchContainer(element)) {
      element.dataset.originalBg = bgImage;
      element.style.backgroundImage = `url("${getPlaceholderUrl()}")`;
      element.style.backgroundSize = 'cover';
      element.style.backgroundPosition = 'center';
      element.classList.add('spoiler-bg-blocked');
      processedElements.add(element);
    }
  }

  // Check if element is likely a match container
  function isLikelyMatchContainer(element) {
    const className = (element.className || '').toLowerCase();
    const id = (element.id || '').toLowerCase();

    // Exclude header/nav/footer
    if (element.closest('header, nav, footer')) return false;

    const matchKeywords = ['card', 'thumbnail', 'vod', 'video', 'replay'];

    for (const keyword of matchKeywords) {
      if (className.includes(keyword) || id.includes(keyword)) {
        return true;
      }
    }

    return false;
  }

  // Walk DOM tree and process all elements
  function processDOM(root = document.body) {
    if (!root || !isEnabled) return;

    // Process all elements
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      null,
      false
    );

    const elementsToProcess = [];
    const textNodesToProcess = [];

    let node;
    while (node = walker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) {
        textNodesToProcess.push(node);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        elementsToProcess.push(node);
      }
    }

    // Process text nodes
    textNodesToProcess.forEach(processTextNode);

    // Process elements
    elementsToProcess.forEach(processElement);
  }

  // Scan all unblocked images (for periodic rescan and scroll handling)
  function scanUnblockedImages() {
    if (!isEnabled) return;

    document.querySelectorAll('img:not(.spoiler-image-blocked)').forEach(img => {
      if (img.src && !img.src.includes('placeholder') && isElementInViewport(img)) {
        processImage(img);
      }
    });
  }

  // Restore original content
  function restoreDOM() {
    // Remove placeholder overlays
    document.querySelectorAll('.spoiler-placeholder-overlay').forEach(overlay => {
      overlay.remove();
    });

    // Restore images
    document.querySelectorAll('.spoiler-image-blocked').forEach(img => {
      if (img.dataset.originalSrc) {
        img.src = img.dataset.originalSrc;
        delete img.dataset.originalSrc;
      }
      if (img.dataset.originalSrcset) {
        img.srcset = img.dataset.originalSrcset;
        delete img.dataset.originalSrcset;
      }
      img.classList.remove('spoiler-image-blocked');
    });

    // Restore background images
    document.querySelectorAll('.spoiler-bg-blocked').forEach(el => {
      if (el.dataset.originalBg) {
        el.style.backgroundImage = el.dataset.originalBg;
        delete el.dataset.originalBg;
      }
      el.classList.remove('spoiler-bg-blocked');
    });

    // Restore titles and aria-labels
    document.querySelectorAll('[data-original-title]').forEach(el => {
      el.setAttribute('title', el.dataset.originalTitle);
      delete el.dataset.originalTitle;
      el.classList.remove('spoiler-blocked');
    });

    document.querySelectorAll('[data-original-aria-label]').forEach(el => {
      el.setAttribute('aria-label', el.dataset.originalAriaLabel);
      delete el.dataset.originalAriaLabel;
    });

    document.querySelectorAll('.spoiler-blocked').forEach(el => {
      el.classList.remove('spoiler-blocked');
    });

    // Note: Text replacements require page reload to restore
  }

  // Set up IntersectionObserver for lazy-loaded images
  function setupImageObserver() {
    if (imageObserver) {
      imageObserver.disconnect();
    }

    imageObserver = new IntersectionObserver((entries) => {
      if (!isEnabled) return;

      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          // Wait a bit for lazy loading to complete
          setTimeout(() => {
            if (img.src && !img.src.includes('placeholder') && !img.classList.contains('spoiler-image-blocked')) {
              processImage(img);
            }
          }, 100);
        }
      });
    }, {
      rootMargin: '100px',
      threshold: 0.1
    });

    // Observe all existing images
    document.querySelectorAll('img').forEach(img => {
      imageObserver.observe(img);
    });
  }

  // Set up scroll listener for carousels
  function setupScrollListener() {
    // Handle both regular scroll and horizontal carousel scroll
    const scrollHandler = () => {
      if (!isEnabled) return;

      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        scanUnblockedImages();
      }, 150);
    };

    // Listen on document for vertical scroll
    document.addEventListener('scroll', scrollHandler, { passive: true });

    // Listen on window for horizontal scrolls
    window.addEventListener('scroll', scrollHandler, { passive: true });

    // Also listen for scroll events on scrollable containers (carousels)
    document.querySelectorAll('[class*="carousel"], [class*="slider"], [class*="scroll"]').forEach(el => {
      el.addEventListener('scroll', scrollHandler, { passive: true });
    });
  }

  // Set up periodic rescan for first 10 seconds
  function setupPeriodicRescan() {
    if (rescanInterval) {
      clearInterval(rescanInterval);
    }

    let scanCount = 0;
    rescanInterval = setInterval(() => {
      if (!isEnabled || scanCount++ >= 5) {
        clearInterval(rescanInterval);
        rescanInterval = null;
        return;
      }
      scanUnblockedImages();
    }, 2000);
  }

  // Set up MutationObserver for dynamic content
  function setupObserver() {
    if (observer) {
      observer.disconnect();
    }

    observer = new MutationObserver((mutations) => {
      if (!isEnabled) return;

      for (const mutation of mutations) {
        // Process added nodes
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            processElement(node);
            processDOM(node);

            // If new images are added, observe them
            if (node.tagName === 'IMG' && imageObserver) {
              imageObserver.observe(node);
            }
            node.querySelectorAll?.('img').forEach(img => {
              if (imageObserver) imageObserver.observe(img);
            });
          } else if (node.nodeType === Node.TEXT_NODE) {
            processTextNode(node);
          }
        }

        // Process attribute changes (especially src changes from lazy loading)
        if (mutation.type === 'attributes' && mutation.target.nodeType === Node.ELEMENT_NODE) {
          const target = mutation.target;

          // If src changed, re-process the image
          if (mutation.attributeName === 'src' && target.tagName === 'IMG') {
            // Remove from processed set to allow re-processing
            processedElements.delete(target);
            setTimeout(() => processImage(target), 50);
          } else {
            processElement(target);
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['title', 'src', 'srcset', 'data-src', 'aria-label', 'class']
    });
  }

  // Initialize all observers and handlers
  function setupAllObservers() {
    setupObserver();
    setupImageObserver();
    setupScrollListener();
    setupPeriodicRescan();
  }

  // Cleanup all observers
  function cleanupObservers() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (imageObserver) {
      imageObserver.disconnect();
      imageObserver = null;
    }
    if (rescanInterval) {
      clearInterval(rescanInterval);
      rescanInterval = null;
    }
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
      scrollTimeout = null;
    }
  }

  // Initialize extension
  async function initialize() {
    currentHostname = window.location.hostname.replace(/^www\./, '');

    // Check if this site is enabled
    const result = await chrome.storage.sync.get(['sites', 'enabledSites']);
    const sites = result.sites || [];
    const enabledSites = result.enabledSites || {};

    const isInList = sites.some(site =>
      currentHostname.includes(site) || site.includes(currentHostname)
    );

    isEnabled = isInList && enabledSites[currentHostname] !== false;

    if (isEnabled) {
      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          processDOM();
          setupAllObservers();
        });
      } else {
        processDOM();
        setupAllObservers();
      }
    }
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'toggleSpoilerBlock') {
      isEnabled = message.enabled;

      if (isEnabled) {
        processDOM();
        setupAllObservers();
      } else {
        cleanupObservers();
        restoreDOM();
      }

      sendResponse({ success: true });
    }

    if (message.action === 'getStatus') {
      sendResponse({ enabled: isEnabled, hostname: currentHostname });
    }

    return true;
  });

  // Initialize
  initialize();
})();
