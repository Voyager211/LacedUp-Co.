# Image Cropping and Deletion Bug Fixes - Testing Guide

## Overview
This guide provides comprehensive testing procedures to verify that the critical image cropping and deletion functionality bugs have been fixed in the admin product management system.

## Fixed Issues
1. ✅ **Crop functionality now replaces images instead of duplicating them**
2. ✅ **Delete functionality properly removes images from both UI and database**
3. ✅ **Server-side validation enforces 6-image maximum limit**
4. ✅ **Database cleanup removes orphaned image files during product updates**

## Testing Prerequisites
- Admin access to the system
- Test images (at least 6 different images for testing)
- Browser developer tools access for debugging if needed

## Test Cases

### Test Case 1: Add Product - Crop Functionality
**Objective**: Verify that cropping images works correctly without creating duplicates

**Steps**:
1. Navigate to `/admin/products/add`
2. Upload 3-4 images using individual upload or bulk upload
3. Click the crop icon (scissors) on any uploaded image
4. Adjust the crop area and click "Save"
5. Verify the image is replaced, not duplicated
6. Repeat for different images
7. Submit the product form

**Expected Results**:
- Cropped images replace the original images
- No duplicate images are created
- Total image count remains the same after cropping
- Product saves successfully with correct number of images

### Test Case 2: Add Product - Delete Functionality
**Objective**: Verify that deleting images works correctly

**Steps**:
1. Navigate to `/admin/products/add`
2. Upload 4-5 images
3. Click the X (delete) button on various images
4. Verify images are removed from the UI
5. Submit the product form with remaining images (minimum 3)

**Expected Results**:
- Images are immediately removed from the UI
- Image count decreases correctly
- Main image selection adjusts if main image is deleted
- Product saves with correct number of images

### Test Case 3: Add Product - 6 Image Limit Validation
**Objective**: Verify that the 6-image maximum limit is enforced

**Steps**:
1. Navigate to `/admin/products/add`
2. Try to upload more than 6 images at once
3. Try to upload additional images after reaching 6 images
4. Try to submit a product with more than 6 images

**Expected Results**:
- Client-side validation prevents uploading more than 6 images
- Error messages are displayed when limit is exceeded
- Server-side validation rejects requests with more than 6 images
- Form submission fails with appropriate error message

### Test Case 4: Edit Product - Crop Functionality
**Objective**: Verify that cropping works correctly in edit mode

**Steps**:
1. Navigate to an existing product's edit page
2. Click the crop icon on any existing image
3. Adjust the crop area and save
4. Verify the image is replaced, not duplicated
5. Save the product

**Expected Results**:
- Existing images can be cropped successfully
- Cropped images replace originals without creating duplicates
- Product saves with correct images
- Old image files are cleaned up from the server

### Test Case 5: Edit Product - Delete Functionality
**Objective**: Verify that deleting images works correctly in edit mode

**Steps**:
1. Navigate to an existing product's edit page (with more than 3 images)
2. Click the X button to delete some images
3. Verify images are removed from the UI
4. Save the product
5. Check that the product detail page shows correct images

**Expected Results**:
- Images are removed from the UI immediately
- Product saves successfully
- Product detail page shows only remaining images
- Deleted image files are cleaned up from the server

### Test Case 6: Edit Product - Image Replacement
**Objective**: Verify that replacing images works correctly

**Steps**:
1. Navigate to an existing product's edit page
2. Delete some existing images
3. Upload new images to replace them
4. Crop some of the new images
5. Save the product

**Expected Results**:
- Old images are properly removed
- New images are added correctly
- Cropping works on new images
- Final product has correct images
- Orphaned files are cleaned up

### Test Case 7: Server-Side File Cleanup
**Objective**: Verify that orphaned image files are cleaned up

**Steps**:
1. Note the files in `public/uploads/products/` directory
2. Edit a product and replace several images
3. Save the product
4. Check the uploads directory again

**Expected Results**:
- Old image files that are no longer used are deleted
- New image files are present
- No orphaned files accumulate over time

### Test Case 8: Edge Cases
**Objective**: Test edge cases and error conditions

**Steps**:
1. Try to submit a product with less than 3 images
2. Try to delete images until less than 3 remain
3. Test with very large image files
4. Test with invalid image formats
5. Test network interruptions during upload/crop operations

**Expected Results**:
- Minimum 3 images validation works correctly
- Appropriate error messages are displayed
- File size and format validation works
- System handles errors gracefully

## Verification Checklist

After running all test cases, verify:

- [ ] No duplicate images are created during cropping operations
- [ ] Delete functionality removes images from both UI and database
- [ ] 6-image maximum limit is enforced on both client and server
- [ ] Image files are properly cleaned up from the file system
- [ ] Product detail pages show correct images after edits
- [ ] No console errors during image operations
- [ ] Form validation works correctly
- [ ] Main image selection works properly after deletions

## Debugging Tips

If issues are found:

1. **Check browser console** for JavaScript errors
2. **Check server logs** for backend errors
3. **Verify file system** - check `public/uploads/products/` directory
4. **Check database** - verify product image fields match displayed images
5. **Network tab** - verify API requests are successful

## Performance Considerations

- Image cropping operations should complete within 5 seconds
- File uploads should handle files up to 20MB
- Page should remain responsive during image operations
- Memory usage should not increase significantly during bulk operations

## Rollback Plan

If critical issues are found:
1. Revert the changes to the original code
2. Document the specific issues encountered
3. Plan additional fixes based on test results

## Success Criteria

All test cases pass with:
- ✅ No duplicate images created
- ✅ Proper image deletion from UI and database
- ✅ 6-image limit enforced
- ✅ File system cleanup working
- ✅ No console errors
- ✅ Smooth user experience
