import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

const samplePdf = path.resolve(__dirname, '../../test.pdf');

async function waitForDocument(page: Page) {
    await expect(page.locator('#pdf-container canvas')).toHaveCount(1);
    await expect(page.locator('#app-loading')).toBeHidden();
}

test('the versions catalog links to both Bookchop interfaces and early prototypes', async ({ page }, testInfo) => {
    await page.goto('/');
    await expect(page.locator('#dropzone')).toBeVisible();
    await page.getByRole('link', { name: 'Bookchop versions', exact: true }).click();
    await expect(page).toHaveURL(/\/versions\/#bookchop$/);
    await expect(page.locator('a[href="./prototypes/retry.html"]')).toBeVisible();
    await expect(page.locator('a[href="./splitchunk/"]')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('catalog.png'), fullPage: true });
    await page.getByRole('link', { name: 'Mark and read', exact: true }).click();
    await expect(page.locator('#read-tab-btn')).toBeVisible();
    await page.getByRole('link', { name: '← All versions' }).click();
    await page.getByRole('link', { name: 'Marking workspace', exact: true }).click();
    await expect(page.locator('#mark-view')).toBeVisible();
    await expect(page.locator('#read-tab-btn')).toHaveCount(0);
});

for (const variant of ['bookchop', 'bookchop-markonly']) {
    test(`${variant}: mark, rename, save, and reopen in the other interface`, async ({ page }, testInfo) => {
        const pageErrors: string[] = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        await page.goto(`/versions/${variant}/`);
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

        if (variant === 'bookchop') {
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

        const other = variant === 'bookchop' ? 'bookchop-markonly' : 'bookchop';
        await page.goto(`/versions/${other}/`);
        await page.locator('#chaya-upload').setInputFiles(archive);
        await waitForDocument(page);
        await expect(page.locator('.annotation-box')).toHaveCount(1);
        await expect(page.locator('#annotation-list')).toContainText('Renamed region');
        if (other === 'bookchop') {
            await page.locator('#read-tab-btn').click();
            await expect(page.locator('#read-pdf-container .annotation-region')).toHaveCount(1);
        }
        expect(pageErrors).toEqual([]);
        const unexpectedDialogs: string[] = [];
        page.on('dialog', async dialog => {
            unexpectedDialogs.push(dialog.type());
            await dialog.accept();
        });
        await page.goto('/versions/');
        expect(unexpectedDialogs).toEqual([]);
    });
}

test('the archived split experiment loads a saved document and previews a split', async ({ page }) => {
    const savedDocument = {
        type: 'doc',
        attrs: { schemaVersion: '2024.03' },
        content: [{
            type: 'chunk',
            attrs: { chunkType: 'paragraph', numChildren: 1 },
            content: [{
                type: 'line',
                attrs: { pageNum: 1, y1: 0, y2: 100, words: [], xmin: 0, xmax: 100 },
                content: [{ type: 'text', text: 'Example line' }],
            }],
        }],
    };
    await page.goto('/versions/splitchunk/');
    await expect(page.getByText('The Done button reports the selected split;', { exact: false })).toBeVisible();
    const rendered = page.waitForEvent('console', {
        predicate: message => message.text() === 'Rendered PDF page 1 of 1',
    });
    await page.locator('#fileInputPdf').setInputFiles(samplePdf);
    await rendered;
    await page.locator('#option-load').check();
    await page.locator('#chaya-file').setInputFiles({
        name: 'sample.chaya',
        mimeType: 'application/octet-stream',
        buffer: Buffer.from(JSON.stringify(savedDocument)),
    });
    await page.locator('#startButton').click();
    await expect(page.locator('#saveChaya')).not.toHaveClass(/disabled/);
    await page.locator('.line-contents').click();
    await page.getByTitle('Split this chunk (horizontally or vertically)', { exact: true }).click();
    await expect(page.locator('#myModal')).toBeVisible();
    await page.locator('#sliderLR').press('Home');
    await page.locator('#sliderLR').press('ArrowRight');
    let message = '';
    page.once('dialog', async dialog => {
        message = dialog.message();
        await dialog.accept();
    });
    await page.locator('#splitChunkDone').click();
    await expect(page.locator('#myModal')).toBeHidden();
    expect(message).toBe('Going to split in direction LR by 1');
    await expect(page.locator('.chunk')).toHaveCount(1);
    await expect(page.locator('.line-contents')).toHaveText('Example line');
});
