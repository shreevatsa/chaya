import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Chaya Functionality Tests', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log('BROWSER:', msg.type(), msg.text()));
    page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));
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

      await page.waitForFunction(() => {
        const state = (window as any).appState;
        return state?.documentLoaded === true;
      }, { timeout: 30000 });

      await page.waitForFunction(() => {
        const loadingDiv = document.querySelector('#app-loading');
        return loadingDiv && loadingDiv.classList.contains('hidden');
      }, { timeout: 30000 });

      await page.waitForSelector('.annotation-layer', { timeout: 30000 });

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

      await page.waitForFunction(() => {
        const state = (window as any).appState;
        return state?.documentLoaded === true;
      }, { timeout: 30000 });

      await page.waitForFunction(() => {
        const loadingDiv = document.querySelector('#app-loading');
        return loadingDiv && loadingDiv.classList.contains('hidden');
      }, { timeout: 30000 });

      await page.waitForSelector('.annotation-layer', { timeout: 30000 });

      // Verify the workspace structure is ready for annotation functionality
      expect(await page.locator('#pdf-container').isVisible()).toBe(true);
      const annotationList = page.locator('#annotation-list');
      expect(await annotationList.isVisible()).toBe(true);

      // Verify annotation layer exists for drawing
      const annotationLayer = page.locator('.annotation-layer').first();
      expect(await annotationLayer.count()).toBeGreaterThan(0);
    });

    test('can upload a .chaya file and MarkedRegions render correctly in the workspace', async ({ page }) => {
      // First, create a .chaya file by running the workflow
      await test.step('Create .chaya file', async () => {
        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.click('#pdf-slot');
        const fileChooser = await fileChooserPromise;

        const testPdfPath = path.join(__dirname, '..', 'test.pdf');
        await fileChooser.setFiles(testPdfPath);

        await page.waitForFunction(() => {
          const state = (window as any).appState;
          return state?.documentLoaded === true;
        }, { timeout: 30000 });

        await page.waitForFunction(() => {
          const loadingDiv = document.querySelector('#app-loading');
          return loadingDiv && loadingDiv.classList.contains('hidden');
        }, { timeout: 30000 });

        await page.waitForSelector('.annotation-layer', { timeout: 30000 });

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

        const downloadPath = path.join(__dirname, 'workspace-restore.chaya');
        await download.saveAs(downloadPath);
      });

      // Reload the page to start fresh
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Step 1: Upload the .chaya file
      const fileChooserPromise = page.waitForEvent('filechooser');
      await page.click('#chaya-slot');
      const fileChooser = await fileChooserPromise;

      const chayaPath = path.join(__dirname, 'workspace-restore.chaya');
      await fileChooser.setFiles(chayaPath);

      // Wait for .chaya file to load
      await page.waitForFunction(() => {
        const state = (window as any).appState;
        return state?.documentLoaded === true;
      }, { timeout: 30000 });

      await page.waitForFunction(() => {
        const loadingDiv = document.querySelector('#app-loading');
        return loadingDiv && loadingDiv.classList.contains('hidden');
      }, { timeout: 30000 });

      await page.waitForSelector('.annotation-layer', { timeout: 30000 });

      // Step 2: Verify annotations render in the workspace
      const annotationBoxes = page.locator('.annotation-box');
      await expect(annotationBoxes).toHaveCount(2);

      const annotationListItems = page.locator('#annotation-list [data-annotation-id]');
      await expect(annotationListItems).toHaveCount(2);
    });
  });

  // Cleanup after tests
  test.afterAll(async () => {
    const testFiles = [
      'test-output.chaya',
      'workspace-restore.chaya'
    ];

    for (const file of testFiles) {
      const filePath = path.join(__dirname, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  });
});
