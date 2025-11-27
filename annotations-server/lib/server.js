#!/usr/bin/env node

// Test simplified workflow using NPM as version source
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema } from
'@modelcontextprotocol/sdk/types.js';
import { readFile, writeFile, mkdir, unlink, rm } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read version from package.json automatically
const packageJson = JSON.parse(readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

// Configuration
const PORT = parseInt(process.env.POINTA_PORT || '4242', 10);
const DATA_DIR = path.join(process.env.HOME || process.env.USERPROFILE, '.pointa');
const DATA_FILE = path.join(DATA_DIR, 'annotations.json');
const ARCHIVE_FILE = path.join(DATA_DIR, 'archive.json');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const INSPIRATIONS_DIR = path.join(DATA_DIR, 'inspirations');
const INSPIRATIONS_FILE = path.join(DATA_DIR, 'inspirations.json');
const INSPIRATION_SCREENSHOTS_DIR = path.join(DATA_DIR, 'inspiration_screenshots');
const BUG_REPORTS_FILE = path.join(DATA_DIR, 'bug_reports.json');
const BUG_SCREENSHOTS_DIR = path.join(DATA_DIR, 'bug_screenshots');

// Configure multer for memory storage (we'll save manually for better control)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept images only
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed'), false);
      return;
    }
    cb(null, true);
  }
});

class LocalAnnotationsServer {
  constructor() {
    this.app = express();
    this.mcpServer = new Server(
      {
        name: 'claude-annotations',
        version: '0.1.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );
    this.isShuttingDown = false;
    this.handlersSetup = false;
    this.transports = {}; // Track transport sessions
    this.connections = new Set(); // Track HTTP connections
    this.saveLock = Promise.resolve(); // Serialize save operations to prevent race conditions
    this.bugReportsSaveLock = Promise.resolve(); // Serialize bug reports save operations
    this.inspirationsSaveLock = Promise.resolve(); // Serialize inspirations save operations

    this.setupExpress();
    this.setupMCP();
  }

  setupExpress() {
    // Allow all localhost/127.0.0.1 origins for local development
    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // Allow Chrome extension origins
        if (origin.startsWith('chrome-extension://')) {
          return callback(null, true);
        }

        // Allow any localhost or 127.0.0.1 origin (any port)
        if (origin.startsWith('http://localhost:') ||
        origin.startsWith('https://localhost:') ||
        origin.startsWith('http://127.0.0.1:') ||
        origin.startsWith('https://127.0.0.1:') ||
        origin.startsWith('http://0.0.0.0:') ||
        origin.startsWith('https://0.0.0.0:') ||
        origin.match(/^https?:\/\/[^\/]+\.(local|test|localhost)(\/|:|$)/)) {
          return callback(null, true);
        }

        // Log rejected origins for debugging


        // Block all other origins
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true
    }));
    // Increase body size limit for high-quality screenshots (especially retina displays)
    // Base64-encoded images can be 1.33x larger than raw size
    this.app.use(express.json({ limit: '50mb' }));

