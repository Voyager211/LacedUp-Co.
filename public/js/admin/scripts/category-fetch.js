// Add Category
  document.querySelector('#addCategoryModal form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);

    try {
      const res = await fetch('/admin/categories/api', {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        document.getElementById('addCategoryModal').querySelector('.btn-close').click();
        await fetchCategories(searchInput.value);
        Swal.fire('Added!', 'Category has been added.', 'success');
      }
    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'Could not add category.', 'error');
    }
  });

  // Edit Category
  document.querySelectorAll('[id^=editCategoryModal]').forEach(modal => {
    modal.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const id = form.action.split('/').pop().split('?')[0];
      const formData = new URLSearchParams(new FormData(form));

      try {
        const res = await fetch(`/admin/categories/api/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData
        });

        if (res.ok) {
          form.closest('.modal').querySelector('.btn-close').click();
          await fetchCategories(searchInput.value);
          Swal.fire('Updated!', 'Category updated successfully.', 'success');
        }
      } catch (err) {
        console.error(err);
        Swal.fire('Error', 'Update failed.', 'error');
      }
    });
  });

  // Delete Category
  tableBody.addEventListener('click', async (e) => {
    if (e.target.closest('.btn-delete')) {
      const id = e.target.closest('.btn-delete').dataset.id;

      const confirmed = await Swal.fire({
        title: 'Delete this category?',
        text: 'This action cannot be undone.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Yes, delete'
      });

      if (confirmed.isConfirmed) {
        const res = await fetch(`/admin/categories/api/${id}/soft-delete`, {
          method: 'PATCH'
        });
        if (res.ok) {
          await fetchCategories(searchInput.value);
          Swal.fire('Deleted!', 'Category removed.', 'success');
        }
      }
    }
  });

  // Toggle Status
  tableBody.addEventListener('change', async (e) => {
    if (e.target.classList.contains('toggle-status')) {
      const id = e.target.dataset.id;

      const confirmed = await Swal.fire({
        title: 'Toggle category status?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Yes',
        cancelButtonText: 'Cancel'
      });

      if (confirmed.isConfirmed) {
        const res = await fetch(`/admin/categories/api/${id}/toggle`, { method: 'PATCH' });
        if (!res.ok) {
          Swal.fire('Error', 'Could not update status.', 'error');
        }
      } else {
        e.target.checked = !e.target.checked; // revert switch
      }
    }
  });