import { EditorState, Plugin, Command, Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Node, Schema, NodeSpec, NodeType, MarkType, Attrs, Fragment, Slice } from 'prosemirror-model';
import { keymap } from 'prosemirror-keymap';
import { history } from 'prosemirror-history';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import { dropCursor } from "prosemirror-dropcursor";
import { gapCursor } from "prosemirror-gapcursor";
import {
    menuBar, wrapItem, blockTypeItem, Dropdown, DropdownSubmenu, joinUpItem, liftItem,
    selectParentNodeItem, undoItem, redoItem, icons, MenuItem, MenuElement, MenuItemSpec
} from "prosemirror-menu"
import { inputRules, smartQuotes, emDash, ellipsis, undoInputRule, InputRule } from "prosemirror-inputrules";

import { buildKeymap, buildMenuItems } from "prosemirror-example-setup";

import 'prosemirror-view/style/prosemirror.css';
import 'prosemirror-example-setup/style/style.css';
import "prosemirror-menu/style/menu.css";

// // Based on https://github.com/ProseMirror/prosemirror-inputrules/blob/8433778a3ce4e45c0188341b72fd71da3a440b5b/src/rulebuilders.ts#L46
// function textblockTypeInputRule(
//     regexp: RegExp,
//     nodeType: NodeType,
//     getAttrs: Attrs | null | ((match: RegExpMatchArray) => Attrs | null) = null
// ) {
//     return new InputRule(regexp, (state, match, start, end) => {
//         let $start = state.doc.resolve(start)
//         let attrs = getAttrs instanceof Function ? getAttrs(match) : getAttrs
//         if (!$start.node(-1).canReplaceWith($start.index(-1), $start.indexAfter(-1), nodeType)) return null
//         return state.tr
//             .delete(start, end)
//             .setBlockType(start, start, nodeType, attrs)
//     })
// }

// Based on https://github.com/ProseMirror/prosemirror-example-setup/blob/master/src/inputrules.ts
function buildInputRules(schema: Schema) {
    let rules = smartQuotes.concat(ellipsis, emDash);
    // rules.push(textblockTypeInputRule(
    //     /*regexp*/new RegExp("^(#{1,6})\\s$"),
    //     /*nodeType*/schema.nodes.heading,
    //     /*getAttrs*/match => ({ level: match[1].length })));
    return inputRules({ rules });
}


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

let isDirty = false;

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
        // const widthProperty = getComputedStyle(document.documentElement).getPropertyValue('--default-width');
        // const desiredWidth = parseInt(widthProperty);
        //console.log(`Got width ${widthProperty} parsed as ${desiredWidth}`);
        const desiredWidth = 1000;
        canvas.width = desiredWidth;
        canvas.height = (desiredWidth / viewport.width) * viewport.height;
        // console.log(`canvas: ${canvas.width} x ${canvas.height}, viewport: ${viewport.width} x ${viewport.height}`);
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

// Merge the ranges of each "line" in chunk
function combinedPageRanges(chunk: Node) {
    const ranges = {};
    for (let i = 0; i < chunk.childCount; ++i) {
        const line: Node = chunk.child(i);
        const pageNum = line.attrs.pageNum;
        if (!pageNum) continue;
        const empty = { y1: Number.POSITIVE_INFINITY, y2: Number.NEGATIVE_INFINITY };
        const y1 = Math.min((ranges[pageNum] || empty).y1, parseInt(line.attrs.y1));
        const y2 = Math.max((ranges[pageNum] || empty).y2, parseInt(line.attrs.y2));
        ranges[pageNum] = { y1, y2 };
    }
    return ranges;
}

