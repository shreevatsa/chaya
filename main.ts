import { EditorState, Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Node, Schema } from 'prosemirror-model';
import { keymap } from 'prosemirror-keymap';
import { undo, redo, history } from 'prosemirror-history';
import { baseKeymap } from 'prosemirror-commands';

import * as pdfjsLib from 'pdfjs-dist';
// // Option 1: Works fine, but requires server to serve the other file.
// pdfjsLib.GlobalWorkerOptions.workerSrc = './node_modules/pdfjs-dist/build/pdf.worker.mjs';
// // Option 2: Works, with "Warning: Setting up fake worker."
// import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs';
// pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
// Option 3: Works?
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs';
const workerBlob = new Blob([pdfjsWorker], { type: 'application/javascript' });
pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);

import Tesseract from 'tesseract.js';

// "Global" PDF.js state
let pdfFileUrl: string;
let pdfFileName: string;
let pdfPromise: Promise<pdfjsLib.PDFDocumentProxy>;
let pagePromise = [newUnresolved()];
let pdfPage: pdfjsLib.PDFPageProxy[] = [];
let pageCanvasPromise = [newUnresolved()];
let pageCanvas: HTMLCanvasElement[] = [];

function newUnresolved() {
    let resolve;
    let promise = new Promise((res, rej) => {
        resolve = res;
    });
    return { promise, resolve };
}

const schema = new Schema({
    nodes: {
        // The document is a sequence of regions.
        doc: {
            content: "region*",
            attrs: {
                file: { default: null },
            }
        },
        // Each region is a part of a page (page number and bounding box),
        // along with some text.
        region: {
            content: 'text*',
            attrs: {
                pageNum: { default: null },
                pageImageNode: { default: null },
            },
            toDOM(node) {
                return [
                    'div',
                    { class: 'page' },
                    ['div', {}, node.attrs.pageImageNode],
                    ['div', { class: 'page-contents' }, 0]
                ];
            },
        },
        // Text is just text.
        text: { inline: true },
    },
});

async function canvasForPage(i: number): Promise<HTMLCanvasElement> {
    await pagePromise[i].promise;
    const page = pdfPage[i];
    const viewport = page.getViewport({ scale: 1 });
    const canvas = document.createElement('canvas');
    const desiredWidth = 1000;
    canvas.width = desiredWidth;
    canvas.height = (desiredWidth / viewport.width) * viewport.height;
    const renderContext = {
        canvasContext: canvas.getContext('2d')!,
        viewport: page.getViewport({ scale: desiredWidth / viewport.width }),
    };
    await page.render(renderContext).promise;
    return canvas;
}

async function startPdfRendering(fileUrl: string) {
    console.log('Loading PDF');
    pdfPromise = pdfjsLib.getDocument(fileUrl).promise;
    const pdf = await pdfPromise;
    console.log('Loaded PDF');
    for (let i = 1; i <= pdf.numPages; ++i) {
        pagePromise[i] = newUnresolved();
        pageCanvasPromise[i] = newUnresolved();
    }
    for (let i = 1; i <= pdf.numPages; ++i) {
        pdfPage[i] = await pdf.getPage(i);
        pagePromise[i].resolve();
    }
    for (let i = 1; i <= pdf.numPages; ++i) {
        pageCanvas[i] = await canvasForPage(i);
        pageCanvasPromise[i].resolve();
    }
}

function startPm(fileUrl, parentNode: HTMLElement) {
    let pageNodes: Node[] = [];
    const doc: Node = schema.nodes.doc.createChecked(
        {
            file: fileUrl,
        },
        pageNodes,
    );
    console.log(`Using doc: `, doc);
    const preventPagesDeletion = new Plugin({
        // Alternative: https://discuss.prosemirror.net/t/how-to-prevent-node-deletion/130/9
        filterTransaction: (transaction, state) => {
            // Avoid endless recursion when simulating the effects of the transaction
            if (transaction.getMeta("filteringRequiredNodeDeletion") === true) return true;
            transaction.setMeta("filteringRequiredNodeDeletion", true);

            // Simulate the transaction
            const newState = state.apply(transaction);
            function childPageNodes(node) {
                const ret: number[] = [];
                node.descendants(child => {
                    if (child.type.name === 'page') {
                        ret.push(child.attrs.pageNum);
                    }
                });
                return ret;
            }
            function isEqual(array1: number[], array2: number[]) {
                return array1.length == array2.length && array1.every((value, index) => value == array2[index]);
            }
            // Check that the same page nodes are still present in any order
            return isEqual(
                childPageNodes(state.doc.content).sort(),
                childPageNodes(newState.doc.content).sort()
            )
        }
    });

    const state = EditorState.create({
        doc,
        plugins: [
            history(),
            keymap({ 'Mod-z': undo, 'Mod-y': redo }),
            keymap(baseKeymap),
            preventPagesDeletion,
        ],
    });
    // Display the editor.
    const view = new EditorView(
        parentNode,
        {
            state,
        }
    );
    return view;
}


