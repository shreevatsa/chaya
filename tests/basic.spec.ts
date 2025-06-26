import { test, expect } from '@playwright/test';

test.describe('Annotator', () => {
  test('loads and displays the annotator interface', async ({ page }) => {
    await page.goto('/annotator.html');
    
    // Check page title
    await expect(page).toHaveTitle(/Annotator/);
    
    // Check that PDF.js is loaded
    await expect(page.locator('script[src*="pdf.mjs"]')).toBeAttached();
    
    // Check for key UI elements
    await expect(page.locator('input[type="file"]')).toBeVisible();
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

  test('catches errors when PDF is uploaded', async ({ page }) => {
    const errors: string[] = [];
    
    // Listen for all types of errors
    page.on('pageerror', (error) => {
      errors.push(`PageError: ${error.message}`);
    });
    
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(`ConsoleError: ${msg.text()}`);
      }
    });
    
    // Listen for unhandled promise rejections
    await page.addInitScript(() => {
      window.addEventListener('unhandledrejection', (event) => {
        console.error('UnhandledPromiseRejection:', event.reason);
      });
    });

    await page.goto('/annotator.html');
    
    // Create a minimal PDF
    const testPdf = Buffer.from([
      0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A,
      0x31, 0x20, 0x30, 0x20, 0x6F, 0x62, 0x6A, 0x0A,
      0x3C, 0x3C, 0x2F, 0x54, 0x79, 0x70, 0x65, 0x2F, 0x43, 0x61, 0x74, 0x61, 0x6C, 0x6F, 0x67, 0x2F, 0x50, 0x61, 0x67, 0x65, 0x73, 0x20, 0x32, 0x20, 0x30, 0x20, 0x52, 0x3E, 0x3E, 0x0A,
      0x65, 0x6E, 0x64, 0x6F, 0x62, 0x6A, 0x0A,
      0x25, 0x25, 0x45, 0x4F, 0x46
    ]);
    
    // Upload the test PDF
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test.pdf',
      mimeType: 'application/pdf',
      buffer: testPdf,
    });
    
    // Wait a bit for the upload to process and errors to occur
    await page.waitForTimeout(2000);
    
    // Should have caught the "pdfjsLib.getDocument is not a function" error
    expect(errors.length).toBeGreaterThan(0);
    
    // Check if we caught the specific error
    const hasGetDocumentError = errors.some(error => 
      error.includes('getDocument') || error.includes('not a function')
    );
    expect(hasGetDocumentError).toBe(true);
  });

  test('file input accepts PDF files', async ({ page }) => {
    await page.goto('/annotator.html');
    
    const fileInput = page.locator('input[type="file"]');
    
    // Check the accept attribute
    const acceptAttr = await fileInput.getAttribute('accept');
    expect(acceptAttr).toBe('.pdf');
  });

  test('PDF loading creates canvas elements', async ({ page }) => {
    await page.goto('/annotator.html');
    
    // Create a minimal valid PDF
    const testPdf = Buffer.from([
      0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A, // %PDF-1.4
      0x31, 0x20, 0x30, 0x20, 0x6F, 0x62, 0x6A, 0x0A, // 1 0 obj
      0x3C, 0x3C, 0x2F, 0x54, 0x79, 0x70, 0x65, 0x2F, 0x43, 0x61, 0x74, 0x61, 0x6C, 0x6F, 0x67, 0x2F, 0x50, 0x61, 0x67, 0x65, 0x73, 0x20, 0x32, 0x20, 0x30, 0x20, 0x52, 0x3E, 0x3E, 0x0A, // <</Type/Catalog/Pages 2 0 R>>
      0x65, 0x6E, 0x64, 0x6F, 0x62, 0x6A, 0x0A, // endobj
      0x32, 0x20, 0x30, 0x20, 0x6F, 0x62, 0x6A, 0x0A, // 2 0 obj
      0x3C, 0x3C, 0x2F, 0x54, 0x79, 0x70, 0x65, 0x2F, 0x50, 0x61, 0x67, 0x65, 0x73, 0x2F, 0x4B, 0x69, 0x64, 0x73, 0x5B, 0x33, 0x20, 0x30, 0x20, 0x52, 0x5D, 0x2F, 0x43, 0x6F, 0x75, 0x6E, 0x74, 0x20, 0x31, 0x3E, 0x3E, 0x0A, // <</Type/Pages/Kids[3 0 R]/Count 1>>
      0x65, 0x6E, 0x64, 0x6F, 0x62, 0x6A, 0x0A, // endobj
      0x33, 0x20, 0x30, 0x20, 0x6F, 0x62, 0x6A, 0x0A, // 3 0 obj
      0x3C, 0x3C, 0x2F, 0x54, 0x79, 0x70, 0x65, 0x2F, 0x50, 0x61, 0x67, 0x65, 0x2F, 0x50, 0x61, 0x72, 0x65, 0x6E, 0x74, 0x20, 0x32, 0x20, 0x30, 0x20, 0x52, 0x2F, 0x4D, 0x65, 0x64, 0x69, 0x61, 0x42, 0x6F, 0x78, 0x5B, 0x30, 0x20, 0x30, 0x20, 0x36, 0x31, 0x32, 0x20, 0x37, 0x39, 0x32, 0x5D, 0x3E, 0x3E, 0x0A, // <</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>
      0x65, 0x6E, 0x64, 0x6F, 0x62, 0x6A, 0x0A, // endobj
      0x78, 0x72, 0x65, 0x66, 0x0A, 0x30, 0x20, 0x34, 0x0A, // xref 0 4
      0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x20, 0x36, 0x35, 0x35, 0x33, 0x35, 0x20, 0x66, 0x20, 0x0A, // 0000000000 65535 f
      0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x39, 0x20, 0x30, 0x30, 0x30, 0x30, 0x30, 0x20, 0x6E, 0x20, 0x0A, // 0000000009 00000 n
      0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x37, 0x34, 0x20, 0x30, 0x30, 0x30, 0x30, 0x30, 0x20, 0x6E, 0x20, 0x0A, // 0000000074 00000 n
      0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x31, 0x32, 0x39, 0x20, 0x30, 0x30, 0x30, 0x30, 0x30, 0x20, 0x6E, 0x20, 0x0A, // 0000000129 00000 n
      0x74, 0x72, 0x61, 0x69, 0x6C, 0x65, 0x72, 0x0A, // trailer
      0x3C, 0x3C, 0x2F, 0x53, 0x69, 0x7A, 0x65, 0x20, 0x34, 0x2F, 0x52, 0x6F, 0x6F, 0x74, 0x20, 0x31, 0x20, 0x30, 0x20, 0x52, 0x3E, 0x3E, 0x0A, // <</Size 4/Root 1 0 R>>
      0x73, 0x74, 0x61, 0x72, 0x74, 0x78, 0x72, 0x65, 0x66, 0x0A, // startxref
      0x32, 0x30, 0x33, 0x0A, // 203
      0x25, 0x25, 0x45, 0x4F, 0x46 // %%EOF
    ]);
    
    // Upload the test PDF
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test.pdf',
      mimeType: 'application/pdf',
      buffer: testPdf,
    });
    
    // Wait for PDF processing and check that a canvas element is created
    await page.waitForFunction(() => {
      const canvas = document.querySelector('#pdf-container canvas');
      return canvas !== null;
    }, { timeout: 10000 });
    
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