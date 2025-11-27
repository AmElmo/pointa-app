/**
 * image-uploader.js
 * 
 * Handles user-uploaded reference images for annotations.
 * Compresses images to WebP format and uploads to server.
 */

const VibeImageUploader = {
  /**
   * Handle image file upload
   * @param {File} file - Image file to upload
   * @param {string} annotationId - ID of annotation this image belongs to
   * @returns {Promise<Object>} Reference image data for JSON storage
   */
  async uploadImage(file, annotationId) {
    // CRITICAL: Only allow image uploads on localhost pages
    const isLocalhost = PointaUtils.isLocalhostUrl(window.location.href);
    if (!isLocalhost) {
      throw new Error('Image uploads are only available on localhost pages');
    }

    try {
      // 1. Compress image to WebP
      const compressed = await this.compressImage(file, {
        maxWidth: 1920,
        maxHeight: 1080,
        quality: 0.85,
        format: 'webp'
      });

      // 2. Generate tiny thumbnail for JSON (for UI preview)
      const thumbnail = await this.compressImage(file, {
        maxWidth: 100,
        maxHeight: 100,
        quality: 0.7,
        format: 'webp'
      });

      // 3. Upload to server
      const formData = new FormData();
      formData.append('image', compressed, `${file.name}.webp`);
      formData.append('annotationId', annotationId);

      const response = await fetch('http://127.0.0.1:4242/api/upload-image', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const result = await response.json();

      // 4. Return reference data for JSON
      return {
        id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        file_path: result.file_path,
        thumbnail: await this.blobToDataURL(thumbnail),
        original_name: file.name,
        mime_type: file.type,
        size: result.size,
        uploaded_at: new Date().toISOString()
      };

    } catch (error) {
      console.error('Failed to upload image:', error);
      throw error;
    }
  },

  /**
   * Delete image from server
   * @param {string} filePath - Relative file path (e.g., "images/annotation_id/reference.webp")
   */
  async deleteImage(filePath) {
    // CRITICAL: Only allow image deletion on localhost pages
    const isLocalhost = PointaUtils.isLocalhostUrl(window.location.href);
    if (!isLocalhost) {
      throw new Error('Image operations are only available on localhost pages');
    }

    try {
      // Extract annotation ID and filename from path
      const parts = filePath.split('/');
      if (parts.length !== 3) {
        throw new Error('Invalid file path format');
      }

      const [, annotationId, filename] = parts;

      const response = await fetch(`http://127.0.0.1:4242/api/images/${annotationId}/${filename}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Delete failed');
      }


    } catch (error) {
      console.error('Failed to delete image:', error);
      throw error;
    }
  },

  /**
   * Compress image to specified format and quality
   * @param {File|Blob} file - Image file to compress
   * @param {Object} options - Compression options
   * @returns {Promise<Blob>} Compressed image blob
   */
  async compressImage(file, options = {}) {
    const {
      maxWidth = 1920,
      maxHeight = 1080,
      quality = 0.85,
      format = 'webp'
    } = options;

    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        // Calculate new dimensions maintaining aspect ratio
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        // Create canvas and compress
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to compress image'));
            }
          },
          `image/${format}`,
          quality
        );

        // Clean up object URL
        URL.revokeObjectURL(img.src);
      };

      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        reject(new Error('Failed to load image'));
      };

      img.src = URL.createObjectURL(file);
    });
  },

  /**
   * Convert blob to data URL
   * @param {Blob} blob - Blob to convert
   * @returns {Promise<string>} Data URL string
   */
  async blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  },

  /**
   * Get image URL for display
   * @param {string} filePath - Relative file path from server
   * @returns {string} Full URL to image
   */
  getImageURL(filePath) {
    // Extract annotation ID and filename
    const parts = filePath.split('/');
    if (parts.length !== 3) {
      console.error('Invalid file path format:', filePath);
      return null;
    }

    const [, annotationId, filename] = parts;
    return `http://127.0.0.1:4242/api/images/${annotationId}/${filename}`;
  }
};