const docView = document.getElementById('docView') as HTMLElement;

// #region page-interactions
// There are three areas: a PDF drop area, an options container, and a save button.
// With 'E' = "Enabled" and 'D' = "Disabled", they cycle through states:
// State 0: EDD (initial state, before PDF upload)
// State 1: DED (after PDF uploaded)
// State 2: DDD (after PM editor has been started)
// State 3: DDE (when chāyā is ready to be saved)

// Area 1: Drop the PDF file.
const fileInputPdf = document.getElementById('fileInputPdf') as HTMLInputElement;
const dropzonePdf = document.getElementById('dropzone') as HTMLElement;
dropzonePdf.addEventListener('click', () => { fileInputPdf.click(); });
dropzonePdf.addEventListener('dragover', event => { event.preventDefault(); dropzonePdf.classList.add('drag-over'); });
dropzonePdf.addEventListener('dragleave', event => { event.preventDefault(); dropzonePdf.classList.remove('drag-over'); });
dropzonePdf.addEventListener('drop', event => {
    event.preventDefault();
    dropzonePdf.classList.remove('drag-over');
    fileInputPdf.files = event.dataTransfer!.files;
    state0to1(fileInputPdf.files[0]);
});
fileInputPdf.addEventListener('change', (event) => {
    const file = (event.target as HTMLInputElement).files![0];
    state0to1(file);
});
function state0to1(file: File) {
    console.log(file);
    pdfFileName = file.name;
    dropzonePdf.classList.add('disabled');
    dropzonePdf.innerText = `PDF file: ${pdfFileName} of size ${file.size} bytes.`;
    console.assert(file && file.type === 'application/pdf');
    pdfFileUrl = URL.createObjectURL(file);
    startPdfRendering(pdfFileUrl);
    optionsContainer.classList.remove('disabled');
}
function state1to2() {
    optionsContainer.classList.add('disabled');
}
function state2to3() {
    saveChaya.innerHTML = `Save the current <code>.chaya</code> file`;
    saveChaya.classList.remove('disabled');
}

// Area 2: the options for starting an editor
const optionsContainer = document.getElementsByClassName('options-container')[0] as HTMLElement;
const startButton = document.getElementById('startButton') as HTMLButtonElement;
if (true) {
    startButton.addEventListener("click", () => {
        const options = document.querySelectorAll<HTMLInputElement>('input[type="radio"][name="ocr-option"]');
        const selectedOption = Array.from(options).find(option => option.checked)!;
        console.log(`Selected start option: `, selectedOption);
    });
}
const form = document.getElementById("ocrForm") as HTMLFormElement;
form.addEventListener("submit", async event => {
    event.preventDefault(); // Prevent normal form submission
    state1to2();
    const formData = new FormData(form);
    console.log(Array.from(formData.entries()));
    const selectedOption = formData.get('ocr-option')!;
    console.log(`Selected OCR Option: ${selectedOption}`);

    switch (selectedOption.valueOf()) {
        case "load":
            const fileInput = document.getElementById("chaya-file") as HTMLInputElement;
            const file = fileInput.files![0];
            console.log(`.chaya file: ${file.name}`);
            window['view'] = startPm(pdfFileUrl, docView);
            await populateEditorFromChaya(file);
            state2to3();
            break;
        case "tesseract":
            const langCodeInput = document.getElementById("tesseract-lang") as HTMLInputElement;
            const langCode = langCodeInput.value || 'kan+eng';
            console.log(`Using Tesseract with language code ${langCode}`);
            window['view'] = startPm(pdfFileUrl, docView);
            await populateEditorFromTesseract(await pdfPromise, langCode);
            state2to3();
            break;
        case "google":
            const apiKeyInput = document.getElementById("google-api-key") as HTMLInputElement;
            const apiKey = new URLSearchParams(window.location.hash.substring(1)).get('google_api_key') || apiKeyInput.value;
            console.log(`Using Google OCR`);
            window['view'] = startPm(pdfFileUrl, docView);
            await populateEditorFromGoogleOcr(await pdfPromise, apiKey);
            state2to3();
            break;
        default:
            console.error(`Unknown option!`);
    }
});

