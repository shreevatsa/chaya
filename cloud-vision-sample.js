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

async function addLinesFromWords(words: Word[], pageNum: number) {
                await repaintCanvasFromWords(words, pageNum);

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
                                words: line,
                                xmin: Math.min(...line.map(word => word.xmin)),
                                xmax: Math.max(...line.map(word => word.xmax)),
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
                                xmin: line.xmin,
                                xmax: line.xmax,
                }, schema.text(line.text)));

                // Insert lines into chunks.
                const chunkLines: Node[][] = [];
                let curChunkLines: Node[] = [];
                const threshold = 10;
                for (let i = 0; i < lineNodes.length; ++i) {
                                if (i == 0) {
                                                curChunkLines.push(lineNodes[i]);
                                                continue;
                                }
                                if (Math.abs(lineNodes[i].attrs.xmin - lineNodes[i - 1].attrs.xmin) < threshold &&
                                                Math.abs(lineNodes[i].attrs.xmax - lineNodes[i - 1].attrs.xmax) < threshold) {
                                                curChunkLines.push(lineNodes[i]);
                                } else {
                                                chunkLines.push(curChunkLines);
                                                curChunkLines = [];
                                                curChunkLines = [lineNodes[i]];
                                }
                }
                chunkLines.push(curChunkLines);

                const view = window['view'];
                for (let lines of chunkLines) {
                                const chunk = schema.node('chunk', {}, lines);
                                const tr = view.state.tr;
                                const insertPos = view.state.doc.content.size;
                                tr.insert(insertPos, chunk);
                                // view.updateState(view.state.apply(tr));
                                view.dispatch(tr);
                }
}
