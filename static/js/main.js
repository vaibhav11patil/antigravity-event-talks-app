// State Management
let allReleaseNotes = []; // Stores all release groups parsed from feed
let filteredReleaseNotes = []; // Stores currently active/filtered release groups
let selectedUpdates = new Set(); // Stores unique IDs of selected updates
const LIMIT_CHARACTERS = 280;

// DOM Elements
const btnRefresh = document.getElementById('btn-refresh');
const btnExportCSV = document.getElementById('btn-export-csv');
const btnThemeToggle = document.getElementById('btn-theme-toggle');
const searchInput = document.getElementById('search-input');
const checkboxes = document.querySelectorAll('.chip-checkbox input');
const feedLoading = document.getElementById('feed-loading');
const feedError = document.getElementById('feed-error');
const feedEmpty = document.getElementById('feed-empty');
const feedList = document.getElementById('feed-list');
const errorMessage = document.getElementById('error-message');
const btnRetry = document.getElementById('btn-retry');

// Selection Bar Elements
const selectionBar = document.getElementById('selection-bar');
const selectedCount = document.getElementById('selected-count');
const btnClearSelection = document.getElementById('btn-clear-selection');
const btnTweetSelected = document.getElementById('btn-tweet-selected');

// Composer Modal Elements
const composerModal = document.getElementById('composer-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const tweetTextarea = document.getElementById('tweet-textarea');
const charCounter = document.getElementById('char-counter');
const btnPublishTweet = document.getElementById('btn-publish-tweet');
const progressCircle = document.querySelector('.progress-ring__circle');

// Progress Circle Circumference Setup
const circleRadius = 12;
const circleCircumference = 2 * Math.PI * circleRadius;
if (progressCircle) {
  progressCircle.style.strokeDasharray = `${circleCircumference} ${circleCircumference}`;
  progressCircle.style.strokeDashoffset = circleCircumference;
}

// Initial Setup & Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  fetchReleaseNotes();
  
  // Theme Toggle Setup
  if (btnThemeToggle) {
    btnThemeToggle.addEventListener('click', toggleTheme);
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      enableLightTheme();
    }
  }
  
  // Refresh and Export events
  btnRefresh.addEventListener('click', () => fetchReleaseNotes(true));
  btnRetry.addEventListener('click', () => fetchReleaseNotes(true));
  if (btnExportCSV) btnExportCSV.addEventListener('click', exportToCSV);
  
  // Filter events
  searchInput.addEventListener('input', applyFilters);
  checkboxes.forEach(cb => cb.addEventListener('change', applyFilters));
  
  // Selection bar events
  btnClearSelection.addEventListener('click', clearAllSelections);
  btnTweetSelected.addEventListener('click', openComposerForSelected);
  
  // Modal events
  btnCloseModal.addEventListener('click', hideModal);
  composerModal.addEventListener('click', (e) => {
    if (e.target === composerModal) hideModal();
  });
  tweetTextarea.addEventListener('input', updateCharCounter);
  btnPublishTweet.addEventListener('click', publishTweet);
});

// Toast System
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '⚠️';
  
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);
  
  // Auto remove after 3.5s
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Fetch Data from Flask API
async function fetchReleaseNotes(forceRefresh = false) {
  setLoadingState(true);
  
  try {
    const url = forceRefresh ? '/api/release-notes?refresh=true' : '/api/release-notes';
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.status === 'error') {
      throw new Error(result.message);
    }
    
    allReleaseNotes = result.data || [];
    filteredReleaseNotes = allReleaseNotes;
    
    if (result.status === 'warning') {
      showToast(result.message, 'error');
    } else if (forceRefresh) {
      showToast('Release notes updated successfully!', 'success');
    }
    
    // Process unique ids for updates inside dates
    let idCounter = 0;
    allReleaseNotes.forEach(group => {
      group.updates.forEach(update => {
        update.id = `up-${idCounter++}`;
        update.date = group.date;
        update.link = group.link;
      });
    });
    
    // Clear old selections
    clearAllSelections();
    
    // Render list
    renderFeed();
    
  } catch (error) {
    console.error('Fetch error:', error);
    errorMessage.textContent = error.message || 'An error occurred while communicating with the server.';
    showState('error');
  } finally {
    setLoadingState(false);
  }
}

// UI State Switcher
function showState(state) {
  feedLoading.classList.add('hidden');
  feedError.classList.add('hidden');
  feedEmpty.classList.add('hidden');
  feedList.classList.add('hidden');
  
  if (state === 'loading') {
    feedLoading.classList.remove('hidden');
  } else if (state === 'error') {
    feedError.classList.remove('hidden');
  } else if (state === 'empty') {
    feedEmpty.classList.remove('hidden');
  } else if (state === 'success') {
    feedList.classList.remove('hidden');
  }
}

