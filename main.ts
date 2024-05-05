import { EditorState, Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Node, Schema } from 'prosemirror-model';
import { keymap } from 'prosemirror-keymap';
import { undo, redo, history } from 'prosemirror-history';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { schema as basicSchema } from 'prosemirror-schema-basic';

import * as pdfjsLib from 'pdfjs-dist';
// // Option 1: Works fine, but requires server to serve the other file.
// pdfjsLib.GlobalWorkerOptions.workerSrc = './node_modules/pdfjs-dist/build/pdf.worker.mjs';
// // Option 2: Works, with "Warning: Setting up fake worker."
// import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs';
// pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
// // Option 3: Works, with same warning?
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs';
const workerBlob = new Blob([pdfjsWorker], { type: 'application/javascript' });
pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);

import Tesseract from 'tesseract.js';

// "Global" PDF.js state
let pdfFileUrl: string;
let pdfFileName: string;
let pdfPromise: Promise<pdfjsLib.PDFDocumentProxy>;
let pagePromise = [newUnresolved()];
let pageCanvas: HTMLCanvasElement[] = [];
let pageImageUrl: string[] = [];
let pageHeight: number[] = [];

function newUnresolved() {
    let resolve;
    let promise = new Promise((res, rej) => {
        resolve = res;
    });
    return { promise, resolve };
}

async function startPdfRendering(fileUrl: string) {
    console.log('Loading PDF');
    pdfPromise = pdfjsLib.getDocument(fileUrl).promise;
    const pdf = await pdfPromise;
    console.log('Loaded PDF');
    for (let i = 1; i <= pdf.numPages; ++i) {
        pagePromise[i] = newUnresolved();
    }
    for (let i = 1; i <= pdf.numPages; ++i) {
        console.log(`Rendering page ${i} of ${pdf.numPages}`);
        const page = await pdf.getPage(i);
        // Render page onto canvas
        const viewport = page.getViewport({ scale: 1 });
        const canvas = document.createElement('canvas');
        const desiredWidth = 1000;
        canvas.width = desiredWidth;
        canvas.height = (desiredWidth / viewport.width) * viewport.height;
        const renderContext = {
            canvasContext: canvas.getContext('2d')!,
            viewport: page.getViewport({ scale: desiredWidth / viewport.width }),
        };
        pageHeight[i] = canvas.height;
        await page.render(renderContext).promise;
        pageCanvas[i] = canvas;
        canvas.toBlob(blob => {
            pageImageUrl[i] = URL.createObjectURL(blob!);
            pagePromise[i].resolve();
            console.log(`Rendered page ${i} of ${pdf.numPages}`);
        }, 'image/jpeg', 1.0);
    }
}

const schema = new Schema({
    nodes: {
        // At the lowest level is text.
        text: { inline: true },
        // There are lines of text (recognized from words' bounding boxes)
        line: {
            content: 'text*',
            attrs: {
                pageNum: {},
                y1: {},
                y2: {},
            },
            isolating: true,
            toDOM: () => ["div", 0],
        },
        chunk: {
            // Really should be line+, but ProseMirror doesn't like this:
            // https://discuss.prosemirror.net/t/why-only-non-generatable-nodes-in-a-required-position/6021
            content: 'line*',
            attrs: {
                label: { default: null },
            },
            toDOM(node) {
                const ret = document.createElement('div');
                ret.classList.add('page');
                // For now, just uses the first child
                console.assert(node.childCount == 1, node.childCount);
                for (let i = 0; i < node.childCount; ++i) {
                    const line: Node = node.child(i);
                    const foreground = document.createElement('div');
                    foreground.classList.add('page-image');
                    foreground.dataset.pageNum = line.attrs.pageNum;
                    console.assert(typeof pageImageUrl[line.attrs.pageNum] == 'string', line.attrs.pageNum, pageImageUrl[line.attrs.pageNum]);
                    foreground.style.backgroundImage = `url("${pageImageUrl[line.attrs.pageNum]}")`;
                    foreground.style.setProperty('--region-height', `${line.attrs.y2 - line.attrs.y1}px`);
                    foreground.style.setProperty('--position-y', `${line.attrs.y1}px`);
                    ret.appendChild(foreground);
                }
                const contentPlaceholder = document.createElement('div');
                contentPlaceholder.classList.add('page-contents');
                ret.appendChild(contentPlaceholder);
                return { dom: ret, contentDOM: contentPlaceholder };
            },
        },
        // The document is a sequence of chunks.
        doc: {
            content: "chunk*",
            attrs: {
                file: { default: null },
                schemaVersion: { default: '2024.01' },
            }
        },
    },
    marks: {
        strong: basicSchema.spec.marks.get('strong')!,
        em: basicSchema.spec.marks.get('em')!,
    }
});

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
            keymap({ 'Mod-z': undo, 'Mod-y': redo, }),
            keymap({
                'Mod-b': toggleMark(schema.marks.strong),
                'Mod-i': toggleMark(schema.marks.em),
            }),
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
    // view.focus();
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
        const chunk: Node = doc.content.child(i);
        // console.log(`Read child number ${i}: it is`, chunk);
        for (let j = 0; j < chunk.childCount; ++j) {
            const line = chunk.child(j);
            console.log(`Chunk ${i} has page number ${line.attrs.pageNum}, with promise`, pagePromise[line.attrs.pageNum]);
            await pagePromise[line.attrs.pageNum].promise;
        }
        const view = window['view'];
        const tr = view.state.tr;
        const insertPos = view.state.doc.content.size;
        tr.insert(insertPos, chunk);
        view.dispatch(tr);
    }
}

