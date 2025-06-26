declare module '*/pdf.mjs' {
    export interface PDFDocumentProxy {
        numPages: number;
        getPage(pageNumber: number): Promise<PDFPageProxy>;
    }

    export interface PDFPageProxy {
        getViewport(params: { scale: number }): any;
        render(params: any): RenderTask;
    }

    export interface RenderTask {
        promise: Promise<void>;
    }

    export function getDocument(src: any): any;
    export const GlobalWorkerOptions: any;
}

declare module '*/pdf.worker.mjs' {
    const pdfjsWorker: any;
    export default pdfjsWorker;
}