function setLoadingState(isLoading) {
  if (isLoading) {
    btnRefresh.classList.add('loading');
    btnRefresh.disabled = true;
    showState('loading');
  } else {
    btnRefresh.classList.remove('loading');
    btnRefresh.disabled = false;
  }
}

// Render Feed List
function renderFeed(filteredNotes = allReleaseNotes) {
  feedList.innerHTML = '';
  
  // Filter out dates that have no matching updates
  const activeGroups = filteredNotes.filter(group => group.updates.length > 0);
  
  if (activeGroups.length === 0) {
    showState('empty');
    return;
  }
  
  activeGroups.forEach(group => {
    const groupElement = document.createElement('section');
    groupElement.className = 'release-date-group';
    groupElement.setAttribute('aria-label', `Updates for ${group.date}`);
    
    // Date Header
    const headerHtml = `
      <div class="date-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
        <span>${group.date}</span>
        <a href="${group.link}" target="_blank" rel="noopener" class="date-link">View Official Notes &rarr;</a>
      </div>
    `;
    
    groupElement.innerHTML = headerHtml;
    
    // Render individual update cards
    group.updates.forEach(update => {
      const isSelected = selectedUpdates.has(update.id);
      const cardType = (update.type || 'Update').toLowerCase();
      
      const card = document.createElement('div');
      card.className = `update-card card-${cardType} ${isSelected ? 'selected' : ''}`;
      card.dataset.id = update.id;
      
      const cardInner = `
        <div class="card-checkbox-wrapper">
          <label class="custom-checkbox" aria-label="Select update for tweeting">
            <input type="checkbox" data-id="${update.id}" ${isSelected ? 'checked' : ''}>
            <span class="checkmark"></span>
          </label>
        </div>
        <div class="card-body">
          <div class="card-header-row">
            <span class="card-badge badge-${cardType}">${update.type || 'Update'}</span>
          </div>
          <div class="card-html-content">${update.content}</div>
          <div class="card-actions">
            <button class="btn-card-action btn-tweet-card" data-id="${update.id}">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              Tweet
            </button>
            <button class="btn-card-action btn-copy-text-card" data-id="${update.id}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Copy Text
            </button>
            <button class="btn-card-action btn-copy-card" data-id="${update.id}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
              </svg>
              Copy Link
            </button>
          </div>
        </div>
      `;
      
      card.innerHTML = cardInner;
      groupElement.appendChild(card);
      
      // Wire up card interactions
      const checkbox = card.querySelector('input[type="checkbox"]');
      checkbox.addEventListener('change', (e) => toggleSelectUpdate(update.id, e.target.checked));
      
      // Prevent label/checkbox triggering issues when clicking elements
      card.querySelector('.btn-tweet-card').addEventListener('click', (e) => {
        e.stopPropagation();
        openComposerForSingle(update);
      });
      
      card.querySelector('.btn-copy-text-card').addEventListener('click', (e) => {
        e.stopPropagation();
        copyUpdateText(update);
      });
      
      card.querySelector('.btn-copy-card').addEventListener('click', (e) => {
        e.stopPropagation();
        copyUpdateLink(update);
      });
    });
    
    feedList.appendChild(groupElement);
  });
  
  showState('success');
}

// Filtering Logic
function applyFilters() {
  const query = searchInput.value.toLowerCase().trim();
  const checkedTypes = Array.from(checkboxes)
    .filter(cb => cb.checked)
    .map(cb => cb.value.toLowerCase());
    
  // Filter local data structure
  const filtered = allReleaseNotes.map(group => {
    const matchedUpdates = group.updates.filter(update => {
      // Type matching
      const typeMatches = checkedTypes.includes((update.type || 'Update').toLowerCase());
      if (!typeMatches) return false;
      
      // Search text matching
      if (query) {
        const textContent = stripHtml(update.content).toLowerCase();
        const typeContent = (update.type || '').toLowerCase();
        return textContent.includes(query) || typeContent.includes(query);
      }
      
      return true;
    });
    
    return {
      ...group,
      updates: matchedUpdates
    };
  });
  
  filteredReleaseNotes = filtered;
  renderFeed(filtered);
}

// Toggle Selection of Update
function toggleSelectUpdate(id, isChecked) {
  const card = document.querySelector(`.update-card[data-id="${id}"]`);
  const checkbox = card.querySelector('input[type="checkbox"]');
  
  if (isChecked) {
    selectedUpdates.add(id);
    if (card) card.classList.add('selected');
    if (checkbox) checkbox.checked = true;
  } else {
    selectedUpdates.delete(id);
    if (card) card.classList.remove('selected');
    if (checkbox) checkbox.checked = false;
  }
  
  updateSelectionBar();
}