type Word = {
    text: string;
    xmin: number;
    xmax: number;
    ymin: number;
    ymax: number;
};

function addLinesFromWords(words: Word[], pageNum: number) {
    // Retaining the order of words in `words`, partition them into "lines" [y1..y2],
    // such that for every word in `words`,
    // the fraction of it which overlaps a "line" (i.e. ≥y1 or ≤y2) is either 1 or at most 0.4.

    // What fraction of [c..d] overlaps with [a..b].
    function overlapFraction(a, b, c, d) {
        console.assert(a <= b);
        console.assert(c <= d);
        if (d <= a) return 0; // [c, d] [a, b]
        if (c >= b) return 0; // [a, b] [c, d]
        // Only four cases remain.
        console.assert(a >= 0, {}, a, b, c, d);
        console.assert(c >= 0, {}, a, b, c, d);
        if (a <= c && c <= b && b <= d) return (b - c) / (d - c);
        if (a <= c && c <= d && d <= b) return 1;
        if (c <= a && a <= b && b <= d) return 1; // We're not doing (b - a) / (d - c) here.
        if (c <= a && a <= d && d <= b) return (d - a) / (d - c);
        console.assert(false, {}, a, b, c, d);
        return 0;
    }

    let lines: Word[][] = [];
    let currentLine: Word[] = [];
    let currentYmin: number = Number.POSITIVE_INFINITY;
    let currentYmax: number = Number.NEGATIVE_INFINITY;
    for (let word of words) {
        // When there is no current line, we start a new line.
        if (currentLine.length == 0) {
            currentLine = [word];
            currentYmin = word.ymin;
            currentYmax = word.ymax;
            continue;
        }
        // Is this line forced to stay in the current line?
        if (overlapFraction(currentYmin, currentYmax, word.ymin, word.ymax) > 0.4) {
            currentLine.push(word);
            currentYmin = Math.min(currentYmin, word.ymin);
            currentYmax = Math.max(currentYmax, word.ymax);
            continue;
        }
        // Start a new line (optimistically)
        lines.push(currentLine);
        currentLine = [word];
        currentYmin = word.ymin;
        currentYmax = word.ymax;
    }
    if (currentLine.length > 0) {
        lines.push(currentLine);
    }
    console.log('lines before merging', lines);
    // Whether any word in line i overlaps with line j.
    function overlap(i, j) {
        const jmin = Math.min(...lines[j].map(word => word.ymin));
        const jmax = Math.max(...lines[j].map(word => word.ymax));
        for (let word of lines[i]) {
            if (overlapFraction(jmin, jmax, word.ymin, word.ymax) > 0.4) {
                console.log(word, 'on line', i, 'overlaps line', j, 'which has range', jmin, jmax);
                return true;
            }
        }
    }

    // Merge lines that overlap
    outerLoop: while (true) {
        // Adjacent lines that overlap
        for (let j = 1; j < lines.length; ++j) {
            const i = j - 1;
            if (overlap(i, j) || overlap(j, i)) {
                lines = [...lines.slice(0, i), [...lines[i], ...lines[j]], ...lines.slice(j + 1)];
                continue outerLoop; // goto
            }
        }
        // Try two apart, just in case
        for (let i = 0; i < lines.length - 2; ++i) {
            const j = i + 2;
            if (overlap(i, j) || overlap(j, i)) {
                lines = [...lines.slice(0, i), [...lines[i], ...lines[i + 1], ...lines[j]], ...lines.slice(j + 1)];
                continue outerLoop;
            }
        }
        break;
    }
    console.log('lines:', lines);

    const linesWithBox = lines.map(line => ({
        text: line.map(word => word.text).join(' '),
        y1: Math.min(...line.map(word => word.ymin)),
        y2: Math.max(...line.map(word => word.ymax)),
    }));

    // Distribute all the "missing" y-coordinates.
    if (linesWithBox.length > 0) {
        linesWithBox[0].y1 = 0;
        for (let i = 1; i < linesWithBox.length; ++i) {
            const prev = linesWithBox[i - 1].y2;
            const cur = linesWithBox[i].y1;
            if (prev >= cur) continue;
            const avg = prev + (cur - prev) / 2;
            linesWithBox[i - 1].y2 = avg;
            linesWithBox[i].y1 = avg;
        }
        if (linesWithBox.length > 1) {
            const lastBox = linesWithBox[linesWithBox.length - 1];
            lastBox.y2 = Math.max(lastBox.y2, pageHeight[pageNum]);
        }
    }
    console.log(linesWithBox);

    const lineNodes = linesWithBox.map(line => schema.node('line', {
        pageNum: pageNum,
        y1: line.y1,
        y2: line.y2,
    }, schema.text(line.text)));

    // Insert each line.
    const view = window['view'];
    for (let line of lineNodes) {
        const chunk = schema.node('chunk', {}, [line]);
        const tr = view.state.tr;
        const insertPos = view.state.doc.content.size;
        tr.insert(insertPos, chunk);
        // view.updateState(view.state.apply(tr));
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
        await pagePromise[i].promise;
        // const response = await worker.recognize(pageCanvas[i].toDataURL('image/jpeg', 1.0));
        const response = await worker.recognize(pageImageUrl[i], undefined,
            {
                text: false,
                blocks: true,
                layoutBlocks: false,
                hocr: false,
                tsv: false,
                box: false,
                unlv: false,
                osd: false,
                pdf: false,
                imageColor: false,
                imageGrey: false,
                imageBinary: false,
                debug: false,
            });
        console.log('Result from Tesseract', response);
        const words: Word[] = response.data.words.map(word => ({
            text: word.text,
            xmin: word.bbox.x0,
            xmax: word.bbox.x1,
            ymin: word.bbox.y0,
            ymax: word.bbox.y1,
        }));
        addLinesFromWords(words, i);
    }
    worker.terminate();
}

async function populateEditorFromGoogleOcr(pdf: pdfjsLib.PDFDocumentProxy, apiKey: string) {
    for (let i = 1; i <= pdf.numPages; i++) {
        saveChaya.innerText = `Running OCR on page ${i} of ${pdf.numPages}`;
        await pagePromise[i].promise;
        const url = pageCanvas[i].toDataURL('image/jpeg', 1.0);
        // const base64Image = Buffer.from(image).toString('base64');
        const base64Image = url.split(',')[1];

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
        let words: Word[] = [];
        for (let word of ocrResponse.textAnnotations.slice(1)) {
            let box = ('boundingPoly' in word) ? word.boundingPoly : word.boundingBox;
            words.push({
                text: word.description,
                xmin: Math.min(...box.vertices.map(({ x: v }) => v)),
                xmax: Math.max(...box.vertices.map(({ x: v }) => v)),
                ymin: Math.min(...box.vertices.map(({ y: v }) => v)),
                ymax: Math.max(...box.vertices.map(({ y: v }) => v)),
            });
        }
        const text = ocrResponse.fullTextAnnotation.text;
        addLinesFromWords(words, i);
    }
}
