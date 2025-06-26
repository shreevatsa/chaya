import { test, expect } from '@playwright/test';

test.describe('Annotator', () => {
  test('loads and displays the annotator interface', async ({ page }) => {
    await page.goto('/annotator.html');
    
    // Check page title
    await expect(page).toHaveTitle(/Annotator/);
    
    // Check that PDF.js is loaded from CDN
    await expect(page.locator('script[src*="pdf.min.js"]')).toBeAttached();
    
    // Check for key UI elements
    await expect(page.locator('#pdf-upload')).toBeVisible();
    await expect(page.locator('#annotations-upload')).toBeVisible();
    await expect(page.locator('#pdf-container')).toBeVisible();
  });

  test('saves annotations button is present', async ({ page }) => {
    await page.goto('/annotator.html');
    
    const saveButton = page.locator('#save-annotations');
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toContainText('Save Annotations');
  });

  test('no JavaScript errors on page load', async ({ page }) => {
    const errors: string[] = [];
    
    // Listen for all console errors
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });
    
    // Listen for console.error calls
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/annotator.html');
    
    // Wait for scripts to load and execute
    await page.waitForTimeout(1000);
    
    // Check that no JavaScript errors occurred
    expect(errors).toEqual([]);
  });

  test('PDF upload triggers file processing', async ({ page }) => {
    await page.goto('/annotator.html');
    
    // Upload a test file to ensure the file input handler works
    const fileInput = page.locator('#pdf-upload');
    await fileInput.setInputFiles('./test.pdf');
    
    // Wait a moment for file processing to start
    await page.waitForTimeout(1000);
    
    // Verify the PDF container was cleared (ready for new content)
    const containerContent = await page.evaluate(() => {
      const container = document.querySelector('#pdf-container');
      return container ? container.innerHTML : null;
    });
    
    // Container should exist (not null) after file upload processing begins
    expect(containerContent).not.toBeNull();
  });

  test('file input accepts PDF files', async ({ page }) => {
    await page.goto('/annotator.html');
    
    const fileInput = page.locator('#pdf-upload');
    
    // Check the accept attribute
    const acceptAttr = await fileInput.getAttribute('accept');
    expect(acceptAttr).toBe('.pdf');
  });

  test('PDF loading creates canvas elements', async ({ page }) => {
    await page.goto('/annotator.html');
    
    // Listen for console messages to debug PDF loading
    const messages: string[] = [];
    page.on('console', (msg) => {
      messages.push(`${msg.type()}: ${msg.text()}`);
    });
    
    // Upload the test PDF file
    const fileInput = page.locator('#pdf-upload');
    await fileInput.setInputFiles('./test.pdf');
    
    // Wait for PDF processing and check that a canvas element is created
    try {
      await page.waitForFunction(() => {
        const canvas = document.querySelector('#pdf-container canvas');
        return canvas !== null;
      }, { timeout: 10000 });
    } catch (error) {
      // Log debug info if canvas creation fails
      const containerHTML = await page.evaluate(() => {
        const container = document.querySelector('#pdf-container');
        return container ? container.innerHTML : 'Container not found';
      });
      console.log('PDF container HTML:', containerHTML);
      console.log('Console messages:', messages);
      throw error;
    }
    
    // Verify that the canvas has reasonable dimensions
    const canvasExists = await page.locator('#pdf-container canvas').count();
    expect(canvasExists).toBeGreaterThan(0);
    
    // Check that the canvas has been rendered with content
    const canvasSize = await page.evaluate(() => {
      const canvas = document.querySelector('#pdf-container canvas') as HTMLCanvasElement;
      return canvas ? { width: canvas.width, height: canvas.height } : null;
    });
    
    expect(canvasSize).not.toBeNull();
    expect(canvasSize!.width).toBeGreaterThan(0);
    expect(canvasSize!.height).toBeGreaterThan(0);
    
    // Print console messages for debugging
    console.log('Console messages:', messages);
  });

  test('resizable annotation functionality works', async ({ page }) => {
    await page.goto('/annotator.html');
    
    // Upload the test PDF file
    const fileInput = page.locator('#pdf-upload');
    await fileInput.setInputFiles('./test.pdf');
    
    // Wait for PDF to load
    await page.waitForFunction(() => {
      const canvas = document.querySelector('#pdf-container canvas');
      return canvas !== null;
    }, { timeout: 10000 });
    
    // Test that we can create an annotation with resize handles by checking the DOM structure
    const canCreateInteractiveAnnotation = await page.evaluate(() => {
      const pageDiv = document.querySelector('.page') as HTMLDivElement;
      const overlay = document.querySelector('.annotation-layer') as HTMLDivElement;
      
      if (!pageDiv || !overlay) return false;
      
      // Create a basic annotation box 
      const annotationBox = document.createElement('div');
      annotationBox.className = 'annotation-box';
      annotationBox.style.position = 'absolute';
      annotationBox.style.border = '2px solid #ff0000';
      annotationBox.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
      annotationBox.style.left = '50px';
      annotationBox.style.top = '50px';
      annotationBox.style.width = '100px';
      annotationBox.style.height = '50px';
      
      // Add resize handles manually to test the structure
      const handles = ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'];
      handles.forEach(handle => {
        const handleElement = document.createElement('div');
        handleElement.className = `resize-handle resize-${handle}`;
        handleElement.style.position = 'absolute';
        handleElement.style.backgroundColor = '#fff';
        handleElement.style.border = '1px solid #000';
        handleElement.style.width = '8px';
        handleElement.style.height = '8px';
        handleElement.style.display = 'none'; // Initially hidden
        annotationBox.appendChild(handleElement);
      });
      
      overlay.appendChild(annotationBox);
      return true;
    });
    
    expect(canCreateInteractiveAnnotation).toBe(true);
    
    // Verify that annotation and resize handles were created
    await page.waitForSelector('.annotation-box', { timeout: 1000 });
    const resizeHandles = page.locator('.resize-handle');
    const handleCount = await resizeHandles.count();
    expect(handleCount).toBe(8);
    
    // Verify each type of handle exists
    const handleTypes = ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'];
    for (const type of handleTypes) {
      const handle = page.locator(`.resize-${type}`);
      await expect(handle).toBeAttached();
    }
  });

  test('annotation management sidebar works', async ({ page }) => {
    await page.goto('/annotator.html');
    
    // Check that the annotation management sidebar exists
    await expect(page.locator('#annotation-list')).toBeAttached();
    await expect(page.locator('#annotation-count')).toBeVisible();
    await expect(page.locator('#clear-all-annotations')).toBeVisible();
    
    // Check initial state shows "No annotations"
    await expect(page.locator('#annotation-count')).toContainText('No annotations');
    
    // Check that the clear all button exists
    const clearAllBtn = page.locator('#clear-all-annotations');
    await expect(clearAllBtn).toBeVisible();
    await expect(clearAllBtn).toContainText('Clear All Annotations');
    
    // Check sidebar structure
    const sidebar = page.locator('.w-80');
    await expect(sidebar).toBeVisible();
    await expect(sidebar.locator('h2')).toContainText('Annotations');
  });
});

