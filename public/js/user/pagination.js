/**
 * ========= PAGINATION COMPONENT JAVASCRIPT =========
 * Handles pagination interactions and callbacks
 */

document.addEventListener('DOMContentLoaded', function() {
  initializePagination();
});

function initializePagination() {
  // Handle pagination click events
  document.addEventListener('click', function (e) {
    const target = e.target.closest('.page-link');
    if (!target || !target.dataset.page || target.classList.contains('disabled-btn') || target.getAttribute('aria-disabled') === 'true') return;

    e.preventDefault();
    const page = parseInt(target.dataset.page);

    // Get pagination container to extract total pages
    const paginationContainer = target.closest('.pagination');
    const totalPages = paginationContainer ? paginationContainer.dataset.totalPages : null;

    // Validate page number
    if (isNaN(page) || page < 1 || (totalPages && page > parseInt(totalPages))) return;

    // Visual feedback - add loading state to clicked button
    addLoadingState(target);

    // Call the appropriate callback function
    if (typeof window.fetchCallback === 'function') {
      window.fetchCallback(page);
    } else if (typeof window.paginationCallback === 'function') {
      window.paginationCallback(page);
    } else {
      console.warn('No pagination callback function found');
      removeLoadingState(target);
    }
  });

  // Handle keyboard navigation
  document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Find current pagination on the page
    const activePagination = document.querySelector('.pagination .page-item.active');
    if (!activePagination) return;

    const currentPage = parseInt(activePagination.querySelector('.page-link').dataset.page);
    const paginationContainer = activePagination.closest('.pagination');
    const totalPages = paginationContainer ? parseInt(paginationContainer.dataset.totalPages) : null;

    if (!totalPages) return;

    let newPage = null;

    if (e.key === 'ArrowLeft' && currentPage > 1) {
      e.preventDefault();
      newPage = currentPage - 1;
    } else if (e.key === 'ArrowRight' && currentPage < totalPages) {
      e.preventDefault();
      newPage = currentPage + 1;
    }

    if (newPage) {
      if (typeof window.fetchCallback === 'function') {
        window.fetchCallback(newPage);
      } else if (typeof window.paginationCallback === 'function') {
        window.paginationCallback(newPage);
      }
    }
  });
}

/**
 * Add loading state to pagination button
 */
function addLoadingState(button) {
  const originalContent = button.innerHTML;
  button.dataset.originalContent = originalContent;
  button.innerHTML = '<i class="bi bi-arrow-clockwise" style="animation: spin 1s linear infinite;"></i>';
  button.style.pointerEvents = 'none';
}

/**
 * Remove loading state from pagination button
 */
function removeLoadingState(button) {
  if (button.dataset.originalContent) {
    button.innerHTML = button.dataset.originalContent;
    delete button.dataset.originalContent;
    button.style.pointerEvents = '';
  }
}

/**
 * Update pagination after AJAX call
 */
function updatePaginationState(currentPage, totalPages) {
  const paginationContainer = document.querySelector('.pagination');
  if (!paginationContainer) return;

  // Update data attribute
  paginationContainer.dataset.totalPages = totalPages;

  // Remove loading states from all buttons
  const buttons = paginationContainer.querySelectorAll('.page-link[data-original-content]');
  buttons.forEach(removeLoadingState);

  // Update active states
  const pageItems = paginationContainer.querySelectorAll('.page-item');
  pageItems.forEach((item, index) => {
    const link = item.querySelector('.page-link');
    const page = parseInt(link.dataset.page);
    
    if (page === currentPage) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Update disabled states
  const prevButton = paginationContainer.querySelector('.page-link[data-page="' + (currentPage - 1) + '"]');
  const nextButton = paginationContainer.querySelector('.page-link[data-page="' + (currentPage + 1) + '"]');

  if (prevButton) {
    const prevItem = prevButton.closest('.page-item');
    if (currentPage === 1) {
      prevItem.classList.add('disabled');
      prevButton.classList.add('disabled-btn');
      prevButton.setAttribute('aria-disabled', 'true');
    } else {
      prevItem.classList.remove('disabled');
      prevButton.classList.remove('disabled-btn');
      prevButton.removeAttribute('aria-disabled');
    }
  }

  if (nextButton) {
    const nextItem = nextButton.closest('.page-item');
    if (currentPage === totalPages) {
      nextItem.classList.add('disabled');
      nextButton.classList.add('disabled-btn');
      nextButton.setAttribute('aria-disabled', 'true');
    } else {
      nextItem.classList.remove('disabled');
      nextButton.classList.remove('disabled-btn');
      nextButton.removeAttribute('aria-disabled');
    }
  }
}

// CSS animation for loading spinner
const style = document.createElement('style');
style.textContent = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);

// Export functions for global use
window.PaginationUtils = {
  updateState: updatePaginationState,
  addLoading: addLoadingState,
  removeLoading: removeLoadingState
};
