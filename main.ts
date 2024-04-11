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

const desiredWidth = 1000;

const schema = new Schema({
    nodes: {
        text: { inline: true },
        page: {
            content: 'text*',
            attrs: {
                pageNum: { default: null },
                pageImage: { default: null },
            },
            toDOM(node) {
                return [
                    'div',
                    { class: 'page' },
                    ['img', { class: 'page-image', src: node.attrs.pageImage }],
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

async function startPm(fileUrl, parentNode) {
    const worker = await Tesseract.createWorker('kan');
    let pageNodes: Node[] = [];

    const pdf = await pdfjsLib.getDocument(fileUrl).promise;

    async function imageForPage(page: pdfjsLib.PDFPageProxy) {
        const viewport = page.getViewport({ scale: 1 });
        const canvas = document.createElement('canvas');
        canvas.width = desiredWidth;
        canvas.height = (desiredWidth / viewport.width) * viewport.height;
        const renderContext = {
            canvasContext: canvas.getContext('2d')!,
            viewport: page.getViewport({ scale: desiredWidth / viewport.width }),
        };
        await page.render(renderContext).promise;
        const imageURL = canvas.toDataURL('image/jpeg', 0.8);
        return imageURL;
    }

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        dropzone.innerText = `Processing page ${i} of ${pdf.numPages}`;
        const imageUrl = await imageForPage(page);

        // const { data: { text }, } = await worker.recognize(imageUrl);
        const text = 'hello';
        const pageNode = schema.node('page', { pageNum: i, pageImage: imageUrl }, schema.text(text));
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
    // await worker.terminate();
    return doc;
}

import Tesseract from 'tesseract.js';

const dropzone = document.getElementById('dropzone') as HTMLElement;
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const docView = document.getElementById('docView') as HTMLElement;

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

async function processFile(file) {
    // Used up. Reload the page to add a different file.
    fileSelectionAllowed = false;
    dropzone.classList.add('disabled');
    dropzone.innerText = 'Processing file...';

    console.assert(file.type === 'application/pdf');
    const fileUrl = URL.createObjectURL(file);
    // await workOnPdf(fileUrl);
    await startPm(fileUrl, docView);
    dropzone.innerText = 'Done.';
}
