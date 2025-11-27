// File Storage Manager using File System Access API
// Handles direct file system writes without requiring HTTP server

class FileStorageManager {
  constructor() {
    this.dbName = 'PointaFileStorage';
    this.dbVersion = 1;
    this.db = null;
    this.fileHandle = null;
    this.bugReportsFileHandle = null;
    this.directoryHandle = null;
    this.defaultFileName = 'annotations.json';
    this.bugReportsFileName = 'bug_reports.json';
  }

  /**
   * Initialize IndexedDB for storing file handles
   */
  async initDB() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('fileHandles')) {
          db.createObjectStore('fileHandles');
        }
      };
    });
  }

  /**
   * Save file handle to IndexedDB
   */
  async saveFileHandle(directoryHandle, fileHandle, bugReportsFileHandle) {
    await this.initDB();

    const tx = this.db.transaction('fileHandles', 'readwrite');
    const store = tx.objectStore('fileHandles');

    await store.put(directoryHandle, 'directoryHandle');
    await store.put(fileHandle, 'fileHandle');
    await store.put(bugReportsFileHandle, 'bugReportsFileHandle');
    await store.put(new Date().toISOString(), 'lastAccessTime');

    await tx.complete;

    this.directoryHandle = directoryHandle;
    this.fileHandle = fileHandle;
    this.bugReportsFileHandle = bugReportsFileHandle;


  }

  /**
   * Load file handle from IndexedDB
   */
  async loadFileHandle() {
    await this.initDB();

    try {
      const tx = this.db.transaction('fileHandles', 'readonly');
      const store = tx.objectStore('fileHandles');

      const directoryHandle = await store.get('directoryHandle');
      const fileHandle = await store.get('fileHandle');
      const bugReportsFileHandle = await store.get('bugReportsFileHandle');





      if (directoryHandle && fileHandle) {
        this.directoryHandle = directoryHandle;
        this.fileHandle = fileHandle;
        this.bugReportsFileHandle = bugReportsFileHandle; // May be null for old installations



        if (bugReportsFileHandle) {

        }
        return { directoryHandle, fileHandle, bugReportsFileHandle };
      }


      return null;
    } catch (error) {
      console.error('[FileStorage] ❌ Error loading file handle:', error);
      return null;
    }
  }

  /**
   * Check if we have permission to access the file
   */
  async checkPermission() {
    if (!this.fileHandle) {
      const handles = await this.loadFileHandle();
      if (!handles) return 'prompt';
    }

    try {
      // Check if queryPermission is available (not available in service workers)
      if (typeof this.fileHandle.queryPermission !== 'function') {
        console.warn('[FileStorage] queryPermission not available in this context (service worker)');
        return 'prompt';
      }
      
      const permission = await this.fileHandle.queryPermission({ mode: 'readwrite' });

      return permission;
    } catch (error) {
      console.error('[FileStorage] Error checking permission:', error);
      return 'prompt';
    }
  }

  /**
   * Request permission to access the file
   */
  async requestPermission() {
    if (!this.fileHandle) {
      throw new Error('No file handle available');
    }

    try {
      // Check if requestPermission is available (not available in service workers)
      if (typeof this.fileHandle.requestPermission !== 'function') {
        console.warn('[FileStorage] requestPermission not available in this context (service worker)');
        return false;
      }
      
      const permission = await this.fileHandle.requestPermission({ mode: 'readwrite' });

      return permission === 'granted';
    } catch (error) {
      console.error('[FileStorage] Error requesting permission:', error);
      return false;
    }
  }

  /**
   * Check if a directory is a protected system folder
   * Returns true if the folder should be blocked
   */
  isSystemFolder(directoryName, directoryPath) {
    // List of protected system folders that Chrome blocks on localhost
    const protectedFolders = [
    'Documents', 'Downloads', 'Desktop', 'Pictures', 'Music', 'Videos',
    'Library', 'Applications', 'System', 'Users', 'Volumes',
    'bin', 'sbin', 'usr', 'var', 'tmp', 'etc', 'opt', 'private'];


    // Check if directory name matches a protected folder
    if (protectedFolders.includes(directoryName)) {
      return true;
    }

    // Check if path contains system indicators (if available)
    if (directoryPath) {
      const lowerPath = directoryPath.toLowerCase();
      if (lowerPath.includes('/documents') ||
      lowerPath.includes('/downloads') ||
      lowerPath.includes('/desktop') ||
      lowerPath.includes('/library') ||
      lowerPath.includes('/system') ||
      lowerPath.includes('/applications')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Prompt user to select home directory and auto-create .pointa subdirectory
   * Returns the file handle for annotations.json in ~/.pointa/
   */
  async promptForDirectory() {

    try {
      // Check if File System Access API is available
      if (typeof window === 'undefined' || !window.showDirectoryPicker) {
        throw new Error('File System Access API not supported in this context');
      }



      // Request home directory access from user
      // Opens in Documents, user should navigate up to their home folder
      const homeHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents' // Opens in Documents so user can easily navigate up to home
      });




      // Get directory path for display
      const directoryPath = await this.getDirectoryPath(homeHandle);


      // Validate that this is not a system folder (Documents, Library, etc.)
      if (this.isSystemFolder(homeHandle.name, directoryPath)) {
        console.error('[FileStorage] ❌ System folder detected:', homeHandle.name);
        return {
          success: false,
          error: 'Cannot use this system folder. Please select your home folder (your username folder).',
          isSystemFolder: true
        };
      }

      // Auto-create .pointa subdirectory inside home directory

      const pointaHandle = await homeHandle.getDirectoryHandle('.pointa', {
        create: true // Creates directory if it doesn't exist
      });


      // Get or create the annotations.json file inside .pointa

      const fileHandle = await pointaHandle.getFileHandle(this.defaultFileName, {
        create: true
      });


      // Initialize file with empty array if it's new
      try {
        const file = await fileHandle.getFile();
        if (file.size === 0) {

          const writable = await fileHandle.createWritable();
          await writable.write(JSON.stringify([], null, 2));
          await writable.close();

        }
      } catch (initError) {
        console.warn('[FileStorage] Could not initialize file:', initError);
      }

      // Get or create the bug_reports.json file inside .pointa

      const bugReportsFileHandle = await pointaHandle.getFileHandle(this.bugReportsFileName, {
        create: true
      });


      // Initialize bug reports file with empty array if it's new
      try {
        const bugFile = await bugReportsFileHandle.getFile();
        if (bugFile.size === 0) {

          const writable = await bugReportsFileHandle.createWritable();
          await writable.write(JSON.stringify([], null, 2));
          await writable.close();

        }
      } catch (initError) {
        console.warn('[FileStorage] Could not initialize bug reports file:', initError);
      }

      // Save handles for future use (save the .pointa handle, not Documents)

      await this.saveFileHandle(pointaHandle, fileHandle, bugReportsFileHandle);


      const successResult = {
        success: true,
        directoryPath: `${homeHandle.name}/.pointa`,
        fileHandle,
        directoryHandle: pointaHandle
      };



      return successResult;

    } catch (error) {
      console.error('[FileStorage] ❌ === CAUGHT ERROR IN promptForDirectory ===');
      console.error('[FileStorage] Error type:', typeof error);
      console.error('[FileStorage] Error name:', error.name);
      console.error('[FileStorage] Error message:', error.message);
      console.error('[FileStorage] Error constructor:', error.constructor.name);
      console.error('[FileStorage] Full error object:', error);
      console.error('[FileStorage] Error stack:', error.stack);

      if (error.name === 'AbortError') {
        console.warn('[FileStorage] ⚠️ AbortError detected - user clicked Cancel or picker was dismissed');
        return { success: false, cancelled: true };
      }

      // Check for permission or security errors that might indicate system folder issues
      if (error.name === 'SecurityError' || error.name === 'NotAllowedError') {
        console.error('[FileStorage] Security/Permission error - likely a system folder');
        return {
          success: false,
          error: 'Cannot access this location. Please select your Documents folder.',
          isSystemFolder: true
        };
      }

      console.error('[FileStorage] Non-abort error, returning error result');
      return {
        success: false,
        error: error.message || error.toString(),
        errorName: error.name
      };
    }
  }

  /**
   * Get a human-readable path from directory handle
   */
  async getDirectoryPath(directoryHandle) {
    try {
      // Try to resolve the path (may not work in all contexts)
      if (directoryHandle.resolve) {
        const path = await directoryHandle.resolve();
        return path.join('/');
      }
      // Fallback to just the directory name
      return directoryHandle.name;
    } catch (error) {
      return directoryHandle.name;
    }
  }

  /**
   * Read annotations from file
   */
  async readAnnotations() {
    // Load handles if not already loaded
    if (!this.fileHandle) {
      const handles = await this.loadFileHandle();
      if (!handles) {
        throw new Error('File storage not configured. Please setup storage from settings first.');
      }
    }

    // Check if we can use file operations (not available in service workers)
    if (!this.fileHandle || typeof this.fileHandle.getFile !== 'function') {
      console.warn('[FileStorage] File operations not available in service worker context');
      return [];
    }

    // Ensure we have permission - automatically request if needed
    const permission = await this.checkPermission();


    if (permission !== 'granted') {

      const granted = await this.requestPermission();
      if (!granted) {
        throw new Error('Permission denied to read file. Please grant permission in your browser settings.');
      }

    }

    try {
      const file = await this.fileHandle.getFile();
      const contents = await file.text();

      if (!contents || contents.trim() === '') {

        return [];
      }

      const annotations = JSON.parse(contents);

      return annotations;
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.error('[FileStorage] Invalid JSON in file, returning empty array');
        return [];
      }
      throw error;
    }
  }

  /**
   * Write annotations to file
   */
  async writeAnnotations(annotations) {
    // Load handles if not already loaded
    if (!this.fileHandle) {
      const handles = await this.loadFileHandle();
      if (!handles) {
        throw new Error('File storage not configured. Please setup storage from settings first.');
      }
    }

    // Check if we can use file operations (not available in service workers)
    if (!this.fileHandle || typeof this.fileHandle.createWritable !== 'function') {
      console.warn('[FileStorage] File operations not available in service worker context');
      throw new Error('File operations not available in this context');
    }

    // Ensure we have permission - automatically request if needed
    const permission = await this.checkPermission();


    if (permission !== 'granted') {

      const granted = await this.requestPermission();
      if (!granted) {
        throw new Error('Permission denied to write file. Please grant permission in your browser settings.');
      }

    }

    try {
      // Create a writable stream
      const writable = await this.fileHandle.createWritable();

      // Write the annotations as formatted JSON
      const content = JSON.stringify(annotations, null, 2);
      await writable.write(content);

      // Close the file
      await writable.close();


      return { success: true };
    } catch (error) {
      console.error('[FileStorage] Error writing annotations:', error);
      throw error;
    }
  }

  /**
   * Check if file storage is configured (handles exist in IndexedDB)
   * This is separate from permission status - configured means user has selected a folder
   */
  async isConfigured() {
    const handles = await this.loadFileHandle();
    return !!handles;
  }

  /**
   * Check if file storage is both configured AND has permission
   */
  async isAvailable() {
    const handles = await this.loadFileHandle();
    if (!handles) return false;

    const permission = await this.checkPermission();
    return permission === 'granted';
  }

  /**
   * Get storage status information
   * Returns both configured (handles exist) and hasPermission (can access) separately
   */
  async getStatus() {

    const handles = await this.loadFileHandle();

    if (!handles) {

      return {
        configured: false,
        hasPermission: false,
        available: false,
        message: 'No storage folder selected'
      };
    }


    const permission = await this.checkPermission();


    const directoryPath = await this.getDirectoryPath(this.directoryHandle);


    const hasPermission = permission === 'granted';
    const statusResult = {
      configured: true, // Handles exist in IndexedDB
      hasPermission, // Current permission status
      available: hasPermission, // Can use it right now
      permission: permission,
      directoryPath: directoryPath,
      fileName: this.defaultFileName,
      fullPath: `${directoryPath}/${this.defaultFileName}`,
      message: hasPermission ?
      'Storage configured and accessible' :
      'Storage configured - permission will be requested when needed'
    };


    return statusResult;
  }

  /**
   * Read bug reports from file
   */
  async readBugReports() {
    // Load handles if not already loaded
    if (!this.bugReportsFileHandle) {
      const handles = await this.loadFileHandle();
      if (!handles || !handles.bugReportsFileHandle) {
        // For backward compatibility, return empty array if bug reports file not configured

        return [];
      }
    }

    // Check if we can use file operations (not available in service workers)
    if (!this.bugReportsFileHandle || typeof this.bugReportsFileHandle.getFile !== 'function') {
      console.warn('[FileStorage] File operations not available in service worker context');
      return [];
    }

    // Ensure we have permission - automatically request if needed
    const permission = await this.checkPermission();


    if (permission !== 'granted') {

      const granted = await this.requestPermission();
      if (!granted) {
        throw new Error('Permission denied to read bug reports file. Please grant permission in your browser settings.');
      }

    }

    try {
      const file = await this.bugReportsFileHandle.getFile();
      const contents = await file.text();

      if (!contents || contents.trim() === '') {

        return [];
      }

      const bugReports = JSON.parse(contents);

      return bugReports;
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.error('[FileStorage] Invalid JSON in bug reports file, returning empty array');
        return [];
      }
      throw error;
    }
  }

  /**
   * Write bug reports to file
   */
  async writeBugReports(bugReports) {
    // Load handles if not already loaded
    if (!this.bugReportsFileHandle) {
      const handles = await this.loadFileHandle();
      if (!handles || !handles.bugReportsFileHandle) {
        throw new Error('Bug reports file storage not configured. Please setup storage from settings first.');
      }
    }

    // Check if we can use file operations (not available in service workers)
    if (!this.bugReportsFileHandle || typeof this.bugReportsFileHandle.createWritable !== 'function') {
      console.warn('[FileStorage] File operations not available in service worker context');
      throw new Error('File operations not available in this context');
    }

    // Ensure we have permission - automatically request if needed
    const permission = await this.checkPermission();


    if (permission !== 'granted') {

      const granted = await this.requestPermission();
      if (!granted) {
        throw new Error('Permission denied to write bug reports file. Please grant permission in your browser settings.');
      }

    }

    try {
      // Create a writable stream
      const writable = await this.bugReportsFileHandle.createWritable();

      // Write the bug reports as formatted JSON
      const content = JSON.stringify(bugReports, null, 2);
      await writable.write(content);

      // Close the file
      await writable.close();


      return { success: true };
    } catch (error) {
      console.error('[FileStorage] Error writing bug reports:', error);
      throw error;
    }
  }

  /**
   * Clear stored file handles (for re-configuration)
   */
  async clearHandles() {
    await this.initDB();

    const tx = this.db.transaction('fileHandles', 'readwrite');
    const store = tx.objectStore('fileHandles');

    await store.delete('directoryHandle');
    await store.delete('fileHandle');
    await store.delete('bugReportsFileHandle');
    await store.delete('lastAccessTime');

    await tx.complete;

    this.directoryHandle = null;
    this.fileHandle = null;
    this.bugReportsFileHandle = null;


  }

  /**
   * Check if File System Access API is supported
   */
  static isSupported() {
    // Check if we're in a window context (not a service worker)
    if (typeof window === 'undefined') {
      return false;
    }
    return 'showDirectoryPicker' in window;
  }
}

// Export for use in service worker
if (typeof self !== 'undefined' && self.FileStorageManager === undefined) {
  self.FileStorageManager = FileStorageManager;
}