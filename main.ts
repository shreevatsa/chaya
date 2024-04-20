import { EditorState, Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import {
    DOMOutputSpec, DOMParser, Fragment, Node, NodeType, Schema, Slice,
} from 'prosemirror-model';
import { keymap } from 'prosemirror-keymap';
import { undo, redo, history } from 'prosemirror-history';
import { baseKeymap } from 'prosemirror-commands';
import * as pdfjsLib from 'pdfjs-dist';
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
import Tesseract from 'tesseract.js';

const desiredWidth = 1000;

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
        text: { inline: true },
        page: {
            content: 'text*',
            attrs: {
                pageNum: { default: null },
                pageImageNode: { default: null },
            },
            toDOM(node) {
                return [
                    'div',
                    { class: 'page' },
                    node.attrs.pageImageNode,
                    ['div', { class: 'page-contents' }, 0]
                ];
            },
        },
        // The document (page) is a nonempty sequence of lines.
        doc: {
            content: "page+",
            attrs: {
                file: { default: null },
            }
        },
    },
});

async function canvasForPage(i: number, numPages: number) {
    console.log(`Loading page ${i} of ${numPages}`);
    await pagePromise[i].promise;
    const page = pdfPage[i];
    console.log(`Loaded page ${i} of ${numPages}`);
    const viewport = page.getViewport({ scale: 1 });
    const canvas = document.createElement('canvas');
    canvas.width = desiredWidth;
    canvas.height = (desiredWidth / viewport.width) * viewport.height;
    const renderContext = {
        canvasContext: canvas.getContext('2d')!,
        viewport: page.getViewport({ scale: desiredWidth / viewport.width }),
    };
    console.log(`Rendering page ${i} of ${numPages}`);
    await page.render(renderContext).promise;
    console.log(`Rendered page ${i} of ${numPages}`);
    return canvas;
}

async function startPdfRendering(fileUrl) {
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
        pageCanvas[i] = await canvasForPage(i, pdf.numPages);
        pageCanvasPromise[i].resolve();
    }
}

async function startPm(fileUrl, parentNode) {
    let later: any[] = [];
    let pageNodes: Node[] = [];
    const pdf = await pdfPromise;

    for (let i = 1; i <= pdf.numPages; i++) {
        const img = document.createElement('img');
        img.classList.add('page-image');
        const pageNode = schema.node('page', { pageNum: i, pageImageNode: img }, schema.text(`(wait for page ${i})`));
        later.push(async () => {
            await pageCanvasPromise[i].promise;
            img.src = pageCanvas[i].toDataURL('image/jpeg', 0.8);
        });
        pageNodes.push(pageNode);
    }
    const doc = schema.nodes.doc.createChecked(
        {
            file: fileUrl,
        },
        pageNodes,
    );
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
    setTimeout(
        async () => {
            for (let i = 0; i < later.length; ++i) {
                await later[i]();
            }
        },
        0);
    return view;
}


const docView = document.getElementById('docView') as HTMLElement;

// Set up the two file input areas.
// Area 1
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
        fileInput.files = event.dataTransfer!.files;
    }
});
fileInput.addEventListener('change', (event) => {
    const file = (event.target as HTMLInputElement).files![0];
    processFile(file);
});
// Area 2
const newSc = document.getElementById('newSc')!;
newSc.addEventListener('click', async event => {
    // Don't want this click to be treated as a click on the parent div (sc dropzone)
    event.stopPropagation();
    // Don't want this click to be treated as a click on the <a href=""></a>
    event.preventDefault();
    // Actual work
    let view = await startPm(pdfFileUrl, docView);
    window['view'] = view;
    console.log('Done creating the PM view');
    setTimeout(() => ocrAllPages(view), 1000);
});
const dropzoneSc = document.getElementById('dropzoneSc')!;
const fileInputSc = document.getElementById('fileInputSc') as HTMLInputElement;
let fileSelectionAllowedSc = true;
dropzoneSc.addEventListener('click', () => { if (fileSelectionAllowedSc) { fileInputSc.click(); } });
dropzoneSc.addEventListener('dragover', event => { event.preventDefault(); if (fileSelectionAllowedSc) { dropzoneSc.classList.add('drag-over'); } });
dropzoneSc.addEventListener('dragleave', event => { event.preventDefault(); if (fileSelectionAllowedSc) { dropzoneSc.classList.remove('drag-over'); } });
dropzoneSc.addEventListener('drop', event => {
    event.preventDefault();
    if (fileSelectionAllowedSc) {
        dropzoneSc.classList.remove('drag-over');
        fileInputSc.files = event.dataTransfer!.files;
    }
});
fileInputSc.addEventListener('change', (event) => {
    const file = (event.target as HTMLInputElement).files![0];
});
// Area 3
const saveSc = document.getElementById('saveSc')!;
saveSc.addEventListener('click', () => {
    const content = JSON.stringify(window['view'].state.doc.toJSON(), null, 2);
    const a = document.createElement('a');
    const file = new Blob([content], { type: 'application/octet-stream' });
    a.href = URL.createObjectURL(file);
    a.download = `${pdfFileName}.sc`;
    a.click();
    URL.revokeObjectURL(a.href);
});

async function processFile(file) {
    // Used up. Reload the page to add a different file.
    fileSelectionAllowed = false;
    dropzone.classList.add('disabled');
    console.log(file);
    console.assert(file && file.type === 'application/pdf');
    pdfFileName = file.name;
    dropzone.innerText = `PDF file: ${pdfFileName} of size ${file.size} bytes.`;
    pdfFileUrl = URL.createObjectURL(file);
    startPdfRendering(pdfFileUrl);
}

async function ocrAllPages(view) {
    let worker = await Tesseract.createWorker('kan');

    const numPages = view.state.doc.childCount;

    for (let i = 1; i <= numPages; ++i) {
        // const pageNode = view.state.doc.content.child(i - 1);
        // let found = { node: pageNode, pos: 0 };

        // Find the position of the node.
        let found;
        view.state.doc.descendants((node, pos) => {
            if (node.attrs.pageNum == i) {
                found = { node, pos };
                if (found) return false;
            }
        });
        if (found) {
            let { node, pos } = found;
            pos += 1;
            let end = pos + node.content.size;
            console.log(`Found page ${i} at position`, found, `= ${pos} to ${end}`);
            // const { data: { text }, } = await worker.recognize(node.attrs.pageImageNode.src);
            const text = `fake ocr result for page ${i}`;
            // const newNode = schema.text(text);
            // const tr = state.tr.replaceWith(pos, end, newNode);
            const tr = view.state.tr;
            tr.replaceRangeWith(pos, end, schema.text(text));
            view.updateState(view.state.apply(tr));
        } else {
            console.log(`Did not find anything for page ${i}`);
        }
    }
    worker.terminate();
}
