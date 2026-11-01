import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

const samplePdf = path.resolve(__dirname, '../../test.pdf');

async function waitForDocument(page: Page) {
    await expect(page.locator('#pdf-container canvas')).toHaveCount(1);
    await expect(page.locator('#app-loading')).toBeHidden();
}

test('the original OCR app links to both Bookchop interfaces and early prototypes', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#dropzone')).toBeVisible();
    await page.getByRole('link', { name: 'Bookchop', exact: true }).click();
    await expect(page).toHaveURL(/\/bookchop\/$/);
    await expect(page.locator('a[href="../retry.html"]')).toBeVisible();
    await page.getByRole('link', { name: 'Mark and read', exact: true }).click();
    await expect(page.locator('#read-tab-btn')).toBeVisible();
    await page.getByRole('link', { name: '← Bookchop applications' }).click();
    await page.getByRole('link', { name: 'Marking workspace', exact: true }).click();
    await expect(page.locator('#mark-view')).toBeVisible();
    await expect(page.locator('#read-tab-btn')).toHaveCount(0);
});

for (const variant of ['full', 'markonly']) {
    test(`${variant}: mark, rename, save, and reopen in the other interface`, async ({ page }, testInfo) => {
        const pageErrors: string[] = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        await page.goto(`/bookchop/${variant}/`);
        await page.locator('#pdf-upload').setInputFiles(samplePdf);
        await waitForDocument(page);

        const layer = page.locator('.annotation-layer');
        const rect = await layer.boundingBox();
        expect(rect).not.toBeNull();
        page.once('dialog', dialog => dialog.accept('Sample region'));
        await page.mouse.move(rect!.x + 60, rect!.y + 60);
        await page.mouse.down();
        await page.mouse.move(rect!.x + 260, rect!.y + 140, { steps: 4 });
        await page.mouse.up();

        const box = page.locator('.annotation-box');
        await expect(box).toHaveCount(1);
        await expect(page.locator('#annotation-list')).toContainText('Sample region');
        page.once('dialog', dialog => dialog.accept('Renamed region'));
        await box.dblclick();
        await expect(page.locator('#annotation-list')).toContainText('Renamed region');
        await expect(box).toHaveAttribute('title', 'Renamed region');

        if (variant === 'full') {
            await page.locator('#read-tab-btn').click();
            await expect(page.locator('#read-pdf-container .annotation-region')).toHaveCount(1);
            await expect(page.locator('#read-annotation-list')).toContainText('Renamed region');
        }

        const downloadPromise = page.waitForEvent('download');
        await page.locator('#chaya-slot').click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toBe('test.chaya');
        const archive = testInfo.outputPath('test.chaya');
        await download.saveAs(archive);

        const other = variant === 'full' ? 'markonly' : 'full';
        await page.goto(`/bookchop/${other}/`);
        await page.locator('#chaya-upload').setInputFiles(archive);
        await waitForDocument(page);
        await expect(page.locator('.annotation-box')).toHaveCount(1);
        await expect(page.locator('#annotation-list')).toContainText('Renamed region');
        if (other === 'full') {
            await page.locator('#read-tab-btn').click();
            await expect(page.locator('#read-pdf-container .annotation-region')).toHaveCount(1);
        }
        expect(pageErrors).toEqual([]);
        const unexpectedDialogs: string[] = [];
        page.on('dialog', async dialog => {
            unexpectedDialogs.push(dialog.type());
            await dialog.accept();
        });
        await page.goto('/bookchop/');
        expect(unexpectedDialogs).toEqual([]);
    });
}
