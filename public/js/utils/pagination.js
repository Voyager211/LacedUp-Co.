window.renderPagination = function (container, currentPage, totalPages, onClick) {
  if (!container || totalPages <= 1) return;

  let html = '';

  html += `
    <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
      <a class="page-link" href="#" data-page="${currentPage - 1}">Previous</a>
    </li>
  `;

  for (let i = 1; i <= totalPages; i++) {
    html += `
      <li class="page-item ${i === currentPage ? 'active' : ''}">
        <a class="page-link" href="#" data-page="${i}">${i}</a>
      </li>
    `;
  }

  html += `
    <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
      <a class="page-link" href="#" data-page="${currentPage + 1}">Next</a>
    </li>
  `;

  container.innerHTML = html;

  container.querySelectorAll('.page-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const page = parseInt(link.dataset.page);
      if (!isNaN(page) && page >= 1 && page <= totalPages && page !== currentPage) {
        onClick(page);
      }
    });
  });
};