// Update Bottom Floating Selection Bar
function updateSelectionBar() {
  const count = selectedUpdates.size;
  selectedCount.textContent = count;
  
  if (count > 0) {
    selectionBar.classList.add('active');
    selectionBar.classList.remove('hidden');
  } else {
    selectionBar.classList.remove('active');
    setTimeout(() => {
      if (selectedUpdates.size === 0) selectionBar.classList.add('hidden');
    }, 400);
  }
}

// Clear All Selection
function clearAllSelections() {
  selectedUpdates.clear();
  document.querySelectorAll('.update-card').forEach(card => card.classList.remove('selected'));
  document.querySelectorAll('.custom-checkbox input').forEach(cb => cb.checked = false);
  updateSelectionBar();
}

// Copy Direct Link to Clipboard
function copyUpdateLink(update) {
  const directLink = `${update.link}`;
  
  if (navigator.clipboard) {
    navigator.clipboard.writeText(directLink)
      .then(() => showToast('Link copied to clipboard!', 'success'))
      .catch(err => {
        console.error('Clipboard write error', err);
        fallbackCopyText(directLink, 'Link copied to clipboard!');
      });
  } else {
    fallbackCopyText(directLink, 'Link copied to clipboard!');
  }
}

function fallbackCopyText(text, successMessage = 'Link copied to clipboard!') {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";  // Avoid scrolling to bottom
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
    showToast(successMessage, 'success');
  } catch (err) {
    showToast('Failed to copy text.', 'error');
  }
  document.body.removeChild(textArea);
}

// Find update by ID helper
function findUpdateById(id) {
  for (const group of allReleaseNotes) {
    const update = group.updates.find(u => u.id === id);
    if (update) return update;
  }
  return null;
}

// Open Composer for Single Update
function openComposerForSingle(update) {
  const plainText = stripHtml(update.content);
  const prefix = `BigQuery ${update.type} (${update.date}): `;
  const linkText = `\nRelease Note: ${update.link}`;
  const hashtags = " #BigQuery #GoogleCloud";
  
  // Pre-calculate lengths to fit in 280
  const maxContentLen = LIMIT_CHARACTERS - prefix.length - linkText.length - hashtags.length;
  let summary = plainText;
  if (summary.length > maxContentLen) {
    summary = summary.substring(0, maxContentLen - 3) + "...";
  }
  
  const tweetText = `${prefix}${summary}${linkText}${hashtags}`;
  showModal(tweetText);
}

// Open Composer for Multiple Selected Updates
function openComposerForSelected() {
  if (selectedUpdates.size === 0) return;
  
  const selectedList = Array.from(selectedUpdates).map(id => findUpdateById(id)).filter(Boolean);
  
  let tweetText = "";
  if (selectedList.length === 1) {
    openComposerForSingle(selectedList[0]);
    return;
  }
  
  // Aggregate multiple updates
  const header = `🚀 BigQuery Updates (${selectedList.length} new items):\n`;
  const hashtags = " #BigQuery #GoogleCloud";
  
  // Generate brief bullet points
  let bullets = "";
  selectedList.forEach(update => {
    const plain = stripHtml(update.content);
    const title = plain.split('.')[0]; // grab first sentence
    bullets += `\n• [${update.type}] ${title}`;
  });
  
  // Truncate bullet notes if it exceeds limits
  const maxBulletsLen = LIMIT_CHARACTERS - header.length - hashtags.length - 20; // 20 buffer for links/ellipses
  
  if (bullets.length > maxBulletsLen) {
    bullets = bullets.substring(0, maxBulletsLen - 3) + "...";
  }
  
  const finalLink = selectedList[0].link.split('#')[0]; // root release notes URL
  tweetText = `${header}${bullets}\n\nDocs: ${finalLink}${hashtags}`;
  showModal(tweetText);
}

// Show/Hide Composer Modal
function showModal(initialText) {
  tweetTextarea.value = initialText;
  composerModal.classList.add('active');
  composerModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden'; // Lock background scroll
  updateCharCounter();
  tweetTextarea.focus();
}

function hideModal() {
  composerModal.classList.remove('active');
  setTimeout(() => {
    composerModal.classList.add('hidden');
  }, 300);
  document.body.style.overflow = ''; // Release background scroll
}

