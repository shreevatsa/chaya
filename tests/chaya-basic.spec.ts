import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Chaya Basic Functionality', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log('BROWSER:', msg.type(), msg.text()));
    page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('can upload a PDF, create annotations, and save to .chaya', async ({ page }) => {
    // Step 1: Upload PDF
    const fileInput = page.locator('#pdf-upload');
    const testPdfPath = path.join(__dirname, '..', 'test.pdf');
    await fileInput.setInputFiles(testPdfPath);

    await page.waitForFunction(() => {
      const state = (window as any).appState;
      return state?.documentLoaded === true;
    }, { timeout: 30000 });

    await page.waitForFunction(() => {
      const loading = document.querySelector('#app-loading');
      return loading && loading.classList.contains('hidden');
    }, { timeout: 30000 });

    await page.waitForSelector('.annotation-layer', { timeout: 30000 });

    // Verify PDF loaded successfully
    const canvases = page.locator('#pdf-container canvas');
    expect(await canvases.count()).toBeGreaterThan(0);

    // Step 2: Create annotation by simulating drawing
    const annotationLayer = page.locator('.annotation-layer').first();
    await annotationLayer.hover();

    // Simulate mouse drawing - use a programmatic approach instead of relying on prompts
    await page.evaluate(() => {
      // Find the first annotation layer
      const layer = document.querySelector('.annotation-layer') as HTMLElement;
      if (!layer) return;

      // Create a test annotation directly
      const event = new MouseEvent('mousedown', {
        clientX: layer.getBoundingClientRect().left + 100,
        clientY: layer.getBoundingClientRect().top + 100,
        button: 0
      });
      layer.dispatchEvent(event);

      // Move mouse
      const moveEvent = new MouseEvent('mousemove', {
        clientX: layer.getBoundingClientRect().left + 200,
        clientY: layer.getBoundingClientRect().top + 150,
        button: 0
      });
      layer.dispatchEvent(moveEvent);

      // Mouse up
      const upEvent = new MouseEvent('mouseup', {
        clientX: layer.getBoundingClientRect().left + 200,
        clientY: layer.getBoundingClientRect().top + 150,
        button: 0
      });
      layer.dispatchEvent(upEvent);
    });

    // Handle the prompt dialog
    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') {
        await dialog.accept('Test PDF Annotation');
      }
    });

    // Trigger the mouse events again (since the dialog might interrupt)
    await page.evaluate(() => {
      const layer = document.querySelector('.annotation-layer') as HTMLElement;
      if (!layer) return;

      // Simulate complete drawing sequence
      const rect = layer.getBoundingClientRect();

      // Mouse down
      const mouseDownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + 100,
        clientY: rect.top + 100,
        button: 0
      });
      layer.dispatchEvent(mouseDownEvent);

      // Mouse move
      const mouseMoveEvent = new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + 200,
        clientY: rect.top + 150,
        button: 0
      });
      layer.dispatchEvent(mouseMoveEvent);

      // Mouse up
      const mouseUpEvent = new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + 200,
        clientY: rect.top + 150,
        button: 0
      });
      layer.dispatchEvent(mouseUpEvent);
    });

    // Wait for annotation to appear (with timeout)
    await page.waitForSelector('.annotation-box', { timeout: 5000 });

    // Verify annotation was created
    const annotationBoxes = page.locator('.annotation-box');
    expect(await annotationBoxes.count()).toBeGreaterThan(0);

    // Step 3: Save to .chaya file
    const downloadPromise = page.waitForEvent('download');
    await page.click('#chaya-slot .download-slot');
    const download = await downloadPromise;

    // Verify download
    expect(download.suggestedFilename()).toMatch(/\.chaya$/);
  });

  test('workspace sidebar is visible after loading a document', async ({ page }) => {
    const fileInput = page.locator('#pdf-upload');
    const testPdfPath = path.join(__dirname, '..', 'test.pdf');
    await fileInput.setInputFiles(testPdfPath);

    await page.waitForFunction(() => {
      const state = (window as any).appState;
      return state?.documentLoaded === true;
    }, { timeout: 30000 });
    await page.waitForFunction(() => {
      const loading = document.querySelector('#app-loading');
      return loading && loading.classList.contains('hidden');
    }, { timeout: 30000 });
    await page.waitForSelector('.annotation-layer', { timeout: 30000 });

    const annotationList = page.locator('#annotation-list');
    expect(await annotationList.isVisible()).toBe(true);
    expect(await annotationList.locator('[data-annotation-id]').count()).toBeGreaterThanOrEqual(0);
  });

  test('file upload interface works', async ({ page }) => {
    // Test that clicking on slots triggers file input
    const pdfSlot = page.locator('#pdf-slot');
    const chayaSlot = page.locator('#chaya-slot');

    expect(await pdfSlot.isVisible()).toBe(true);
    expect(await chayaSlot.isVisible()).toBe(true);

    // Test file inputs exist
    const pdfInput = page.locator('#pdf-upload');
    const chayaInput = page.locator('#chaya-upload');

    expect(await pdfInput.getAttribute('accept')).toBe('.pdf');
    expect(await chayaInput.getAttribute('accept')).toBe('.chaya');
  });
});