const chunkDepth = 1;
const schema = new Schema({
    nodes: {
        // At the lowest level is text.
        text: {
            group: "inline"
        } as NodeSpec,
        // There are lines of text (recognized from words' bounding boxes)
        line: {
            content: 'inline*',
            attrs: {
                pageNum: {},
                y1: {},
                y2: {},
                words: { default: [] },
            },
            // Seems to help guard against accidental deletion, but need to think more.
            isolating: true,
            toDOM(node) {
                const ret = document.createElement('div');
                ret.classList.add('line');
                const { pageNum, y1, y2 } = node.attrs;
                const foreground = document.createElement('div');
                foreground.classList.add('line-image');
                foreground.dataset.pageNum = pageNum.toString();
                console.assert(typeof pageImageUrl[pageNum] == 'string', pageNum, pageImageUrl[pageNum]);
                foreground.style.backgroundImage = `url("${pageImageUrl[pageNum]}")`;
                foreground.style.setProperty('--region-height', `${y2 - y1}px`);
                foreground.style.setProperty('--position-y', `${y1}px`);
                ret.appendChild(foreground);
                const contentPlaceholder = document.createElement('div');
                contentPlaceholder.classList.add('line-contents');
                ret.appendChild(contentPlaceholder);
                return { dom: ret, contentDOM: contentPlaceholder };
            },
        },
        chunk: {
            // Really should be nonempty, but ProseMirror doesn't like this:
            // https://discuss.prosemirror.net/t/why-only-non-generatable-nodes-in-a-required-position/6021
            content: 'line*',
            attrs: {
                chunkType: { default: 'paragraph' },
                // Just a hack / something to update when chunks join
                numChildren: { default: null },
            },
            toDOM(node) {
                const ret = document.createElement('div');
                ret.classList.add('chunk');
                ret.classList.add(`chunk-type-${node.attrs.chunkType}`);
                const images = document.createElement('div');
                images.classList.add('chunk-images');
                ret.appendChild(images);
                // console.assert(node.childCount > 0, node.childCount);
                let pageRanges = combinedPageRanges(node);
                for (let pageNum of Object.keys(pageRanges).map(Number).sort((a, b) => a - b)) {
                    const { y1, y2 } = pageRanges[pageNum];
                    // console.log(`Page ${pageNum}: y1=${y1}, y2=${y2}`);
                    const foreground = document.createElement('div');
                    foreground.classList.add('chunk-image');
                    foreground.dataset.pageNum = pageNum.toString();
                    console.assert(typeof pageImageUrl[pageNum] == 'string', pageNum, pageImageUrl[pageNum]);
                    foreground.style.backgroundImage = `url("${pageImageUrl[pageNum]}")`;
                    foreground.style.setProperty('--region-height', `${y2 - y1}px`);
                    foreground.style.setProperty('--position-y', `${y1}px`);
                    images.appendChild(foreground);
                }
                const contentPlaceholder = document.createElement('div');
                contentPlaceholder.classList.add('chunk-contents');
                ret.appendChild(contentPlaceholder);
                return { dom: ret, contentDOM: contentPlaceholder };
            },
        },
        // The document is a sequence of chunks.
        doc: {
            content: "chunk*",
            attrs: {
                file: { default: null },
                schemaVersion: { default: '2024.02' },
            }
        },
    },
    marks: {
        strong: basicSchema.spec.marks.get('strong')!,
        em: basicSchema.spec.marks.get('em')!,
    }
});

function updateChunkAttrPlugin() {
    return new Plugin({
        appendTransaction(transactions, oldState, newState) {
            let transactionToAppend: Transaction | null = null;
            transactions.forEach(tx => {
                tx.steps.forEach((step) => {
                    step.getMap().forEach((oldStart, oldEnd, newStart, newEnd) => {
                        newState.doc.nodesBetween(newStart, newEnd, (node, pos) => {
                            if (node.type.name === "chunk") {
                                const newAttrValue = node.childCount;
                                if (node.attrs.numChildren !== newAttrValue) {
                                    if (!transactionToAppend) transactionToAppend = newState.tr;
                                    transactionToAppend.setNodeAttribute(pos, 'numChildren', newAttrValue);
                                }
                            }
                        });
                    });
                });
            });
            return transactionToAppend;
        }
    });
}

const unsavedChangesPlugin = new Plugin({
    appendTransaction(transactions, oldState, newState) {
        for (let transaction of transactions) {
            if (transaction.docChanged) {
                isDirty = true;
                break;
            }
        }
        // Nothing to append
        return null;
    }
});
window.addEventListener("beforeunload", (event) => {
    if (isDirty) {
        event.preventDefault();
    }
});

const joinChunks: Command = (state, dispatch) => {
    const { from, to } = state.selection;
    let allLines: Node[] = [];
    let firstChunkStart: number | null = null;
    let lastChunkEnd: number | null = null;
    state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type.name === 'chunk') {
            if (firstChunkStart === null) {
                firstChunkStart = pos;
            }
            lastChunkEnd = pos + node.nodeSize;
            for (let i = 0; i < node.childCount; ++i) {
                allLines.push(node.child(i));
            }
        }
    });
    if (dispatch && firstChunkStart !== null && lastChunkEnd !== null) {
        const newChunk = state.schema.nodes.chunk.create(null, allLines);
        const fragment = Fragment.from(newChunk);
        const slice = new Slice(fragment, 0, 0);  // a slice with no open start or end
        const tr = state.tr.replaceRange(firstChunkStart, lastChunkEnd, slice);
        dispatch(tr);
        return true;
    }
    return false;
};

