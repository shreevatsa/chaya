export function documentGetElementById<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id) as T;
    if (!element) {
        throw new Error(`Required element with id '${id}' not found`);
    }
    return element;
}

export function updateLoadingProgress(percent: number, text: string, details: string): void {
    const clampedPercent = Math.max(0, Math.min(100, percent));

    documentGetElementById<HTMLSpanElement>('app-loading-text').textContent = text;
    documentGetElementById<HTMLSpanElement>('app-loading-percent').textContent = `${Math.round(clampedPercent)}%`;
    documentGetElementById<HTMLDivElement>('app-loading-details').textContent = details;
    const progressBar = documentGetElementById<HTMLDivElement>('app-progress-bar');
    progressBar.style.width = `${clampedPercent}%`;
    // Update progress bar color based on status
    if (clampedPercent === 100) {
        progressBar.className = 'bg-green-600 h-2 rounded-full transition-all duration-300';
    } else if (clampedPercent === 0 && text.includes('Error')) {
        progressBar.className = 'bg-red-600 h-2 rounded-full transition-all duration-300';
    } else {
        progressBar.className = 'bg-blue-600 h-2 rounded-full transition-all duration-300';
    }
}