// Area 3: the save button
const saveChaya = document.getElementById('saveChaya') as HTMLButtonElement;
saveChaya.addEventListener('click', () => {
    const content = JSON.stringify(window['view'].state.doc.toJSON(), null, 2);
    const a = document.createElement('a');
    const file = new Blob([content], { type: 'application/octet-stream' });
    a.href = URL.createObjectURL(file);
    a.download = `${pdfFileName}.chaya`;
    a.click();
    URL.revokeObjectURL(a.href);
});
// #endregion

async function populateEditorFromChaya(file: File) {
    const json = JSON.parse(await file.text());
    let doc = schema.nodeFromJSON(json);

    for (let i = 0; i < doc.content.childCount; ++i) {
        const pageNodeOld: Node = doc.content.child(i);
        console.log(`Read child number ${i}: it is`, pageNodeOld);
        const img = document.createElement('img');
        img.classList.add('page-image');
        const pageNum = pageNodeOld.attrs.pageNum;
        await pageCanvasPromise[pageNum].promise;
        img.src = pageCanvas[pageNum].toDataURL('image/jpeg', 1.0);
        const pageNode = schema.node(
            'region',
            { pageNum: pageNum, pageImageNode: img },
            pageNodeOld.content,
        );

        const view = window['view'];
        const tr = view.state.tr;
        const insertPos = view.state.doc.content.size;
        tr.insert(insertPos, pageNode);
        view.dispatch(tr);
    }
}

async function populateEditorFromTesseract(pdf: pdfjsLib.PDFDocumentProxy, langCode: string) {
    saveChaya.innerText = 'Loading Tesseract';
    const logger = (m) => {
        const s = saveChaya.innerText;
        const prefixLength = s.includes('(') ? s.indexOf('(') : s.length;
        saveChaya.innerText = s.slice(0, prefixLength).trim() + ` (${(m.progress * 100).toFixed(0)}% done)`;
    };
    let worker = await Tesseract.createWorker(langCode, 1/*LSTM_ONLY*/, { logger });
    for (let i = 1; i <= pdf.numPages; i++) {
        saveChaya.innerText = `Running OCR on page ${i} of ${pdf.numPages} (0% done)`;
        const img = document.createElement('img');
        img.classList.add('page-image');
        await pageCanvasPromise[i].promise;
        img.src = pageCanvas[i].toDataURL('image/jpeg', 1.0);
        const { data: { text }, } = await worker.recognize(img.src);
        const pageNode = schema.node('region', { pageNum: i, pageImageNode: img }, schema.text(text));
        const view = window['view'];
        const tr = view.state.tr;
        const insertPos = view.state.doc.content.size;
        tr.insert(insertPos, pageNode);
        // view.updateState(view.state.apply(tr));
        view.dispatch(tr);
    }
    worker.terminate();
}

async function populateEditorFromGoogleOcr(pdf: pdfjsLib.PDFDocumentProxy, apiKey: string) {
    for (let i = 1; i <= pdf.numPages; i++) {
        saveChaya.innerText = `Running OCR on page ${i} of ${pdf.numPages}`;
        const img = document.createElement('img');
        img.classList.add('page-image');
        await pageCanvasPromise[i].promise;
        img.src = pageCanvas[i].toDataURL('image/jpeg', 1.0);
        console.log(img.src);
        // const base64Image = Buffer.from(image).toString('base64');
        const base64Image = img.src.split(',')[1];

        const apiUrl = 'https://vision.googleapis.com/v1/images:annotate?key=' + apiKey;

        const requestData = { requests: [{ image: { content: base64Image }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }] }] };
        const response = await fetch(apiUrl, {
            method: 'POST',
            body: JSON.stringify(requestData),
            headers: { 'Content-Type': 'application/json' }
        });
        const responseData = await response.json();
        console.log(responseData);
        // We have sent a single image request, and requested only DOCUMENT_TEXT_DETECTION, so responses will have only one element.
        console.assert(responseData.responses.length == 1);
        const ocrResponse = responseData.responses[0];
        const text = ocrResponse.fullTextAnnotation.text;

        const pageNode = schema.node('region', { pageNum: i, pageImageNode: img }, schema.text(text));
        const view = window['view'];
        const tr = view.state.tr;
        const insertPos = view.state.doc.content.size;
        tr.insert(insertPos, pageNode);
        // view.updateState(view.state.apply(tr));
        view.dispatch(tr);
    }
}