    // Health check with version info
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        version: packageJson.version,
        minExtensionVersion: '1.0.0', // Minimum compatible extension version
        timestamp: new Date().toISOString()
      });
    });

    // API endpoints for Chrome extension
    this.app.get('/api/annotations', async (req, res) => {
      try {
        const annotations = await this.loadAnnotations();
        const { status, url, limit = 50 } = req.query;

        let filtered = annotations;

        if (status && status !== 'all') {
          filtered = filtered.filter((a) => a.status === status);
        }

        if (url) {
          filtered = filtered.filter((a) => a.url === url);
        }

        filtered = filtered.slice(0, parseInt(limit));

        // Debug: Log unique URLs being returned
        const uniqueUrls = [...new Set(filtered.map((a) => a.url))];









        res.json({
          annotations: filtered,
          count: filtered.length,
          total: annotations.length
        });
      } catch (error) {
        console.error('Error loading annotations:', error);
        res.status(500).json({ error: 'Failed to load annotations' });
      }
    });

    this.app.post('/api/annotations', async (req, res) => {
      try {
        const annotation = req.body;

        // Validate annotation - comment is optional for design-only annotations
        if (!annotation.id || !annotation.url) {
          return res.status(400).json({ error: 'Missing required fields (id, url)' });
        }

        const annotations = await this.loadAnnotations();
        const existingIndex = annotations.findIndex((a) => a.id === annotation.id);

        if (existingIndex >= 0) {
          annotations[existingIndex] = { ...annotations[existingIndex], ...annotation, updated_at: new Date().toISOString() };
        } else {
          annotations.push({
            ...annotation,
            created_at: annotation.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }

        await this.saveAnnotations(annotations);
        res.json({ success: true, annotation });
      } catch (error) {
        console.error('Error saving annotation:', error);
        res.status(500).json({ error: 'Failed to save annotation' });
      }
    });

    // New endpoint to sync all annotations (replace existing)
    this.app.post('/api/annotations/sync', async (req, res) => {
      try {
        const { annotations } = req.body;

        if (!Array.isArray(annotations)) {
          return res.status(400).json({ error: 'annotations must be an array' });
        }

        // Get current annotations for comparison
        const currentAnnotations = await this.loadAnnotations();


        // Check if data is actually different to avoid redundant saves
        const currentJson = JSON.stringify(currentAnnotations.sort((a, b) => a.id.localeCompare(b.id)));
        const newJson = JSON.stringify(annotations.sort((a, b) => a.id.localeCompare(b.id)));

        if (currentJson === newJson) {

          res.json({ success: true, count: annotations.length, skipped: true });
          return;
        }

        // Replace all annotations with the new set
        await this.saveAnnotations(annotations);

        res.json({ success: true, count: annotations.length });
      } catch (error) {
        console.error('Error syncing annotations:', error);
        res.status(500).json({ error: 'Failed to sync annotations' });
      }
    });

    this.app.put('/api/annotations/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const updates = req.body;

        const annotations = await this.loadAnnotations();
        const index = annotations.findIndex((a) => a.id === id);

        if (index === -1) {
          return res.status(404).json({ error: 'Annotation not found' });
        }

        annotations[index] = {
          ...annotations[index],
          ...updates,
          updated_at: new Date().toISOString()
        };

        await this.saveAnnotations(annotations);
        res.json({ success: true, annotation: annotations[index] });
      } catch (error) {
        console.error('Error updating annotation:', error);
        res.status(500).json({ error: 'Failed to update annotation' });
      }
    });

    this.app.delete('/api/annotations/:id', async (req, res) => {
      try {
        const { id } = req.params;

        const annotations = await this.loadAnnotations();
        const index = annotations.findIndex((a) => a.id === id);

        if (index === -1) {
          return res.status(404).json({ error: 'Annotation not found' });
        }

        const deletedAnnotation = annotations[index];
        annotations.splice(index, 1);

        await this.saveAnnotations(annotations);

        // Also delete associated images if they exist
        const imageDir = path.join(IMAGES_DIR, id);
        if (existsSync(imageDir)) {
          try {
            await rm(imageDir, { recursive: true, force: true });

          } catch (imageError) {
            console.warn(`Failed to delete images for annotation ${id}:`, imageError.message);
          }
        }

        res.json({
          success: true,
          deleted: true,
          message: `Annotation ${id} has been successfully deleted`,
          deletedAnnotation
        });
      } catch (error) {
        console.error('Error deleting annotation:', error);
        res.status(500).json({ error: 'Failed to delete annotation' });
      }
    });

    // Archive annotation endpoint (moves from active to archive)
    this.app.post('/api/annotations/:id/archive', async (req, res) => {
      try {
        const { id } = req.params;

        const annotations = await this.loadAnnotations();
        const index = annotations.findIndex((a) => a.id === id);

        if (index === -1) {
          return res.status(404).json({ error: 'Annotation not found' });
        }

        const annotation = annotations[index];

        // Remove from active annotations
        annotations.splice(index, 1);

        // Add to archive with completion metadata
        const archive = await this.loadArchive();
        const archivedAnnotation = {
          ...annotation,
          archived_at: new Date().toISOString(),
          original_created_at: annotation.created_at,
          ai_completed_at: annotation.updated_at
        };
        archive.push(archivedAnnotation);

        // Save both files
        await this.saveAnnotations(annotations);
        await this.saveArchive(archive);


        res.json({
          success: true,
          archived: true,
          message: `Annotation ${id} has been archived`,
          annotation: archivedAnnotation
        });
      } catch (error) {
        console.error('Error archiving annotation:', error);
        res.status(500).json({ error: 'Failed to archive annotation' });
      }
    });

    // Image upload endpoint
    this.app.post('/api/upload-image', upload.single('image'), async (req, res) => {
      try {
        const { annotationId } = req.body;
        const file = req.file;

        if (!file || !annotationId) {
          return res.status(400).json({ error: 'Missing file or annotationId' });
        }

        // Create directory for this annotation's images
        const imageDir = path.join(IMAGES_DIR, annotationId);
        await mkdir(imageDir, { recursive: true });

        // Generate unique filename
        const timestamp = Date.now();
        const ext = path.extname(file.originalname) || '.webp';
        const filename = `reference-${timestamp}${ext}`;
        const filePath = path.join(imageDir, filename);

        // Save file
        await writeFile(filePath, file.buffer);

        // Return relative path (for JSON storage)
        const relativePath = `images/${annotationId}/${filename}`;



        res.json({
          success: true,
          file_path: relativePath,
          original_name: file.originalname,
          mime_type: file.mimetype,
          size: file.size
        });

      } catch (error) {
        console.error('Error uploading image:', error);
        res.status(500).json({ error: 'Failed to upload image' });
      }
    });

    // Get image endpoint
    this.app.get('/api/images/:annotationId/:filename', async (req, res) => {
      try {
        const { annotationId, filename } = req.params;
        const filePath = path.join(IMAGES_DIR, annotationId, filename);

        // Check if file exists
        if (!existsSync(filePath)) {
          return res.status(404).json({ error: 'Image not found' });
        }

        // Send file
        res.sendFile(filePath);

      } catch (error) {
        console.error('Error retrieving image:', error);
        res.status(404).json({ error: 'Image not found' });
      }
    });

    // Delete image endpoint
    this.app.delete('/api/images/:annotationId/:filename', async (req, res) => {
      try {
        const { annotationId, filename } = req.params;
        const filePath = path.join(IMAGES_DIR, annotationId, filename);

        // Check if file exists
        if (!existsSync(filePath)) {
          return res.status(404).json({ error: 'Image not found' });
        }

        // Delete file
        await unlink(filePath);



        res.json({
          success: true,
          message: 'Image deleted successfully'
        });

      } catch (error) {
        console.error('Error deleting image:', error);
        res.status(500).json({ error: 'Failed to delete image' });
      }
    });

    // Inspirations API endpoints
    this.app.get('/api/inspirations', async (req, res) => {
      try {
        const inspirations = await this.loadInspirations();
        const { domain, limit } = req.query;

        let filtered = inspirations;

        if (domain) {
          filtered = filtered.filter((i) => i.domain === domain);
        }

        // Apply limit only if provided
        if (limit) {
          filtered = filtered.slice(0, parseInt(limit));
        }

        res.json({
          inspirations: filtered,
          count: filtered.length,
          total: inspirations.length
        });
      } catch (error) {
        console.error('Error loading inspirations:', error);
        res.status(500).json({ error: 'Failed to load inspirations' });
      }
    });

    this.app.post('/api/inspirations', async (req, res) => {
      try {
        const inspiration = req.body;



        // Validate inspiration
        if (!inspiration.id || !inspiration.domain || !inspiration.url) {
          console.error('[Inspirations] Missing required fields');
          return res.status(400).json({ error: 'Missing required fields' });
        }

        const inspirations = await this.loadInspirations();
        const existingIndex = inspirations.findIndex((i) => i.id === inspiration.id);

        if (existingIndex >= 0) {

          inspirations[existingIndex] = { ...inspirations[existingIndex], ...inspiration };
        } else {

          inspirations.push({
            ...inspiration,
            created: inspiration.created || new Date().toISOString()
          });
        }

        await this.saveInspirations(inspirations);



        res.json({ success: true, inspiration });
      } catch (error) {
        console.error('[Inspirations] Error saving inspiration:', error);
        res.status(500).json({ error: 'Failed to save inspiration' });
      }
    });

    this.app.get('/api/inspirations/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const inspirations = await this.loadInspirations();
        const inspiration = inspirations.find((i) => i.id === id);

        if (!inspiration) {
          return res.status(404).json({ error: 'Inspiration not found' });
        }

        res.json({ success: true, inspiration });
      } catch (error) {
        console.error('Error getting inspiration:', error);
        res.status(500).json({ error: 'Failed to get inspiration' });
      }
    });

    this.app.delete('/api/inspirations/:id', async (req, res) => {
      try {
        const { id } = req.params;

        const inspirations = await this.loadInspirations();
        const index = inspirations.findIndex((i) => i.id === id);

        if (index === -1) {
          return res.status(404).json({ error: 'Inspiration not found' });
        }

        const deletedInspiration = inspirations[index];
        inspirations.splice(index, 1);

        await this.saveInspirations(inspirations);

        // Also delete associated screenshot if it exists
        if (deletedInspiration.screenshot?.filename) {
          const screenshotPath = path.join(INSPIRATION_SCREENSHOTS_DIR, deletedInspiration.screenshot.filename);
          if (existsSync(screenshotPath)) {
            try {
              await unlink(screenshotPath);

            } catch (screenshotError) {
              console.warn(`Failed to delete screenshot for inspiration ${id}:`, screenshotError.message);
            }
          }
        }

        res.json({
          success: true,
          deleted: true,
          message: `Inspiration ${id} has been successfully deleted`,
          deletedInspiration
        });
      } catch (error) {
        console.error('Error deleting inspiration:', error);
        res.status(500).json({ error: 'Failed to delete inspiration' });
      }
    });

    // Get inspiration screenshot endpoint
    this.app.get('/api/inspiration-screenshots/:filename', async (req, res) => {
      try {
        const { filename } = req.params;
        const filePath = path.join(INSPIRATION_SCREENSHOTS_DIR, filename);

        // Check if file exists
        if (!existsSync(filePath)) {
          return res.status(404).json({ error: 'Screenshot not found' });
        }

        // Send file
        res.sendFile(filePath);

      } catch (error) {
        console.error('Error retrieving inspiration screenshot:', error);
        res.status(404).json({ error: 'Screenshot not found' });
      }
    });

    // Save inspiration screenshot endpoint
    this.app.post('/api/inspiration-screenshots', async (req, res) => {
      try {
        const { screenshotId, dataUrl } = req.body;

        if (!screenshotId || !dataUrl) {
          console.error('[Inspiration Screenshots] Missing required fields:', { hasScreenshotId: !!screenshotId, hasDataUrl: !!dataUrl });
          return res.status(400).json({ error: 'Missing screenshotId or dataUrl' });
        }

        // Create screenshots directory if it doesn't exist
        if (!existsSync(INSPIRATION_SCREENSHOTS_DIR)) {

          await mkdir(INSPIRATION_SCREENSHOTS_DIR, { recursive: true });
        }

        // Detect image format from data URL
        const formatMatch = dataUrl.match(/^data:image\/(\w+);base64,/);
        const format = formatMatch ? formatMatch[1] : 'png';

        // Convert data URL to buffer
        const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');



        // Save screenshot with screenshotId as filename
        const filename = `${screenshotId}.${format}`;
        const filePath = path.join(INSPIRATION_SCREENSHOTS_DIR, filename);
        await writeFile(filePath, buffer);

        // Create both relative and absolute paths
        const relativePath = `inspiration_screenshots/${filename}`;
        const homeDir = process.env.HOME || process.env.USERPROFILE;
        const absolutePath = path.join(homeDir, '.pointa', 'inspiration_screenshots', filename);
        const tildePath = `~/.pointa/inspiration_screenshots/${filename}`;



        res.json({
          success: true,
          screenshotId: screenshotId,
          filename: filename,
          path: relativePath,
          absolutePath: absolutePath,
          tildePath: tildePath,
          size: buffer.length
        });

      } catch (error) {
        console.error('[Inspiration Screenshots] Error saving inspiration screenshot:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to save inspiration screenshot',
          details: error.message
        });
      }
    });

    // Bug Reports API endpoints
    this.app.get('/api/bug-reports', async (req, res) => {
      try {
        const bugReports = await this.loadBugReports();
        const { status, url, limit = 50 } = req.query;

        let filtered = bugReports;

        if (status && status !== 'all') {
          filtered = filtered.filter((r) => r.status === status);
        }

        if (url) {
          filtered = filtered.filter((r) => r.context?.page?.url === url);
        }

        filtered = filtered.slice(0, parseInt(limit));

        res.json({
          bug_reports: filtered,
          count: filtered.length,
          total: bugReports.length
        });
      } catch (error) {
        console.error('Error loading bug reports:', error);
        res.status(500).json({ error: 'Failed to load bug reports' });
      }
    });

    this.app.post('/api/bug-reports', async (req, res) => {
      try {
        const bugReport = req.body;



        // Validate bug report
        if (!bugReport.id || !bugReport.report) {
          console.error('[Bug Reports] Missing required fields');
          return res.status(400).json({ error: 'Missing required fields' });
        }

        const bugReports = await this.loadBugReports();
        const existingIndex = bugReports.findIndex((r) => r.id === bugReport.id);

        if (existingIndex >= 0) {

          bugReports[existingIndex] = { ...bugReports[existingIndex], ...bugReport, updated: new Date().toISOString() };
        } else {

          bugReports.push({
            ...bugReport,
            created: bugReport.created || new Date().toISOString(),
            updated: new Date().toISOString()
          });
        }

        await this.saveBugReports(bugReports);




        res.json({ success: true, bug_report: bugReport });
      } catch (error) {
        console.error('[Bug Reports] Error saving bug report:', error);
        res.status(500).json({ error: 'Failed to save bug report' });
      }
    });

    this.app.put('/api/bug-reports/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const updates = req.body;

        const bugReports = await this.loadBugReports();
        const index = bugReports.findIndex((r) => r.id === id);

        if (index === -1) {
          return res.status(404).json({ error: 'Bug report not found' });
        }

        bugReports[index] = {
          ...bugReports[index],
          ...updates,
          updated: new Date().toISOString()
        };

        await this.saveBugReports(bugReports);
        res.json({ success: true, bug_report: bugReports[index] });
      } catch (error) {
        console.error('Error updating bug report:', error);
        res.status(500).json({ error: 'Failed to update bug report' });
      }
    });

    this.app.delete('/api/bug-reports/:id', async (req, res) => {
      try {
        const { id } = req.params;

        const bugReports = await this.loadBugReports();
        const index = bugReports.findIndex((r) => r.id === id);

        if (index === -1) {
          return res.status(404).json({ error: 'Bug report not found' });
        }

        const deletedReport = bugReports[index];
        bugReports.splice(index, 1);

        await this.saveBugReports(bugReports);

        // Also delete associated screenshot if it exists
        if (deletedReport.visual?.screenshot?.filename) {
          const screenshotPath = path.join(BUG_SCREENSHOTS_DIR, deletedReport.visual.screenshot.filename);
          if (existsSync(screenshotPath)) {
            try {
              await unlink(screenshotPath);

            } catch (screenshotError) {
              console.warn(`Failed to delete screenshot for bug report ${id}:`, screenshotError.message);
            }
          }
        }

        res.json({
          success: true,
          deleted: true,
          message: `Bug report ${id} has been successfully deleted`,
          deletedReport
        });
      } catch (error) {
        console.error('Error deleting bug report:', error);
        res.status(500).json({ error: 'Failed to delete bug report' });
      }
    });

    // Save bug report screenshot endpoint
    this.app.post('/api/bug-screenshots', async (req, res) => {
      try {
        const { screenshotId, dataUrl } = req.body;

        if (!screenshotId || !dataUrl) {
          console.error('[Bug Screenshots] Missing required fields:', { hasScreenshotId: !!screenshotId, hasDataUrl: !!dataUrl });
          return res.status(400).json({ error: 'Missing screenshotId or dataUrl' });
        }

        // Create screenshots directory if it doesn't exist
        if (!existsSync(BUG_SCREENSHOTS_DIR)) {

          await mkdir(BUG_SCREENSHOTS_DIR, { recursive: true });
        }

        // Detect image format from data URL
        const formatMatch = dataUrl.match(/^data:image\/(\w+);base64,/);
        const format = formatMatch ? formatMatch[1] : 'png';

        // Convert data URL to buffer
        const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');



        // Save screenshot with screenshotId as filename
        const filename = `${screenshotId}.${format}`;
        const filePath = path.join(BUG_SCREENSHOTS_DIR, filename);
        await writeFile(filePath, buffer);

        // Create both relative and absolute paths
        const relativePath = `bug_screenshots/${filename}`;
        const homeDir = process.env.HOME || process.env.USERPROFILE;
        const absolutePath = path.join(homeDir, '.pointa', 'bug_screenshots', filename);
        // Also provide tilde path for convenience
        const tildePath = `~/.pointa/bug_screenshots/${filename}`;



        res.json({
          success: true,
          screenshotId: screenshotId,
          filename: filename,
          path: relativePath,
          absolutePath: absolutePath,
          tildePath: tildePath,
          size: buffer.length
        });

      } catch (error) {
        console.error('[Bug Screenshots] Error saving bug screenshot:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to save bug screenshot',
          details: error.message
        });
      }
    });

    // SSE endpoint for MCP connection (proper MCP SSE transport)
    this.app.get('/sse', async (req, res) => {


      try {
        const transport = new SSEServerTransport('/messages', res);
        this.transports[transport.sessionId] = transport;

        // Clean up transport on connection close
        res.on("close", () => {

          try {
            if (transport && typeof transport.close === 'function') {
              transport.close();
            }
          } catch (error) {
            console.warn(`Error closing transport ${transport.sessionId}:`, error.message);
          }
          delete this.transports[transport.sessionId];
        });

        // Handle connection errors
        res.on("error", (error) => {
          console.warn(`SSE connection error for session ${transport.sessionId}:`, error.message);
          try {
            if (transport && typeof transport.close === 'function') {
              transport.close();
            }
          } catch (closeError) {
            console.warn(`Error closing transport ${transport.sessionId}:`, closeError.message);
          }
          delete this.transports[transport.sessionId];
        });

        // Create fresh server and connect to transport
        const server = this.createMCPServer();
        await server.connect(transport);


      } catch (error) {
        console.error('Error setting up SSE transport:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to establish SSE connection' });
        }
      }
    });

    // Messages endpoint for SSE transport (handles incoming MCP messages)
    this.app.post('/messages', async (req, res) => {


      try {
        const sessionId = req.query.sessionId;
        const transport = this.transports[sessionId];

        if (!transport || !(transport instanceof SSEServerTransport)) {
          console.error(`No SSE transport found for session ID: ${sessionId}`);
          res.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Bad Request: No valid SSE transport found for session ID'
            },
            id: null
          });
          return;
        }

        // Handle the message using the transport
        await transport.handlePostMessage(req, res, req.body);

      } catch (error) {
        console.error('Error handling message:', error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error'
            },
            id: null
          });
        }
      }
    });

    // MCP HTTP endpoint - create fresh instances per request
    this.app.use('/mcp', async (req, res) => {
      try {
        // Create fresh server and transport for each request to avoid "already initialized" error
        const server = this.createMCPServer();

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined, // Stateless mode
          allowedOrigins: ['*'], // Allow all origins for MCP
          enableDnsRebindingProtection: false // Disable for localhost
        });

        // Connect server to transport and handle request
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error('MCP connection error:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'MCP connection failed' });
        }
      }
    });
  }

  setupMCP() {


    // Original server setup - now unused
  } // Helper method to create fresh MCP server instances
  createMCPServer() {
    const server = new Server(
      {
        name: 'claude-annotations',
        version: '0.1.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    // Set up handlers for this instance
    this.setupMCPHandlersForServer(server);

    return server;
  }

  /**
   * Set up MCP tool handlers for this server instance
   */
  setupMCPHandlersForServer(server) {
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
        {
          name: 'read_annotations',
          description: 'Retrieves user-created visual annotations with pagination support. Returns annotation data with has_images flag and image_paths array for token efficiency (use get_annotation_images to retrieve actual image data when needed). Use url parameter to filter by project. MULTI-PROJECT SAFETY: This tool detects when annotations exist across multiple localhost projects and provides warnings with specific URL filtering guidance. CRITICAL WORKFLOW: (1) First call WITHOUT url parameter to see all projects, (2) Use get_project_context tool to determine current project, (3) Call again WITH url parameter (e.g., "http://localhost:3000/*") to filter for current project only. This prevents cross-project contamination where you might implement changes in wrong codebase. Use limit and offset parameters for pagination when handling large annotation sets. Use this tool when users mention: annotations, comments, feedback, suggestions, notes, marked changes, or visual issues they\'ve identified.',
          inputSchema: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['pending', 'in-review', 'done', 'active', 'all'],
                default: 'active',
                description: 'Filter annotations by status. "active" returns both pending and in-review (default). "all" returns everything including done annotations.'
              },
              limit: {
                type: 'number',
                default: 50,
                minimum: 1,
                maximum: 200,
                description: 'Maximum number of annotations to return'
              },
              offset: {
                type: 'number',
                default: 0,
                minimum: 0,
                description: 'Number of annotations to skip for pagination'
              },
              url: {
                type: 'string',
                description: 'Filter by specific localhost URL. Supports exact match (e.g., "http://localhost:3000/dashboard") or pattern match with base URL (e.g., "http://localhost:3000/" or "http://localhost:3000/*" to get all annotations from that project)'
              }
            },
            additionalProperties: false
          }
        },
        {
          name: 'read_annotation_by_id',
          description: 'Retrieves a single annotation by its ID. This is a convenience tool for quick access when you have a specific annotation ID from the user (e.g., copied from the browser extension). Returns the full annotation data including element context, messages, images, and all metadata. Use this when the user provides an annotation ID directly.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Annotation ID (e.g., "pointa_1234567890_abc")'
              }
            },
            required: ['id'],
            additionalProperties: false
          }
        },
        {
          name: 'mark_annotations_for_review',
          description: 'Marks one or more annotations as "in-review" after the AI has successfully addressed them. This indicates the work has been completed by the AI and is ready for human verification. Use this tool when: (1) You have successfully implemented the changes requested in annotation(s), (2) The code changes are complete and ready for review, (3) You want to signal that these annotations need human verification. The annotations will remain visible until a human manually marks them as "done" through the UI. This prevents premature deletion and maintains a clear audit trail of AI work. For better UX, batch multiple annotation IDs in a single call rather than making separate calls.',
          inputSchema: {
            type: 'object',
            properties: {
              ids: {
                oneOf: [
                { type: 'string' },
                { type: 'array', items: { type: 'string' }, minItems: 1 }],

                description: 'Annotation ID(s) to mark for review. Can be a single string ID or an array of IDs for batch operations.'
              }
            },
            required: ['ids'],
            additionalProperties: false
          }
        },
        {
          name: 'get_annotation_images',
          description: 'Retrieves image files associated with a specific annotation. Returns images as base64-encoded data URLs (format: data:image/webp;base64,...) that can be DIRECTLY VIEWED by AI without any additional file reading. The data_url field contains complete, embedded images ready for immediate visual analysis. CRITICAL: The response includes viewable image data - do NOT attempt to use read_file or other tools on the data_url. Simply process the base64 data URL directly to see the image. ONLY call this tool if the annotation has has_images: true from read_annotations. Use this when you need to see the visual context of an annotation to better understand styling, layout, or design issues.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Annotation ID to get images for'
              }
            },
            required: ['id'],
            additionalProperties: false
          }
        },
        {
          name: 'read_bug_reports',
          description: 'Retrieves bug reports with full timeline data including console errors, network failures, and user interactions captured during recording. Use this tool when users mention: bugs, errors, crashes, issues, failures, or when you need to debug problems. Each bug report includes a detailed timeline showing the sequence of events (user clicks, API calls, console errors) that led to the bug, making it easier to identify root causes. Bug reports have statuses: "active" (needs attention), "debugging" (awaiting re-run with new logs), "in-review" (fix ready for testing), or "resolved" (fixed and verified). CRITICAL: If a bug has needs_more_logging=true, do NOT attempt another fix. Instead, use mark_bug_needs_rerun to add console.log statements, debugging output, or instrumentation to gather more information about why the previous fix failed. The failed_fix_attempts counter shows how many fixes have been tried.',
          inputSchema: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['active', 'resolved', 'all'],
                default: 'active',
                description: 'Filter bug reports by status. "active" returns open bugs needing attention (includes active, debugging, and in-review statuses). "resolved" returns fixed bugs. "all" returns everything.'
              },
              limit: {
                type: 'number',
                default: 50,
                minimum: 1,
                maximum: 200,
                description: 'Maximum number of bug reports to return'
              },
              url: {
                type: 'string',
                description: 'Filter by specific localhost URL where bug occurred'
              }
            },
            additionalProperties: false
          }
        },
        {
          name: 'mark_bug_needs_rerun',
          description: 'Mark bug for auto-replay after adding debugging/logging code. Use this when you\'ve added console.log, debugging statements, or instrumentation to gather more information about a bug. The Chrome extension will automatically replay the original user actions to capture new logs and data. This is different from mark_bug_for_review - use this when you need MORE information (added logging), not when you think you\'ve fixed it.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Bug report ID'
              },
              debug_notes: {
                type: 'string',
                description: 'Description of what debugging/logging was added (e.g., "Added console.log to track state changes in handleSubmit function")'
              },
              what_to_look_for: {
                type: 'string',
                description: 'Optional: What the user should check in the new logs/output (e.g., "Look for STATE_CHANGE logs in console")'
              }
            },
            required: ['id', 'debug_notes'],
            additionalProperties: false
          }
        },
        {
          name: 'mark_bug_for_review',
          description: 'Mark bug as fixed and ready for user testing. Use this when you have implemented an actual fix (not just debugging). The user will test the fix and mark it as resolved or reopen it. This is different from mark_bug_needs_rerun - use this when you think you\'ve FIXED the bug, not when you just added logging.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Bug report ID'
              },
              resolution_notes: {
                type: 'string',
                description: 'Description of what was fixed (e.g., "Fixed null reference error by adding validation check")'
              },
              changes_made: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional: List of specific changes made (e.g., ["Updated handleSubmit in Form.tsx", "Added error boundary"])'
              }
            },
            required: ['id', 'resolution_notes'],
            additionalProperties: false
          }
        },
        {
          name: 'mark_bug_resolved',
          description: 'Marks a bug report as "resolved" after successfully fixing the issue. Use this tool when: (1) You have identified and fixed the bug, (2) The fix has been implemented and tested, (3) You want to mark the bug as resolved so it no longer appears in active reports. This helps track which bugs have been addressed and maintains a clear record of resolved issues.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Bug report ID to mark as resolved'
              },
              resolution: {
                type: 'string',
                description: 'Optional description of how the bug was resolved'
              }
            },
            required: ['id'],
            additionalProperties: false
          }
        }]

      };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'read_annotations':{
              const result = await this.readAnnotations(args || {});
              const { annotations, projectInfo, multiProjectWarning } = result;

              return {
                content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    tool: 'read_annotations',
                    status: 'success',
                    data: annotations,
                    count: annotations.length,
                    projects: projectInfo,
                    multi_project_warning: multiProjectWarning,
                    filter_applied: args?.url || 'none',
                    timestamp: new Date().toISOString()
                  }, null, 2)
                }]

              };
            }

          case 'read_annotation_by_id':{
              const result = await this.readAnnotationById(args);
              return {
                content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    tool: 'read_annotation_by_id',
                    status: 'success',
                    data: result,
                    timestamp: new Date().toISOString()
                  }, null, 2)
                }]

              };
            }

          case 'mark_annotations_for_review':{
              const result = await this.markAnnotationsForReview(args);
              return {
                content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    tool: 'mark_annotations_for_review',
                    status: 'success',
                    data: result,
                    timestamp: new Date().toISOString()
                  }, null, 2)
                }]

              };
            }

          case 'get_annotation_images':{
              const result = await this.getAnnotationImages(args);
              return {
                content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    tool: 'get_annotation_images',
                    status: 'success',
                    data: result,
                    timestamp: new Date().toISOString()
                  }, null, 2)
                }]

              };
            }

          case 'read_bug_reports':{
              const result = await this.readBugReports(args || {});
              return {
                content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    tool: 'read_bug_reports',
                    status: 'success',
                    data: result.bugReports,
                    count: result.bugReports.length,
                    total: result.total,
                    filter_applied: args?.status || 'active',
                    timestamp: new Date().toISOString()
                  }, null, 2)
                }]

              };
            }

          case 'mark_bug_needs_rerun':{
              const result = await this.markBugNeedsRerun(args);
              return {
                content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    tool: 'mark_bug_needs_rerun',
                    status: 'success',
                    data: result,
                    timestamp: new Date().toISOString()
                  }, null, 2)
                }]

              };
            }

          case 'mark_bug_for_review':{
              const result = await this.markBugForReview(args);
              return {
                content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    tool: 'mark_bug_for_review',
                    status: 'success',
                    data: result,
                    timestamp: new Date().toISOString()
                  }, null, 2)
                }]

              };
            }

          case 'mark_bug_resolved':{
              const result = await this.markBugResolved(args);
              return {
                content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    tool: 'mark_bug_resolved',
                    status: 'success',
                    data: result,
                    timestamp: new Date().toISOString()
                  }, null, 2)
                }]

              };
            }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        throw new Error(`Tool execution failed: ${error.message}`);
      }
    });

    server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };
  }

  async loadAnnotations() {
    try {
      if (!existsSync(DATA_FILE)) {
        await this.ensureDataFile();
        return [];
      }
      const data = await readFile(DATA_FILE, 'utf8');

      // Handle empty or corrupted file
      if (!data || data.trim() === '') {
        console.warn('Empty annotations file, initializing with empty array');
        await this.saveAnnotations([]);
        return [];
      }

      try {
        return JSON.parse(data);
      } catch (parseError) {
        console.error('Corrupted JSON file, reinitializing:', parseError);
        // Backup corrupted file
        const backupFile = DATA_FILE + '.corrupted.' + Date.now();
        await writeFile(backupFile, data);


        // Reinitialize with empty array
        await this.saveAnnotations([]);
        return [];
      }
    } catch (error) {
      console.error('Error loading annotations:', error);
      return [];
    }
  }

  async saveAnnotations(annotations) {
    // Serialize all save operations to prevent race conditions
    this.saveLock = this.saveLock.then(async () => {
      return this._saveAnnotationsInternal(annotations);
    });

    return this.saveLock;
  }

  async _saveAnnotationsInternal(annotations) {
    // Move jsonData outside try block to make it accessible in catch

    const jsonData = JSON.stringify(annotations, null, 2);

    try {
      // Ensure directory exists right before operations  
      const dataDir = path.dirname(DATA_FILE);
      if (!existsSync(dataDir)) {

        await mkdir(dataDir, { recursive: true });
      }

      // Atomic write: write to temp file first, then rename
      const tempFile = DATA_FILE + '.tmp';

      await writeFile(tempFile, jsonData);

      // Rename temp file to actual file (atomic operation)

      const fs = await import('fs');
      await fs.promises.rename(tempFile, DATA_FILE);


    } catch (error) {
      console.error('Error saving annotations:', error);

      // Clean up temp file if it exists
      const tempFile = DATA_FILE + '.tmp';
      try {
        if (existsSync(tempFile)) {
          const fs = await import('fs');
          await fs.promises.unlink(tempFile);

        }
      } catch (cleanupError) {
        console.warn(`Failed to clean up temp file: ${cleanupError.message}`);
      }

      // Fallback: try direct write without atomic operation

      try {
        await writeFile(DATA_FILE, jsonData);

        return;
      } catch (fallbackError) {
        console.error('Fallback write also failed:', fallbackError);
      }

      throw error;
    }
  }

  async loadArchive() {
    try {
      if (!existsSync(ARCHIVE_FILE)) {
        return [];
      }

      const data = await readFile(ARCHIVE_FILE, 'utf8');
      if (!data || data.trim() === '') {
        return [];
      }

      try {
        return JSON.parse(data);
      } catch (parseError) {
        console.error('Failed to parse archive file:', parseError.message);
        return [];
      }
    } catch (error) {
      console.error('Error loading archive:', error);
      return [];
    }
  }

  async saveArchive(archive) {
    this.saveLock = this.saveLock.then(async () => {
      return this._saveArchiveInternal(archive);
    });
    return this.saveLock;
  }

  async _saveArchiveInternal(archive) {

    const jsonData = JSON.stringify(archive, null, 2);

    try {
      const dataDir = path.dirname(ARCHIVE_FILE);
      if (!existsSync(dataDir)) {
        await mkdir(dataDir, { recursive: true });
      }

      const tempFile = ARCHIVE_FILE + '.tmp';
      await writeFile(tempFile, jsonData);

      const fs = await import('fs');
      await fs.promises.rename(tempFile, ARCHIVE_FILE);


    } catch (error) {
      console.error('Error saving archive:', error);
      throw error;
    }
  }

  async loadBugReports() {
    try {
      if (!existsSync(BUG_REPORTS_FILE)) {
        await this.ensureBugReportsFile();
        return [];
      }
      const data = await readFile(BUG_REPORTS_FILE, 'utf8');

      // Handle empty or corrupted file
      if (!data || data.trim() === '') {
        console.warn('Empty bug reports file, initializing with empty array');
        await this.saveBugReports([]);
        return [];
      }

      try {
        return JSON.parse(data);
      } catch (parseError) {
        console.error('Corrupted bug reports JSON file, reinitializing:', parseError);
        // Backup corrupted file
        const backupFile = BUG_REPORTS_FILE + '.corrupted.' + Date.now();
        await writeFile(backupFile, data);


        // Reinitialize with empty array
        await this.saveBugReports([]);
        return [];
      }
    } catch (error) {
      console.error('Error loading bug reports:', error);
      return [];
    }
  }

  async saveBugReports(bugReports) {
    // Serialize all save operations to prevent race conditions
    this.bugReportsSaveLock = this.bugReportsSaveLock.then(async () => {
      return this._saveBugReportsInternal(bugReports);
    });

    return this.bugReportsSaveLock;
  }

  async _saveBugReportsInternal(bugReports) {

    const jsonData = JSON.stringify(bugReports, null, 2);

    try {
      // Ensure directory exists right before operations  
      const dataDir = path.dirname(BUG_REPORTS_FILE);
      if (!existsSync(dataDir)) {

        await mkdir(dataDir, { recursive: true });
      }

      // Atomic write: write to temp file first, then rename
      const tempFile = BUG_REPORTS_FILE + '.tmp';

      await writeFile(tempFile, jsonData);

      // Rename temp file to actual file (atomic operation)

      const fs = await import('fs');
      await fs.promises.rename(tempFile, BUG_REPORTS_FILE);


    } catch (error) {
      console.error('Error saving bug reports:', error);

      // Clean up temp file if it exists
      const tempFile = BUG_REPORTS_FILE + '.tmp';
      try {
        if (existsSync(tempFile)) {
          const fs = await import('fs');
          await fs.promises.unlink(tempFile);

        }
      } catch (cleanupError) {
        console.warn(`Failed to clean up temp file: ${cleanupError.message}`);
      }

      // Fallback: try direct write without atomic operation

      try {
        await writeFile(BUG_REPORTS_FILE, jsonData);

        return;
      } catch (fallbackError) {
        console.error('Fallback write also failed:', fallbackError);
      }

      throw error;
    }
  }

  async ensureBugReportsFile() {
    const dataDir = path.dirname(BUG_REPORTS_FILE);
    if (!existsSync(dataDir)) {

      await mkdir(dataDir, { recursive: true });
    }

    // Ensure bug screenshots directory exists
    if (!existsSync(BUG_SCREENSHOTS_DIR)) {

      await mkdir(BUG_SCREENSHOTS_DIR, { recursive: true });
    }

    if (!existsSync(BUG_REPORTS_FILE)) {

      await writeFile(BUG_REPORTS_FILE, JSON.stringify([], null, 2));
    } else {
      // File exists - log current bug report count for verification
      try {
        const existingData = await readFile(BUG_REPORTS_FILE, 'utf8');
        const bugReports = JSON.parse(existingData || '[]');

      } catch (error) {
        console.warn(`Warning: Could not read existing bug reports file: ${error.message}`);
      }
    }
  }

  async loadInspirations() {
    try {
      if (!existsSync(INSPIRATIONS_FILE)) {
        await this.ensureInspirationsFile();
        return [];
      }
      const data = await readFile(INSPIRATIONS_FILE, 'utf8');

      // Handle empty or corrupted file
      if (!data || data.trim() === '') {
        console.warn('Empty inspirations file, initializing with empty array');
        await this.saveInspirations([]);
        return [];
      }

      try {
        return JSON.parse(data);
      } catch (parseError) {
        console.error('Corrupted inspirations JSON file, reinitializing:', parseError);
        // Backup corrupted file
        const backupFile = INSPIRATIONS_FILE + '.corrupted.' + Date.now();
        await writeFile(backupFile, data);


        // Reinitialize with empty array
        await this.saveInspirations([]);
        return [];
      }
    } catch (error) {
      console.error('Error loading inspirations:', error);
      return [];
    }
  }

  async saveInspirations(inspirations) {
    // Serialize all save operations to prevent race conditions
    this.inspirationsSaveLock = this.inspirationsSaveLock.then(async () => {
      return this._saveInspirationsInternal(inspirations);
    });

    return this.inspirationsSaveLock;
  }

  async _saveInspirationsInternal(inspirations) {

    const jsonData = JSON.stringify(inspirations, null, 2);

    try {
      // Ensure directory exists right before operations  
      const dataDir = path.dirname(INSPIRATIONS_FILE);
      if (!existsSync(dataDir)) {

        await mkdir(dataDir, { recursive: true });
      }

      // Atomic write: write to temp file first, then rename
      const tempFile = INSPIRATIONS_FILE + '.tmp';

      await writeFile(tempFile, jsonData);

      // Rename temp file to actual file (atomic operation)

      const fs = await import('fs');
      await fs.promises.rename(tempFile, INSPIRATIONS_FILE);


    } catch (error) {
      console.error('Error saving inspirations:', error);

      // Clean up temp file if it exists
      const tempFile = INSPIRATIONS_FILE + '.tmp';
      try {
        if (existsSync(tempFile)) {
          const fs = await import('fs');
          await fs.promises.unlink(tempFile);

        }
      } catch (cleanupError) {
        console.warn(`Failed to clean up temp file: ${cleanupError.message}`);
      }

      // Fallback: try direct write without atomic operation

      try {
        await writeFile(INSPIRATIONS_FILE, jsonData);

        return;
      } catch (fallbackError) {
        console.error('Fallback write also failed:', fallbackError);
      }

      throw error;
    }
  }

  async ensureInspirationsFile() {
    const dataDir = path.dirname(INSPIRATIONS_FILE);
    if (!existsSync(dataDir)) {

      await mkdir(dataDir, { recursive: true });
    }

    // Ensure inspiration screenshots directory exists
    if (!existsSync(INSPIRATION_SCREENSHOTS_DIR)) {

      await mkdir(INSPIRATION_SCREENSHOTS_DIR, { recursive: true });
    }

    if (!existsSync(INSPIRATIONS_FILE)) {

      await writeFile(INSPIRATIONS_FILE, JSON.stringify([], null, 2));
    } else {
      // File exists - log current inspiration count for verification
      try {
        const existingData = await readFile(INSPIRATIONS_FILE, 'utf8');
        const inspirations = JSON.parse(existingData || '[]');

      } catch (error) {
        console.warn(`Warning: Could not read existing inspirations file: ${error.message}`);
      }
    }
  }

  /**
   * Apply an annotations update using serialized read→mutate→save operations
   * This prevents race conditions during concurrent operations by chaining
   * all updates onto the existing saveLock Promise.
   *
   * @param {Function} mutator - Function that receives current annotations and returns result
   * @returns {Promise} Promise that resolves with the mutator's return value
   */
  async applyAnnotationsUpdate(mutator) {
    // Chain onto saveLock to serialize read→mutate→save
    this.saveLock = this.saveLock.then(async () => {
      const current = await this.loadAnnotations();
      const result = await mutator(current);
      await this._saveAnnotationsInternal(current);
      return result;
    });
    return this.saveLock;
  }

  async ensureDataFile() {
    const dataDir = path.dirname(DATA_FILE);
    if (!existsSync(dataDir)) {

      await mkdir(dataDir, { recursive: true });
    }

    if (!existsSync(DATA_FILE)) {

      await writeFile(DATA_FILE, JSON.stringify([], null, 2));
    } else {
      // File exists - log current annotation count for verification
      try {
        const existingData = await readFile(DATA_FILE, 'utf8');
        const annotations = JSON.parse(existingData || '[]');

      } catch (error) {
        console.warn(`Warning: Could not read existing annotation file: ${error.message}`);
      }
    }
  }

  // MCP Tool implementations
  async readAnnotationById(args) {
    const { id } = args;
    if (!id) {
      throw new Error('Annotation ID is required');
    }

    const annotations = await this.loadAnnotations();
    const annotation = annotations.find((a) => a.id === id);

    if (!annotation) {
      throw new Error(`Annotation with ID "${id}" not found`);
    }

    // Add image availability info
    const referenceImages = annotation.reference_images || [];
    const imagePaths = referenceImages.map((img) => img.file_path).filter(Boolean);
    const hasImages = imagePaths.length > 0;

    // Remove old screenshot data if it exists (deprecated)
    const { screenshot, ...annotationWithoutScreenshot } = annotation;

    return {
      ...annotationWithoutScreenshot,
      has_images: hasImages,
      image_count: imagePaths.length,
      image_paths: imagePaths
    };
  }

  async readAnnotations(args) {
    const annotations = await this.loadAnnotations();
    const { status = 'active', limit = 50, offset = 0, url } = args;

    let filtered = annotations;

    // Filter by status
    if (status === 'active') {
      // Return both pending and in-review (exclude done)
      filtered = filtered.filter((a) => a.status === 'pending' || a.status === 'in-review');
    } else if (status !== 'all') {
      // Filter by specific status (pending, in-review, or done)
      filtered = filtered.filter((a) => a.status === status);
    }
    // If status is 'all', don't filter at all

    if (url) {
      // Support both exact URL matching and base URL pattern matching
      if (url.includes('*') || url.endsWith('/')) {
        // Pattern matching: "http://localhost:3000/*" or "http://localhost:3000/"
        const baseUrl = url.replace('*', '').replace(/\/$/, '');
        filtered = filtered.filter((a) => a.url.startsWith(baseUrl));
      } else {
        // Exact URL matching
        filtered = filtered.filter((a) => a.url === url);
      }
    }

    // Group annotations by base URL for better context
    const groupedByProject = {};
    filtered.forEach((annotation) => {
      try {
        const urlObj = new URL(annotation.url);
        const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
        if (!groupedByProject[baseUrl]) {
          groupedByProject[baseUrl] = [];
        }
        groupedByProject[baseUrl].push(annotation);
      } catch (e) {


        // Handle invalid URLs gracefully
      }});
    // Add project context to response
    const projectCount = Object.keys(groupedByProject).length;
    let multiProjectWarning = null;

    if (projectCount > 1 && !url) {
      const projectSuggestions = Object.keys(groupedByProject).map((baseUrl) => `"${baseUrl}/*"`).join(' or ');
      multiProjectWarning = {
        warning: `MULTI-PROJECT DETECTED: Found annotations from ${projectCount} different projects. This may cause cross-project contamination.`,
        recommendation: `Use the 'url' parameter to filter annotations for your current project.`,
        suggested_filters: Object.keys(groupedByProject).map((baseUrl) => `${baseUrl}/*`),
        guidance: `Example: Use url: "${Object.keys(groupedByProject)[0]}/*" to filter for the first project.`,
        projects_detected: Object.keys(groupedByProject)
      };
      console.warn(`MULTI-PROJECT WARNING: Found annotations from ${projectCount} different projects. Use url parameter: ${projectSuggestions}`);
    }

    // Build project info for better context
    const projectInfo = Object.entries(groupedByProject).map(([baseUrl, annotations]) => ({
      base_url: baseUrl,
      annotation_count: annotations.length,
      paths: [...new Set(annotations.map((a) => new URL(a.url).pathname))].slice(0, 5), // Show up to 5 unique paths
      recommended_filter: `${baseUrl}/*`
    }));

    // Apply pagination with offset
    const total = filtered.length;
    const paginatedResults = filtered.slice(offset, offset + limit);

    // Calculate pagination metadata
    const pagination = {
      total: total,
      limit: limit,
      offset: offset,
      has_more: offset + limit < total
    };

    // Transform annotations to add image availability info
    const annotationsWithImageInfo = paginatedResults.map((annotation) => {
      // Check if annotation has reference images
      // reference_images is an array of objects with file_path, thumbnail, etc.
      const referenceImages = annotation.reference_images || [];
      const imagePaths = referenceImages.map((img) => img.file_path).filter(Boolean);
      const hasImages = imagePaths.length > 0;

      // Remove old screenshot data if it exists (deprecated)
      const { screenshot, ...annotationWithoutScreenshot } = annotation;

      return {
        ...annotationWithoutScreenshot,
        has_images: hasImages,
        image_count: imagePaths.length,
        image_paths: imagePaths // Just the paths, not full objects
      };
    });

    return {
      annotations: annotationsWithImageInfo,
      pagination: pagination,
      projectInfo: projectInfo,
      multiProjectWarning: multiProjectWarning
    };
  }

  async markAnnotationsForReview(args) {
    const { ids } = args;

    // Normalize to array if single ID string provided
    const idArray = Array.isArray(ids) ? ids : [ids];

    // Validate all IDs are non-empty strings
    if (idArray.some((id) => !id || typeof id !== 'string')) {
      throw new Error('All annotation IDs must be non-empty strings');
    }

    const annotations = await this.loadAnnotations();
    const results = [];
    const notFound = [];

    // Process each annotation ID
    for (const id of idArray) {
      const index = annotations.findIndex((a) => a.id === id);

      if (index === -1) {
        notFound.push(id);
        continue;
      }

      const annotation = annotations[index];
      const previousStatus = annotation.status;

      // Update status to in-review
      annotation.status = 'in-review';
      annotation.updated_at = new Date().toISOString();

      results.push({
        id,
        previous_status: previousStatus,
        current_status: 'in-review',
        annotation: {
          id: annotation.id,
          comment: annotation.comment,
          status: annotation.status,
          updated_at: annotation.updated_at
        }
      });
    }

    // Save all changes at once
    await this.saveAnnotations(annotations);

    // Prepare response
    const response = {
      success_count: results.length,
      results
    };

    if (notFound.length > 0) {
      response.not_found = notFound;
      response.message = `Successfully marked ${results.length} annotation(s) as in-review. ${notFound.length} annotation(s) not found: ${notFound.join(', ')}`;
    } else {
      response.message = `Successfully marked ${results.length} annotation(s) as in-review`;
    }

    return response;
  }

  /**
   * Get image files for a specific annotation
   * @param {Object} args - Arguments object
   * @param {string} args.id - Annotation ID to get images for
   * @returns {Object} Image data response with annotation_id, images array, and message
   */
  async getAnnotationImages(args) {
    const { id } = args;

    // Validate input
    if (!id || typeof id !== 'string') {
      return {
        annotation_id: id || '',
        images: [],
        message: 'Invalid annotation ID: must be a non-empty string'
      };
    }

    try {
      // Load annotations - we only need to find the specific one
      const annotations = await this.loadAnnotations();

      // Find annotation by ID
      const annotation = annotations.find((a) => a.id === id);

      if (!annotation) {
        return {
          annotation_id: id,
          images: [],
          message: 'Annotation not found'
        };
      }

      // Check if annotation has reference images
      // reference_images is an array of objects with file_path, thumbnail, etc.
      const referenceImages = annotation.reference_images || [];
      const imagePaths = referenceImages.map((img) => img.file_path).filter(Boolean);

      if (imagePaths.length === 0) {
        return {
          annotation_id: id,
          images: [],
          message: 'No images available for this annotation. TIP: Check has_images flag from read_annotations before calling this tool to avoid unnecessary calls.'
        };
      }

      // Read each image file and convert to base64
      const imageData = [];
      for (const imagePath of imagePaths) {
        try {
          // imagePath format: "images/{annotationId}/{filename}"
          const fullPath = path.join(DATA_DIR, imagePath);

          if (!existsSync(fullPath)) {
            console.warn(`Image file not found: ${fullPath}`);
            continue;
          }

          // Read file as buffer
          const imageBuffer = await readFile(fullPath);

          // Convert to base64
          const base64Data = imageBuffer.toString('base64');

          // Determine MIME type from file extension
          const ext = path.extname(imagePath).toLowerCase();
          const mimeTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.webp': 'image/webp',
            '.gif': 'image/gif'
          };
          const mimeType = mimeTypes[ext] || 'image/jpeg';

          // Create data URL
          const dataUrl = `data:${mimeType};base64,${base64Data}`;

          imageData.push({
            path: imagePath,
            filename: path.basename(imagePath),
            data_url: dataUrl,
            mime_type: mimeType,
            size_bytes: imageBuffer.length
          });

        } catch (error) {
          console.error(`Error reading image ${imagePath}:`, error);
        }
      }

      if (imageData.length === 0) {
        return {
          annotation_id: id,
          images: [],
          message: 'Image files could not be read from disk'
        };
      }

      return {
        annotation_id: id,
        images: imageData,
        message: `Successfully retrieved ${imageData.length} image(s). Each image contains a 'data_url' field with embedded base64 image data that can be directly viewed/processed by AI. No additional file reading required - the images are ready to view in the data_url fields.`
      };

    } catch (error) {
      return {
        annotation_id: id,
        images: [],
        message: `Failed to retrieve images: ${error.message}`
      };
    }
  }

  async readBugReports(args) {
    const bugReports = await this.loadBugReports();
    const { status = 'active', limit = 50, url } = args;

    let filtered = bugReports;

    // Filter by status - 'active' includes both 'active' and 'debugging'
    if (status === 'active') {
      filtered = filtered.filter((r) => r.status === 'active' || r.status === 'debugging');
    } else if (status !== 'all') {
      filtered = filtered.filter((r) => r.status === status);
    }

    // Filter by URL if provided
    if (url) {
      filtered = filtered.filter((r) => r.context?.page?.url === url);
    }

    // Apply pagination
    const total = filtered.length;
    const paginated = filtered.slice(0, limit);

    return {
      bugReports: paginated,
      total: total,
      count: paginated.length
    };
  }

  async markBugNeedsRerun(args) {
    const { id, debug_notes, what_to_look_for } = args;

    const bugReports = await this.loadBugReports();
    const index = bugReports.findIndex((r) => r.id === id);

    if (index === -1) {
      throw new Error(`Bug report with id ${id} not found`);
    }

    const bugReport = bugReports[index];
    const previousStatus = bugReport.status;

    // Ensure ai_actions array exists
    if (!bugReport.ai_actions) {
      bugReport.ai_actions = [];
    }

    // Add AI action entry
    bugReport.ai_actions.push({
      timestamp: new Date().toISOString(),
      type: 'debugging',
      notes: debug_notes,
      what_to_look_for: what_to_look_for || 'Check new console logs and debugging output'
    });

    // Update status to debugging and clear the needs_more_logging flag
    bugReport.status = 'debugging';
    bugReport.needs_more_logging = false;
    bugReport.updated = new Date().toISOString();

    await this.saveBugReports(bugReports);

    return {
      id,
      previous_status: previousStatus,
      current_status: 'debugging',
      message: `Bug report ${id} is ready for auto-replay. Chrome extension will replay original actions to capture new logs.`,
      bug_report: {
        id: bugReport.id,
        title: bugReport.report?.title || 'Untitled bug',
        status: bugReport.status,
        debug_notes: debug_notes,
        what_to_look_for: what_to_look_for,
        recordings_count: bugReport.recordings?.length || 1
      }
    };
  }

  async markBugForReview(args) {
    const { id, resolution_notes, changes_made } = args;

    const bugReports = await this.loadBugReports();
    const index = bugReports.findIndex((r) => r.id === id);

    if (index === -1) {
      throw new Error(`Bug report with id ${id} not found`);
    }

    const bugReport = bugReports[index];
    const previousStatus = bugReport.status;

    // Ensure ai_actions array exists
    if (!bugReport.ai_actions) {
      bugReport.ai_actions = [];
    }

    // Add AI action entry
    bugReport.ai_actions.push({
      timestamp: new Date().toISOString(),
      type: 'fix_attempted',
      notes: resolution_notes,
      changes_made: changes_made || []
    });

    // Update status to in-review and clear the needs_more_logging flag
    bugReport.status = 'in-review';
    bugReport.needs_more_logging = false;
    bugReport.updated = new Date().toISOString();

    await this.saveBugReports(bugReports);

    return {
      id,
      previous_status: previousStatus,
      current_status: 'in-review',
      message: `Bug report ${id} is marked for review. User will test and verify the fix.`,
      bug_report: {
        id: bugReport.id,
        title: bugReport.report?.title || 'Untitled bug',
        status: bugReport.status,
        resolution_notes: resolution_notes,
        changes_made: changes_made
      }
    };
  }

  async markBugResolved(args) {
    const { id, resolution } = args;

    const bugReports = await this.loadBugReports();
    const index = bugReports.findIndex((r) => r.id === id);

    if (index === -1) {
      throw new Error(`Bug report with id ${id} not found`);
    }

    const bugReport = bugReports[index];
    const previousStatus = bugReport.status;

    // Update status to resolved
    bugReport.status = 'resolved';
    bugReport.updated = new Date().toISOString();
    bugReport.resolved_at = new Date().toISOString();

    if (resolution) {
      bugReport.resolution = resolution;
    }

    await this.saveBugReports(bugReports);

    return {
      id,
      previous_status: previousStatus,
      current_status: 'resolved',
      message: `Bug report ${id} has been marked as resolved`,
      bug_report: {
        id: bugReport.id,
        title: bugReport.report?.title || 'Untitled bug',
        status: bugReport.status,
        resolved_at: bugReport.resolved_at,
        resolution: bugReport.resolution
      }
    };
  }

  setupProcessHandlers() {
    if (this.handlersSetup) return;
    this.handlersSetup = true;

    const gracefulShutdown = async (signal) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;



      // Set a force exit timer as a last resort
      const forceExitTimer = setTimeout(() => {

        process.exit(1);
      }, 5000); // Increased to 5 seconds

      try {
        // Step 1: Close all MCP transport sessions

        const transportPromises = Object.entries(this.transports).map(([sessionId, transport]) => {
          return new Promise((resolve) => {
            try {
              if (transport && typeof transport.close === 'function') {
                transport.close();
              }
              delete this.transports[sessionId];
              resolve();
            } catch (error) {
              console.warn(`Error closing transport ${sessionId}:`, error.message);
              resolve();
            }
          });
        });

        await Promise.all(transportPromises);


        // Step 2: Close all HTTP connections

        this.connections.forEach((connection) => {
          try {
            connection.destroy();
          } catch (error) {
            console.warn('Error destroying connection:', error.message);
          }
        });
        this.connections.clear();

        // Step 3: Close the HTTP server
        if (this.server) {

          await new Promise((resolve) => {
            this.server.close((error) => {
              if (error) {
                console.warn('Error closing server:', error.message);
              }
              resolve();
            });
          });

        }

        // Clean shutdown completed
        clearTimeout(forceExitTimer);

        process.exit(0);

      } catch (error) {
        console.error('Error during graceful shutdown:', error);
        clearTimeout(forceExitTimer);
        process.exit(1);
      }
    };

    // Handle shutdown signals
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled rejection at:', promise, 'reason:', reason);
      gracefulShutdown('unhandledRejection');
    });
  }

  async checkForUpdates() {
    try {
      // Check cache first (24hr TTL)
      const updateCacheFile = path.join(DATA_DIR, '.update-check');
      let lastCheck = 0;

      try {
        if (existsSync(updateCacheFile)) {
          const cacheData = await readFile(updateCacheFile, 'utf8');
          lastCheck = parseInt(cacheData, 10) || 0;
        }
      } catch (error) {


        // Ignore cache read errors
      } // Only check once per day
      if (Date.now() - lastCheck < 86400000) return;

      // Fetch latest version from NPM registry
      const response = await fetch('https://registry.npmjs.org/pointa-server/latest', {
        headers: {
          'User-Agent': 'pointa-server'
        }
      });

      // If package not found (404), skip update check
      if (response.status === 404) {

        await writeFile(updateCacheFile, Date.now().toString());
        return;
      }

      if (!response.ok) {

        return;
      }

      const data = await response.json();
      const latestVersion = data.version || packageJson.version;

      // Simple version comparison (assuming semantic versioning)
      const currentParts = packageJson.version.split('.').map(Number);
      const latestParts = latestVersion.split('.').map(Number);

      let hasUpdate = false;
      for (let i = 0; i < 3; i++) {
        if ((latestParts[i] || 0) > (currentParts[i] || 0)) {
          hasUpdate = true;
          break;
        }
        if ((latestParts[i] || 0) < (currentParts[i] || 0)) {
          break;
        }
      }

      if (hasUpdate) {






      }

      // Save last check timestamp
      await writeFile(updateCacheFile, Date.now().toString());
    } catch (error) {


    }
  }

  async start() {
    await this.ensureDataFile();
    await this.ensureBugReportsFile();
    await this.ensureInspirationsFile();

    // Set up process handlers only once
    this.setupProcessHandlers();

    // Check for updates (non-blocking)
    this.checkForUpdates().catch(() => {});

    this.server = this.app.listen(PORT, () => {











    });

    // Handle port already in use
    this.server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`\n❌ Error: Port ${PORT} is already in use!`);
        console.error(`\nAnother application is using port ${PORT}.`);
        console.error(`\nTo fix this:`);
        console.error(`  1. Find what's using the port: lsof -i :${PORT}`);
        console.error(`  2. Stop that application`);
        console.error(`  3. Or set a custom port: POINTA_PORT=4243 pointa-server start`);
        console.error(`\nFor Chrome extension, you'll need to update the port in extension settings.\n`);
        process.exit(1);
      } else {
        console.error('Server error:', error);
        process.exit(1);
      }
    });

    // Track connections for graceful shutdown
    this.server.on('connection', (connection) => {
      this.connections.add(connection);

      connection.on('close', () => {
        this.connections.delete(connection);
      });

      connection.on('error', () => {
        this.connections.delete(connection);
      });
    });
  }
}

