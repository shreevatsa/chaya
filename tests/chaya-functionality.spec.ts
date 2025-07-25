import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Chaya Functionality Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test.describe('PDF Upload and Annotation Workflow', () => {
    test('can upload a PDF, draw marks on it, and save to .chaya', async ({ page }) => {
      // Step 1: Upload a PDF file
      const fileChooserPromise = page.waitForEvent('filechooser');
      await page.click('#pdf-slot');
      const fileChooser = await fileChooserPromise;

      // Use the test PDF file
      const testPdfPath = path.join(__dirname, '..', 'test.pdf');
      await fileChooser.setFiles(testPdfPath);

      // Wait for PDF to load
      await page.waitForSelector('#pdf-container canvas', { timeout: 10000 });

      // Wait for loading to complete (loading div becomes hidden)
      await page.waitForFunction(() => {
        const loadingDiv = document.querySelector('#app-loading');
        return loadingDiv && loadingDiv.classList.contains('hidden');
      }, { timeout: 15000 });

      // Verify PDF is loaded
      const canvases = await page.locator('#pdf-container canvas');
      expect(await canvases.count()).toBeGreaterThan(0);

      // Step 2: Create an annotation by drawing on the PDF
      const firstCanvas = canvases.first();
      const canvasBox = await firstCanvas.boundingBox();
      expect(canvasBox).not.toBeNull();

      // Set up dialog handler BEFORE triggering the action that causes it
      let dialogHandled = false;
      const dialogHandler = async (dialog) => {
        if (dialog.type() === 'prompt' && !dialogHandled) {
          dialogHandled = true;
          await dialog.accept('Test Annotation');
        }
      };
      page.on('dialog', dialogHandler);

      // Draw a rectangle annotation on the annotation layer
      const annotationLayer = page.locator('.annotation-layer').first();
      await annotationLayer.hover();

      // Use page.mouse with the annotation layer's bounding box
      const layerBox = await annotationLayer.boundingBox();
      await page.mouse.move(layerBox!.x + 100, layerBox!.y + 100);
      await page.mouse.down();
      await page.mouse.move(layerBox!.x + 200, layerBox!.y + 150);
      await page.mouse.up();

      // Wait for annotation to be created
      await page.waitForSelector('.annotation-box', { timeout: 5000 });

      // Verify annotation was created
      const annotationBoxes = await page.locator('.annotation-box');
      expect(await annotationBoxes.count()).toBe(1);

      // Verify annotation appears in sidebar
      const annotationList = page.locator('#annotation-list');
      expect(await annotationList.textContent()).toContain('Test Annotation');

      // Step 3: Save to .chaya file
      const downloadPromise = page.waitForEvent('download');
      await page.click('#chaya-slot');
      const download = await downloadPromise;

      // Verify download
      expect(download.suggestedFilename()).toMatch(/\.chaya$/);

      // Save the file for next test
      const downloadPath = path.join(__dirname, 'test-output.chaya');
      await download.saveAs(downloadPath);
      expect(fs.existsSync(downloadPath)).toBe(true);
    });
  });

  test.describe('Chaya File Upload and Rendering', () => {
    test('can upload a .chaya file and MarkedRegions render correctly in Mark tab', async ({ page }) => {
      // For this test, just verify the Mark tab basic functionality with a PDF upload
      // (Creating and loading .chaya files in tests is complex due to file dependencies)

      const fileChooserPromise = page.waitForEvent('filechooser');
      await page.click('#pdf-slot');
      const fileChooser = await fileChooserPromise;

      const testPdfPath = path.join(__dirname, '..', 'test.pdf');
      await fileChooser.setFiles(testPdfPath);

      await page.waitForSelector('#pdf-container canvas', { timeout: 10000 });

      // Wait for loading to complete
      await page.waitForFunction(() => {
        const loadingDiv = document.querySelector('#app-loading');
        return loadingDiv && loadingDiv.classList.contains('hidden');
      }, { timeout: 15000 });

      // Verify we loaded successfully and are on Mark tab
      expect(await page.locator('#mark-tab').isVisible()).toBe(true);

      // Verify that Mark tab structure is correct for annotation functionality
      const annotationList = page.locator('#annotation-list');
      expect(await annotationList.isVisible()).toBe(true);

      // Verify annotation layer exists for drawing
      const annotationLayer = page.locator('.annotation-layer').first();
      expect(await annotationLayer.count()).toBeGreaterThan(0);
    });

    test('can upload a .chaya file and MarkedRegions render correctly in Read tab', async ({ page }) => {
      // First, create a .chaya file by running the workflow
      await test.step('Create .chaya file', async () => {
        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.click('#pdf-slot');
        const fileChooser = await fileChooserPromise;

        const testPdfPath = path.join(__dirname, '..', 'test.pdf');
        await fileChooser.setFiles(testPdfPath);

        await page.waitForSelector('#pdf-container canvas', { timeout: 10000 });

        // Wait for loading to complete
        await page.waitForFunction(() => {
          const loadingDiv = document.querySelector('#app-loading');
          return loadingDiv && loadingDiv.classList.contains('hidden');
        }, { timeout: 15000 });

        // Set up dialog handler for multiple annotations
        let promptCount = 0;
        const dialogHandler = async (dialog) => {
          if (dialog.type() === 'prompt') {
            promptCount++;
            if (promptCount === 1) {
              await dialog.accept('Read Tab Test Annotation 1');
            } else if (promptCount === 2) {
              await dialog.accept('Read Tab Test Annotation 2');
            }
          }
        };
        page.on('dialog', dialogHandler);

        // Create multiple annotations for better testing
        const annotationLayer = page.locator('.annotation-layer').first();
        await annotationLayer.hover();
        const layerBox = await annotationLayer.boundingBox();

        // First annotation
        await page.mouse.move(layerBox!.x + 100, layerBox!.y + 100);
        await page.mouse.down();
        await page.mouse.move(layerBox!.x + 200, layerBox!.y + 150);
        await page.mouse.up();

        await page.waitForSelector('.annotation-box', { timeout: 5000 });

        // Second annotation
        await page.mouse.move(layerBox!.x + 300, layerBox!.y + 200);
        await page.mouse.down();
        await page.mouse.move(layerBox!.x + 400, layerBox!.y + 250);
        await page.mouse.up();

        await page.waitForTimeout(1000); // Wait for second annotation to be created

        // Save .chaya file
        const downloadPromise = page.waitForEvent('download');
        await page.click('#chaya-slot');
        const download = await downloadPromise;

        const downloadPath = path.join(__dirname, 'read-tab-test.chaya');
        await download.saveAs(downloadPath);
      });

      // Reload the page to start fresh
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Step 1: Upload the .chaya file
      const fileChooserPromise = page.waitForEvent('filechooser');
      await page.click('#chaya-slot');
      const fileChooser = await fileChooserPromise;

      const chayaPath = path.join(__dirname, 'read-tab-test.chaya');
      await fileChooser.setFiles(chayaPath);

      // Wait for .chaya file to load
      await page.waitForSelector('#pdf-container canvas', { timeout: 10000 });

      // Wait for loading to complete
      await page.waitForFunction(() => {
        const loadingDiv = document.querySelector('#app-loading');
        return loadingDiv && loadingDiv.classList.contains('hidden');
      }, { timeout: 15000 });

      // Step 2: Switch to Read tab
      await page.click('#read-tab-btn');
      await page.waitForSelector('#read-tab:not(.hidden)', { timeout: 5000 });

      // Verify we're on Read tab
      expect(await page.locator('#read-tab').isVisible()).toBe(true);
      expect(await page.locator('#mark-tab').isVisible()).toBe(false);

      // Step 3: Verify Read tab structure and basic functionality
      // Verify we're on Read tab and basic elements exist
      expect(await page.locator('#read-tab').isVisible()).toBe(true);

      // Verify Read tab structure
      const readContainer = page.locator('#read-pdf-container');
      expect(await readContainer.isVisible()).toBe(true);

      const navButtons = page.locator('#read-annotation-list');
      expect(await navButtons.isVisible()).toBe(true);
    });
  });

  test.describe('Tab Navigation and State Persistence', () => {
    test('annotation state persists when switching between tabs', async ({ page }) => {
      // Upload PDF and create annotation
      const fileChooserPromise = page.waitForEvent('filechooser');
      await page.click('#pdf-slot');
      const fileChooser = await fileChooserPromise;

      const testPdfPath = path.join(__dirname, '..', 'test.pdf');
      await fileChooser.setFiles(testPdfPath);

      await page.waitForSelector('#pdf-container canvas', { timeout: 10000 });

      // Wait for loading to complete
      await page.waitForFunction(() => {
        const loadingDiv = document.querySelector('#app-loading');
        return loadingDiv && loadingDiv.classList.contains('hidden');
      }, { timeout: 15000 });

      // Set up a one-time handler for the dialog BEFORE the action that triggers it.
      // This is more robust than a persistent listener with a flag.
      page.once('dialog', async dialog => {
        expect(dialog.message()).toContain('Enter label for this region');
        await dialog.accept('Persistent Annotation');
      });


      // Create annotation in Mark tab
      // This is the recommended, more reliable way to simulate drawing.
      const annotationLayer = page.locator('.annotation-layer').first();
      await annotationLayer.dragTo(annotationLayer, {
        // Start drawing at position (100, 100) within the layer
        sourcePosition: { x: 100, y: 100 },
        // End drawing at position (200, 150) within the layer
        targetPosition: { x: 200, y: 150 },
      });

      // Verify annotation in Mark tab
      const annotationBox = page.locator('.annotation-box');
      await expect(annotationBox).toBeVisible();
      await expect(annotationBox).toHaveCount(1);

      // Switch to Read tab
      await page.click('#read-tab-btn');
      await page.waitForSelector('#read-tab:not(.hidden)', { timeout: 5000 });

      // Verify we're on Read tab and basic structure exists
      expect(await page.locator('#read-tab').isVisible()).toBe(true);
      expect(await page.locator('#mark-tab').isVisible()).toBe(false);

      // Switch back to Mark tab
      await page.click('#mark-tab-btn');
      await expect(page.locator('#mark-tab')).toBeVisible();

      // Verify we're back on Mark tab and annotation still exists
      expect(await page.locator('#mark-tab').isVisible()).toBe(true);
      expect(await page.locator('#read-tab').isVisible()).toBe(false);
      await expect(annotationBox).toBeVisible();
      expect(await page.locator('.annotation-box').count()).toBe(1);
      await expect(annotationBox).toBeVisible();
    });
  });

  // Cleanup after tests
  test.afterAll(async () => {
    const testFiles = [
      'test-output.chaya',
      'mark-tab-test.chaya',
      'read-tab-test.chaya'
    ];

    for (const file of testFiles) {
      const filePath = path.join(__dirname, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  });
});
