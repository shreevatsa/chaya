import { AllSelection } from 'prosemirror-state';
import {
    DOMOutputSpec, DOMParser, Fragment, Node, NodeType, Schema, Slice,
} from 'prosemirror-model';

const schema = new Schema({
    nodes: {
        text: { inline: true },
        page: {
            content: '',
            attrs: {
                pageNum: { default: null },
            },
        },
        // The document (page) is a nonempty sequence of lines.
        doc: {
            content: "page+",
        },
    },
});

import Tesseract from 'tesseract.js';

import * as pdfjsLib from 'pdfjs-dist';
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const dropzone = document.getElementById('dropzone') as HTMLElement;
const fileInput = document.getElementById('fileInput') as HTMLInputElement;

let fileSelectionAllowed = true;
dropzone.addEventListener('click', () => { if (fileSelectionAllowed) { fileInput.click(); } });
dropzone.addEventListener('dragover', event => { event.preventDefault(); if (fileSelectionAllowed) { dropzone.classList.add('drag-over'); } });
dropzone.addEventListener('dragleave', event => { event.preventDefault(); if (fileSelectionAllowed) { dropzone.classList.remove('drag-over'); } });
dropzone.addEventListener('drop', event => {
    event.preventDefault();
    if (fileSelectionAllowed) {
        dropzone.classList.remove('drag-over');
        const file = event.dataTransfer.files[0];
        fileInput.files = event.dataTransfer.files;
    }
});

fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    processFile(file);
});

async function processFile(file) {
    // Used up. Reload the page to add a different file.
    fileSelectionAllowed = false;
    dropzone.classList.add('disabled');
    dropzone.innerText = 'Processing file...';

    console.assert(file.type === 'application/pdf');
    await workOnPdf(file);
    dropzone.innerText = 'Done.';
}

async function workOnPdf(file) {
    const worker = await Tesseract.createWorker('kan');

    const { numPages, imageIterator } = await convertPDFToImages(file);
    let done = 0;
    dropzone.innerText = `Processing ${numPages} page${numPages > 1 ? 's' : ''}`;
    for await (const { imageURL } of imageIterator) {
        const ta = await displayImage(imageURL);
        const { text } = await ocrImage(worker, imageURL);
        ta.value = text.trim();
        ta.style.height = (ta.scrollHeight + 5) + 'px';
        done += 1;
        dropzone.innerText = `Done ${done} of ${numPages}`;
    }

    await worker.terminate();
}

const imageContainer = document.querySelector('.image-container') as HTMLDivElement;
// Display the image and a textarea next to it.
async function displayImage(imageURL) {
    const container = document.createElement('div');
    const imgElement = document.createElement('img');
    imgElement.src = imageURL;
    container.appendChild(imgElement);

    const altTextarea = document.createElement('textarea');
    altTextarea.classList.add('textarea-alt');
    altTextarea.placeholder = 'OCRing image...';
    container.appendChild(altTextarea);
    imageContainer.appendChild(container);
    return altTextarea;
}

const desiredWidth = 1000;
async function convertPDFToImages(file) {
    // returns { numPages, imageIterator }
    const pdf = await pdfjsLib.getDocument(URL.createObjectURL(file)).promise;
    const numPages = pdf.numPages;
    async function* images() {
        for (let i = 1; i <= numPages; i++) {
            try {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 1 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d')!;
                canvas.width = desiredWidth;
                canvas.height = (desiredWidth / viewport.width) * viewport.height;
                const renderContext = {
                    canvasContext: context,
                    viewport: page.getViewport({ scale: desiredWidth / viewport.width }),
                };
                await page.render(renderContext).promise;
                const imageURL = canvas.toDataURL('image/jpeg', 0.8);
                yield { imageURL };
            } catch (error) {
                console.error(`Error rendering page ${i}:`, error);
            }
        }
    }
    return { numPages: numPages, imageIterator: images() };
}

async function ocrImage(worker, imageUrl) {
    const response = await worker.recognize(imageUrl);
    console.log(response);
    const {
        data: { text },
    } = response;
    return { text };
}