const splitChunkCommand: Command = (state, dispatch) => {
    const { selection, doc } = state;
    let rpos = selection.$anchor;
    // Find the chunk node that contains the selection
    let chunkPos = rpos.before(chunkDepth);
    let chunkNode = rpos.node(chunkDepth);
    console.log(`Node we got at position`, chunkPos, `is`, chunkNode, '=?=', doc.nodeAt(chunkPos));
    if (chunkNode.type.name !== "chunk") {
        console.log(`Node was: `, chunkNode);
        return false;
    }
    // Prepare new chunks based on lines
    let newChunks: Node[] = [];
    chunkNode.forEach((lineNode, _offset) => {
        const newChunk = schema.nodes.chunk.create(
            { chunkType: chunkNode.attrs.chunkType, numChildren: 1 },
            schema.nodes.line.create(lineNode.attrs, lineNode.content)
        );
        newChunks.push(newChunk);
    });
    const newContent = new Slice(Fragment.fromArray(newChunks), 0, 0);

    if (dispatch) {
        console.log(`Deleting one node with content`, chunkNode.textContent, `and inserting ${newChunks.length} nodes`);
        dispatch(state.tr.replaceRange(chunkPos, chunkPos + chunkNode.nodeSize, newContent));
        return true;
    }
    return false;
};



