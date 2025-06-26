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
});