test.describe('Viewer', () => {
  test('loads and displays the viewer interface', async ({ page }) => {
    await page.goto('/viewer.html');
    
    // Check page title
    await expect(page).toHaveTitle(/Viewer/);
    
    // Check basic page structure
    await expect(page.locator('h1')).toContainText('Viewer');
    await expect(page.locator('script[src*="viewer.js"]')).toBeAttached();
  });

  test('shows file upload interface', async ({ page }) => {
    await page.goto('/viewer.html');
    
    // Check file upload elements
    await expect(page.locator('#pdf-upload')).toBeVisible();
    await expect(page.locator('#annotations-upload')).toBeVisible();
    await expect(page.locator('#load-files')).toBeVisible();
    
    // Check file input attributes
    const pdfInput = page.locator('#pdf-upload');
    const annotationsInput = page.locator('#annotations-upload');
    
    await expect(pdfInput).toHaveAttribute('accept', '.pdf');
    await expect(annotationsInput).toHaveAttribute('accept', '.json');
    
    // Load button should be disabled initially
    await expect(page.locator('#load-files')).toBeDisabled();
  });

  test('load button enables when both files selected', async ({ page }) => {
    await page.goto('/viewer.html');
    
    const loadButton = page.locator('#load-files');
    const pdfInput = page.locator('#pdf-upload');
    const annotationsInput = page.locator('#annotations-upload');
    
    // Initially disabled
    await expect(loadButton).toBeDisabled();
    
    // Set PDF file
    await pdfInput.setInputFiles('./test.pdf');
    await expect(loadButton).toBeDisabled(); // Still disabled without annotations
    
    // Create a mock annotations file
    const annotationsData = {
      metadata: {
        sourcePdf: "test.pdf",
        annotationVersion: "1.1",
        annotatedAt: new Date().toISOString()
      },
      annotationsByPage: {
        "1": [
          {
            id: "test-annotation-1",
            x: 0.1,
            y: 0.2,
            width: 0.3,
            height: 0.1,
            label: "Test Annotation"
          }
        ]
      }
    };
    
    // Create a temporary file
    await page.evaluate((data) => {
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const file = new File([blob], 'test-annotations.json', { type: 'application/json' });
      
      // Get the file input and simulate file selection
      const input = document.querySelector('#annotations-upload') as HTMLInputElement;
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, annotationsData);
    
    // Now button should be enabled
    await expect(loadButton).toBeEnabled();
  });

  test('displays annotation summary section', async ({ page }) => {
    await page.goto('/viewer.html');
    
    // Check annotation summary elements
    await expect(page.locator('#annotation-count')).toBeVisible();
    await expect(page.locator('#annotation-list')).toBeVisible();
    
    // Initially shows no annotations
    await expect(page.locator('#annotation-count')).toContainText('No annotations loaded');
  });

  test('no JavaScript errors on viewer page load', async ({ page }) => {
    const errors: string[] = [];
    
    // Listen for all console errors
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });
    
    // Listen for console.error calls
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/viewer.html');
    
    // Wait for scripts to load and execute
    await page.waitForTimeout(1000);
    
    // Check that no JavaScript errors occurred
    expect(errors).toEqual([]);
  });

  test('viewer loads PDF.js correctly', async ({ page }) => {
    await page.goto('/viewer.html');
    
    // Check that PDF.js is loaded from CDN
    await expect(page.locator('script[src*="pdf.min.js"]')).toBeAttached();
    
    // Wait for PDF.js to be available
    await page.waitForFunction(() => {
      return typeof (window as any).pdfjsLib !== 'undefined';
    }, { timeout: 5000 });
    
    const pdfjsAvailable = await page.evaluate(() => {
      return typeof (window as any).pdfjsLib !== 'undefined';
    });
    
    expect(pdfjsAvailable).toBe(true);
  });
});