const setChunkType: (chunkType: string) => Command = (chunkType: string) => ((state, dispatch) => {
    // Avoid having to decide when selection spans multiple chunks.
    // TODO: Replace with check for whether start and end are in the same chunk.
    if (!state.selection.empty) return false;
    const chunk = state.selection.$anchor.node(chunkDepth);
    // TODO: Is this safe? Seems to work (.start(1) is the position of the line, so -1).
    const pos = state.selection.$anchor.start(chunkDepth) - 1;
    console.log(`Obtained a chunk node:`, chunk, 'at position', pos, ': ', state.doc.nodeAt(pos));
    if (dispatch) {
        console.log(`Setting chunkType to ${chunkType}`);
        const tr = state.tr.setNodeAttribute(pos, 'chunkType', chunkType);
        dispatch(tr);
        return true;
    }
    return false;
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
                    if (child.type.name === 'line') {
                        ret.push(child.attrs.pageNum);
                    }
                });
                return ret;
            }
            function isEqual(array1: number[], array2: number[]) {
                return array1.length == array2.length && array1.every((value, index) => value == array2[index]);
            }
            // Check that the same line nodes are still present in any order
            const ret = isEqual(
                childPageNodes(state.doc.content).sort(),
                childPageNodes(newState.doc.content).sort()
            );
            return ret;
        }
    });

    const setImageViewOption = (value: number) => () => {
        document.getElementById('docView')!.setAttribute('data-image-view-mode', value.toString());
    };
    const menu: MenuElement[][] = [];
    menu.push([new MenuItem({
        run: saveFile,
        title: 'Save the current .chaya file',
        label: '💾'
    })]);
    menu.push([new Dropdown(
        [
            new MenuItem({ label: 'None (reading mode)', run: setImageViewOption(0) }),
            new MenuItem({ label: 'Beside text (chunk by chunk)', run: setImageViewOption(1) }),
            new MenuItem({ label: 'Beside text (line by line)', run: setImageViewOption(2) }),
            new MenuItem({ label: 'Above text (chunk by chunk)', run: setImageViewOption(3) }),
            new MenuItem({ label: 'Above text (line by line)', run: setImageViewOption(4) }),
        ],
        { label: "Images" }
    )]);
    // Keep this at the end because the "selectParentNode" comes and goes.
    menu.push(...buildMenuItems(schema).fullMenu);
    menu.push([
        new MenuItem({
        run: joinChunks,
        title: 'Join selected chunks together',
        label: '⇥⇤'
        }),
        new MenuItem({
            run: splitChunkCommand,
            title: 'Split into single-line chunks',
            label: '⇤⇥',
        }),
    ]);
    menu.push([new Dropdown(
        [
            new MenuItem({ label: 'Paragraph', run: setChunkType('paragraph') }),
            new MenuItem({ label: 'Verse', run: setChunkType('verse') }),
            new MenuItem({ label: 'Heading', run: setChunkType('heading') }),
        ],
        { label: "Region type" },
    )]);

    const state = EditorState.create({
        doc,
        plugins: [
            buildInputRules(schema),
            keymap(buildKeymap(schema)),
            keymap(baseKeymap),
            dropCursor(),
            gapCursor(),
            menuBar({
                floating: true,
                content: menu
            }),
            history(),
            new Plugin({
                props: {
                    attributes: { class: "ProseMirror-example-setup-style" }
                }
            }),
            // preventPagesDeletion,
            updateChunkAttrPlugin(),
            unsavedChangesPlugin,
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
function saveFile() {
    if (saveChaya.classList.contains('disabled')) {
        alert(`Cannot save yet. Current status is: ${saveChaya.innerText}`);
        return;
    }
    const content = JSON.stringify(window['view'].state.doc.toJSON(), null, 2);
    const a = document.createElement('a');
    const file = new Blob([content], { type: 'application/octet-stream' });
    a.href = URL.createObjectURL(file);
    a.download = `${pdfFileName}.chaya`;
    a.click();
    URL.revokeObjectURL(a.href);
    isDirty = false;
}
saveChaya.addEventListener('click', saveFile);
// #endregion

function zero() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

async function populateEditorFromChaya(file: File) {
    saveChaya.innerText = 'Parsing saved file...';
    const json = JSON.parse(await file.text());
    saveChaya.innerText = 'Creating schema...';
    let doc = schema.nodeFromJSON(json);
    await zero();
    const numChunks = doc.content.childCount;

    for (let i = 0; i < numChunks; ++i) {
        saveChaya.innerText = `Adding chunk ${i} of ${numChunks}`;
        await zero();
        const chunk: Node = doc.content.child(i);
        // console.log(`Read child number ${i}: it is`, chunk);
        for (let j = 0; j < chunk.childCount; ++j) {
            const line = chunk.child(j);
            console.log(`Chunk ${i} has page number ${line.attrs.pageNum}, currently ${saveChaya.innerText}`);
            if (line.attrs.pageNum in pagePromise) {
                await pagePromise[line.attrs.pageNum].promise;
            } else {
                console.error(`No page promise for pageNum`, line.attrs.pageNum, 'for', line, 'in', chunk);
            }
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

async function addLinesFromWords(words: Word[], pageNum: number) {
    const originalCanvas = pageCanvas[pageNum];
    const highlightedCanvas = document.createElement('canvas');
    highlightedCanvas.width = originalCanvas.width;
    highlightedCanvas.height = originalCanvas.height;
    const highlightedCtx = highlightedCanvas.getContext('2d')!;
    // Draw the dimmed original image on the highlighted canvas
    highlightedCtx.drawImage(originalCanvas, 0, 0);
    highlightedCtx.globalAlpha = 0.5; // Change opacity to dim the image
    highlightedCtx.fillStyle = 'rgba(0, 0, 0, 0.5)'; // Change color if needed
    highlightedCtx.fillRect(0, 0, highlightedCanvas.width, highlightedCanvas.height);
    highlightedCtx.globalAlpha = 1; // Reset opacity
    // Restore the original image in the regions corresponding to the words
    const eps = Math.min(originalCanvas.width, originalCanvas.height) * 2e-3;
    words.forEach(word => {
        highlightedCtx.drawImage(
            originalCanvas,
            word.xmin - eps, word.ymin - eps, word.xmax - word.xmin + 2 * eps, word.ymax - word.ymin + 2 * eps, // source region
            word.xmin - eps, word.ymin - eps, word.xmax - word.xmin + 2 * eps, word.ymax - word.ymin + 2 * eps  // destination region
        );
    });
    pageCanvas[pageNum] = highlightedCanvas;
    const promise = newUnresolved();
    highlightedCanvas.toBlob(blob => {
        pageImageUrl[pageNum] = URL.createObjectURL(blob!);
        console.log(`Re-rendered page ${pageNum}`);
        promise.resolve();
    }, 'image/jpeg', 1.0);
    await promise.promise;

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
    function overlap(i, j, before?) {
        const jmin = Math.min(...lines[j].map(word => word.ymin));
        const jmax = Math.max(...lines[j].map(word => word.ymax));
        for (let word of lines[i]) {
            if (overlapFraction(jmin, jmax, word.ymin, word.ymax) > 0.4) {
                console.log(word, 'on line', i, 'overlaps line', j, 'which has range', jmin, jmax);
                return true;
            }
        }
        // Does box j occur *above* box i?
        if (before) {
            const imin = Math.min(...lines[i].map(word => word.ymin));
            const imax = Math.max(...lines[i].map(word => word.ymax));
            if (jmin < imin || jmax < imax) return true;
        }
    }

    // Merge lines that overlap
    outerLoop: while (true) {
        // Adjacent lines that overlap
        for (let j = 1; j < lines.length; ++j) {
            const i = j - 1;
            if (overlap(i, j, true) || overlap(j, i)) {
                lines = [...lines.slice(0, i), [...lines[i], ...lines[j]], ...lines.slice(j + 1)];
                continue outerLoop; // goto
            }
        }
        break;
    }
    console.log('lines:', lines);

    const linesWithBox = lines.map(line => ({
        text: line.map(word => word.text).join(' '),
        y1: Math.min(...line.map(word => word.ymin)),
        y2: Math.max(...line.map(word => word.ymax)),
        words: line
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
        words: line.words,
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
        await addLinesFromWords(words, i);
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
        // const text = ocrResponse.fullTextAnnotation.text;
        await addLinesFromWords(words, i);
    }
}