// Update Character Counter & Circular Progress
function updateCharCounter() {
  const len = tweetTextarea.value.length;
  const remaining = LIMIT_CHARACTERS - len;
  
  charCounter.textContent = remaining;
  
  // Circular Progress Offset Math
  const progress = Math.min(len / LIMIT_CHARACTERS, 1);
  const offset = circleCircumference * (1 - progress);
  if (progressCircle) {
    progressCircle.style.strokeDashoffset = offset;
    
    // Change progress circle color states
    if (remaining <= 0) {
      progressCircle.style.stroke = 'var(--color-danger)';
      charCounter.className = 'char-counter danger';
    } else if (remaining <= 20) {
      progressCircle.style.stroke = 'var(--color-warning)';
      charCounter.className = 'char-counter warning';
    } else {
      progressCircle.style.stroke = 'var(--color-accent)';
      charCounter.className = 'char-counter';
    }
  }
  
  // Disable button if text is empty or exceeds limit
  if (len === 0 || remaining < 0) {
    btnPublishTweet.disabled = true;
    btnPublishTweet.style.opacity = '0.5';
    btnPublishTweet.style.cursor = 'not-allowed';
  } else {
    btnPublishTweet.disabled = false;
    btnPublishTweet.style.opacity = '1';
    btnPublishTweet.style.cursor = 'pointer';
  }
}

// Publish Tweet via Twitter Web Intent
function publishTweet() {
  const text = tweetTextarea.value;
  if (!text || text.length > LIMIT_CHARACTERS) return;
  
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  window.open(tweetUrl, '_blank', 'noopener,noreferrer');
  
  hideModal();
  showToast('Twitter composer opened!', 'success');
}

// Utility function to strip HTML and clean whitespace
function stripHtml(html) {
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;
  
  // Clean elements like links to display as text + href if helpful, or just clean text
  let text = tempDiv.textContent || tempDiv.innerText || "";
  
  // Replace multiple spacing/newlines with single space
  return text.replace(/\s+/g, ' ').trim();
}

// Copy update details text to clipboard
function copyUpdateText(update) {
  const plainText = stripHtml(update.content);
  const textToCopy = `BigQuery ${update.type} (${update.date}):\n${plainText}\n\nOfficial Link: ${update.link}`;
  
  if (navigator.clipboard) {
    navigator.clipboard.writeText(textToCopy)
      .then(() => showToast('Update text copied to clipboard!', 'success'))
      .catch(err => {
        console.error('Clipboard copy error', err);
        fallbackCopyText(textToCopy, 'Update text copied to clipboard!');
      });
  } else {
    fallbackCopyText(textToCopy, 'Update text copied to clipboard!');
  }
}

// Export currently active/filtered release notes to CSV file
function exportToCSV() {
  const activeGroups = filteredReleaseNotes.filter(group => group.updates.length > 0);
  if (activeGroups.length === 0) {
    showToast('No release notes available to export.', 'error');
    return;
  }
  
  const headers = ['Date', 'Category', 'Update Content', 'Source Link'];
  const rows = [headers];
  
  activeGroups.forEach(group => {
    group.updates.forEach(update => {
      const cleanContent = stripHtml(update.content);
      rows.push([
        group.date,
        update.type || 'Update',
        cleanContent,
        group.link
      ]);
    });
  });
  
  // Format CSV cells with proper quoting and escaping
  const csvContent = rows.map(row => {
    return row.map(field => {
      const escaped = String(field).replace(/"/g, '""');
      return `"${escaped}"`;
    }).join(',');
  }).join('\n');
  
  // Trigger virtual file download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const dateStr = new Date().toISOString().slice(0, 10);
  
  link.setAttribute("href", url);
  link.setAttribute("download", `bigquery_release_notes_${dateStr}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showToast('CSV export downloaded!', 'success');
}

// Toggle between Dark and Light mode themes
function toggleTheme() {
  const isLight = document.body.classList.contains('light-theme');
  if (isLight) {
    enableDarkTheme();
  } else {
    enableLightTheme();
  }
}

// Enable Light theme mode
function enableLightTheme() {
  document.body.classList.add('light-theme');
  localStorage.setItem('theme', 'light');
  
  const moonIcon = document.querySelector('.icon-moon');
  const sunIcon = document.querySelector('.icon-sun');
  if (moonIcon) moonIcon.classList.remove('hidden');
  if (sunIcon) sunIcon.classList.add('hidden');
}

// Enable Dark theme mode
function enableDarkTheme() {
  document.body.classList.remove('light-theme');
  localStorage.setItem('theme', 'dark');
  
  const moonIcon = document.querySelector('.icon-moon');
  const sunIcon = document.querySelector('.icon-sun');
  if (moonIcon) moonIcon.classList.add('hidden');
  if (sunIcon) sunIcon.classList.remove('hidden');
}
