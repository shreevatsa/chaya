# bookchop

`bookchop` is a client-side web tool for annotating regions in PDF documents and viewing them.

## Core Architecture

This project is designed with simplicity and maintainability as primary goals. It follows a client-side-only architecture, meaning it does not require a backend server and can be hosted on any static web hosting service (e.g., GitHub Pages, Cloudflare Pages).

The application is split into two distinct parts:

1.  **Annotator (`annotator.html`)**: A tool for uploading a PDF, drawing bounding boxes over regions, and assigning labels to them. It produces an `annotations.json` file.
2.  **Viewer (`viewer.html`)**: A tool for loading a PDF and its corresponding `annotations.json` file to display the annotated regions.

This separation of concerns ensures that the logic for creating annotations is decoupled from the logic for displaying them.

## Data Format (`annotations.json`)

The "contract" between the annotator and the viewer is the `annotations.json` file. This file stores the user-generated data.

### Structure

```json
{
  "metadata": {
    "sourcePdf": "my-book.pdf",
    "annotationVersion": "1.1",
    "annotatedAt": "2025-06-25T10:30:00Z"
  },
  "annotationsByPage": {
    "1": [
      {
        "id": "c7b7f8a0-8e7e-4b9a-8e1a-6a2b3c4d5e6f",
        "x": 0.105,
        "y": 0.152,
        "width": 0.800,
        "height": 0.085,
        "label": "heading: Chapter 1"
      }
    ]
  }
}
```

### Design Decisions

*   **Coordinates as Fractions**: All positional and dimensional values (`x`, `y`, `width`, `height`) are fractions of the page's dimensions (i.e., numbers between 0.0 and 1.0). This makes the annotations resolution-independent.
*   **Simple String Labels**: The `label` is an unopinionated string. Any logic for parsing its meaning (e.g., `"p:1"` for "paragraph 1") resides within the application, not the data format.
*   **Spanning Regions**: Logical regions that span multiple pages (e.g., a paragraph that breaks across a page boundary) are represented by multiple annotation boxes that share the **exact same `label`**.
*   **Associated Regions**: Relationships between different regions (e.g., a paragraph and its endnote) are handled by a consistent labeling convention (e.g., `p:12` and `endnote:12`).
