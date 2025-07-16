import { test, expect } from '@playwright/test';

test.describe('Unified UI Two-Slot Interface', () => {
  test('loads and displays the unified interface', async ({ page }) => {
    await page.goto('/');
    
    // Check page title
    await expect(page).toHaveTitle(/Chaya/);
    
    // Check that both PDF.js and JSZip are loaded from CDN
    await expect(page.locator('script[src*="pdf.min.js"]')).toBeAttached();
    await expect(page.locator('script[src*="jszip.min.js"]')).toBeAttached();
    
    // Check for two-slot UI elements
    await expect(page.locator('#chaya-slot')).toBeVisible();
    await expect(page.locator('#pdf-slot')).toBeVisible();
    await expect(page.locator('#chaya-upload')).toBeAttached();
    await expect(page.locator('#pdf-upload')).toBeAttached();
  });

  test('file input elements have correct attributes', async ({ page }) => {
    await page.goto('/');
    
    // Check file input attributes
    const chayaInput = page.locator('#chaya-upload');
    const pdfInput = page.locator('#pdf-upload');
    
    await expect(chayaInput).toHaveAttribute('accept', '.chaya');
    await expect(chayaInput).toHaveClass(/hidden/);
    
    await expect(pdfInput).toHaveAttribute('accept', '.pdf');
    await expect(pdfInput).toHaveClass(/hidden/);
  });

  test('PDF slot click triggers file input', async ({ page }) => {
    await page.goto('/');
    
    // Listen for console errors
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    // Intercept file input click
    let fileInputClicked = false;
    await page.evaluate(() => {
      const pdfInput = document.getElementById('pdf-upload') as HTMLInputElement;
      if (pdfInput) {
        pdfInput.click = () => {
          (window as any).fileInputClicked = true;
        };
      }
    });
    
    // Click on PDF slot
    await page.locator('#pdf-slot').click();
    
    // Wait for click to be processed
    await page.waitForTimeout(100);
    
    // Check that file input was clicked
    const clicked = await page.evaluate(() => (window as any).fileInputClicked);
    expect(clicked).toBe(true);
    
    // Check no errors occurred
    expect(errors).toEqual([]);
  });

  test('Chaya slot click triggers file input', async ({ page }) => {
    await page.goto('/');
    
    // Listen for console errors
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    // Intercept file input click
    await page.evaluate(() => {
      const chayaInput = document.getElementById('chaya-upload') as HTMLInputElement;
      if (chayaInput) {
        chayaInput.click = () => {
          (window as any).chayaInputClicked = true;
        };
      }
    });
    
    // Click on Chaya slot
    await page.locator('#chaya-slot').click();
    
    // Wait for click to be processed
    await page.waitForTimeout(100);
    
    // Check that file input was clicked
    const clicked = await page.evaluate(() => (window as any).chayaInputClicked);
    expect(clicked).toBe(true);
    
    // Check no errors occurred
    expect(errors).toEqual([]);
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

    await page.goto('/');
    
    // Wait for scripts to load and execute
    await page.waitForTimeout(2000);
    
    // Check that no JavaScript errors occurred
    expect(errors).toEqual([]);
  });

  test('UI switches to download mode after PDF upload', async ({ page }) => {
    await page.goto('/');
    
    // Check initial upload mode
    await expect(page.locator('#chaya-slot .upload-slot')).toBeVisible();
    await expect(page.locator('#pdf-slot .upload-slot')).toBeVisible();
    
    // Mock PDF file upload
    const pdfInput = page.locator('#pdf-upload');
    await pdfInput.setInputFiles('./test.pdf');
    
    // Wait for processing
    await page.waitForTimeout(2000);
    
    // Check that UI switches to download mode
    await expect(page.locator('#chaya-slot .download-slot')).toBeVisible();
    await expect(page.locator('#pdf-slot .download-slot')).toBeVisible();
    
    // Check document filename is displayed
    await expect(page.locator('#document-filename')).toBeVisible();
  });

  test('tab navigation works', async ({ page }) => {
    await page.goto('/');
    
    // Check that tabs exist
    await expect(page.locator('#mark-tab-btn')).toBeVisible();
    await expect(page.locator('#read-tab-btn')).toBeVisible();
    await expect(page.locator('#edit-tab-btn')).toBeVisible();
    
    // Check default tab is Mark
    await expect(page.locator('#mark-tab-btn')).toHaveClass(/active/);
    await expect(page.locator('#mark-tab')).toBeVisible();
    await expect(page.locator('#read-tab')).toHaveClass(/hidden/);
    
    // Switch to Read tab
    await page.locator('#read-tab-btn').click();
    await expect(page.locator('#read-tab-btn')).toHaveClass(/active/);
    await expect(page.locator('#read-tab')).toBeVisible();
    await expect(page.locator('#mark-tab')).toHaveClass(/hidden/);
  });

  test('libraries load correctly', async ({ page }) => {
    await page.goto('/');
    
    // Wait for libraries to load
    await page.waitForFunction(() => {
      return typeof (window as any).pdfjsLib !== 'undefined' && 
             typeof (window as any).JSZip !== 'undefined';
    }, { timeout: 5000 });
    
    const librariesLoaded = await page.evaluate(() => {
      return {
        pdfjs: typeof (window as any).pdfjsLib !== 'undefined',
        jszip: typeof (window as any).JSZip !== 'undefined'
      };
    });
    
    expect(librariesLoaded.pdfjs).toBe(true);
    expect(librariesLoaded.jszip).toBe(true);
  });
});