// Start server in stdio mode (for MCP via stdin/stdout)
async function startStdioMode() {
  try {
    const serverInstance = new LocalAnnotationsServer();
    await serverInstance.ensureDataFile();
    await serverInstance.ensureBugReportsFile();
    await serverInstance.ensureInspirationsFile();

    // Create MCP server for stdio transport
    const mcpServer = new Server(
      {
        name: 'pointa-annotations',
        version: packageJson.version
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    // Set up MCP handlers
    serverInstance.setupMCPHandlersForServer(mcpServer);

    // Connect to stdio transport
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);

    // Setup graceful shutdown
    const cleanup = async () => {
      await transport.close();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

  } catch (error) {
    console.error('Failed to start stdio server:', error);
    process.exit(1);
  }
}

// Start server normally (HTTP mode for daemon)
async function startHttpMode() {
  try {
    const server = new LocalAnnotationsServer();
    await server.start();
  } catch (error) {
    console.error('Failed to start HTTP server:', error);
    process.exit(1);
  }
}

// Main entry point - detect mode from environment
async function main() {
  const isStdioMode = process.env.POINTA_STDIO_MODE === 'true';

  if (isStdioMode) {
    // Run in stdio mode (for MCP via Cursor)
    await startStdioMode();
  } else {
    // Run in HTTP mode (daemon for Chrome extension + optional MCP)
    await startHttpMode();
  }
}

main().catch(console.error);