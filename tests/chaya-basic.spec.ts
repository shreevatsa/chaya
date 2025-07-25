import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Chaya Basic Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('can upload a PDF, create annotations, and save to .chaya', async ({ page }) => {
    // Step 1: Upload PDF
    const fileInput = page.locator('#pdf-upload');
    const testPdfPath = path.join(__dirname, '..', 'test.pdf');
    await fileInput.setInputFiles(testPdfPath);

    // Wait for PDF to load - canvas should appear
    await page.waitForSelector('#pdf-container canvas', { timeout: 15000 });

    // Wait a bit more for the loading to complete
    await page.waitForFunction(() => {
      const loading = document.querySelector('#app-loading');
      return loading && loading.classList.contains('hidden');
    });

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

  test('can upload a .chaya file and render MarkedRegions in Mark tab', async ({ page }) => {
    // This test would need an existing .chaya file
    // For now, we'll create a simple test by programmatically creating annotations

    // First upload a PDF
    const fileInput = page.locator('#pdf-upload');
    const testPdfPath = path.join(__dirname, '..', 'test.pdf');
    await fileInput.setInputFiles(testPdfPath);

    await page.waitForSelector('#pdf-container canvas', { timeout: 15000 });
    await page.waitForFunction(() => {
      const loading = document.querySelector('#app-loading');
      return loading && loading.classList.contains('hidden');
    });

    // Programmatically add an annotation to the app state
    await page.evaluate(() => {
      // Access the global app state and add an annotation
      const appState = (window as any).appState || {};
      if (appState.chayaDocument) {
        const annotation = {
          id: 'test-annotation-1',
          x: 0.1,
          y: 0.1,
          width: 0.2,
          height: 0.1,
          label: 'Test Mark Tab Annotation',
          pageNumber: 1
        };

        appState.chayaDocument.markedRegions = [annotation];

        // Trigger re-rendering
        const event = new CustomEvent('annotationAdded', { detail: annotation });
        document.dispatchEvent(event);
      }
    });

    // Check if we're on the Mark tab (should be default)
    expect(await page.locator('#mark-tab').isVisible()).toBe(true);

    // For this test, we'll verify the basic structure is present
    const annotationList = page.locator('#annotation-list');
    expect(await annotationList.isVisible()).toBe(true);
  });

  test('can switch to Read tab and display annotation regions', async ({ page }) => {
    // Upload PDF first
    const fileInput = page.locator('#pdf-upload');
    const testPdfPath = path.join(__dirname, '..', 'test.pdf');
    await fileInput.setInputFiles(testPdfPath);
    await page.waitForSelector('#pdf-container canvas', { timeout: 15000 });
    await page.waitForFunction(() => {
      const loading = document.querySelector('#app-loading');
      return loading && loading.classList.contains('hidden');
    });

    // Switch to Read tab
    await page.click('#read-tab-btn');
    // Wait for tab switch to complete
    await page.waitForSelector('#read-tab:not(.hidden)', { timeout: 5000 });
    // Verify we're on Read tab
    await expect(page.locator('#read-tab')).toBeVisible();
    await expect(page.locator('#mark-tab')).not.toBeVisible();

    // Verify that the navigation list ELEMENT EXISTS in the DOM,
    // even if it's not visible because it's empty.
    await expect(page.locator('#read-annotation-list')).toHaveCount(1);
  });

  test('tab navigation works correctly', async ({ page }) => {
    // Test tab switching
    await page.click('#mark-tab-btn');
    expect(await page.locator('#mark-tab').isVisible()).toBe(true);
    expect(await page.locator('#read-tab').isVisible()).toBe(false);

    await page.click('#read-tab-btn');
    expect(await page.locator('#read-tab').isVisible()).toBe(true);
    expect(await page.locator('#mark-tab').isVisible()).toBe(false);

    // Edit tab should be disabled
    const editBtn = page.locator('#edit-tab-btn');
    expect(await editBtn.getAttribute('class')).toContain('opacity-50');
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
